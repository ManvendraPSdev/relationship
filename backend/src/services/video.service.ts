import path from 'node:path';
import { promises as fs } from 'node:fs';
import { z } from 'zod';
import { env } from '../config/env';
import type {
  ProcessingStatus,
  SupportedVideoExtension,
  VideoAnalysisResponse,
  VideoJob,
  VideoProcessingInfo,
} from '../types/video.types';
import {
  listFrameFilenames,
  removeDirectoryIfExists,
  removeFileIfExists,
  toRelativeDirectory,
  writeJsonFile,
} from '../utils/file.utils';
import { HttpError } from '../utils/http-error.utils';
import { ffmpegService, VideoValidationError } from './ffmpeg.service';
import { AIAnalysisError, reelAnalysisService } from './reel-analysis.service';

function log(videoId: string, message: string): void {
  console.log(`[${new Date().toISOString()}] [video:${videoId}] ${message}`);
}

class VideoService {
  private readonly jobs = new Map<string, VideoJob>();

  acceptUpload(file: Express.Multer.File, caption: string | null = null): VideoProcessingInfo {
    const extension = path.extname(file.filename).toLowerCase() as SupportedVideoExtension;
    const videoId = z.string().uuid().parse(path.basename(file.filename, extension));
    const now = new Date().toISOString();
    const job: VideoJob = {
      videoId,
      status: 'UPLOADED',
      uploadPath: path.join(env.uploadPath, file.filename),
      extension,
      createdAt: now,
      updatedAt: now,
      metadata: null,
      audio: null,
      frames: null,
      caption,
      analysis: null,
      error: null,
    };

    this.jobs.set(videoId, job);
    log(videoId, `Upload accepted (${file.size} bytes).`);
    this.updateStatus(job, 'PROCESSING');
    this.scheduleProcessing(videoId);
    return this.toProcessingInfo(job);
  }

  getVideo(videoId: string): VideoProcessingInfo {
    return this.toProcessingInfo(this.getJob(videoId));
  }

  getStatus(videoId: string): Pick<VideoProcessingInfo, 'videoId' | 'status' | 'updatedAt' | 'error'> {
    const job = this.getJob(videoId);
    return {
      videoId: job.videoId,
      status: job.status,
      updatedAt: job.updatedAt,
      error: job.error,
    };
  }

  getAnalysis(videoId: string): VideoAnalysisResponse {
    const job = this.getJob(videoId);
    if (job.status === 'FAILED') {
      throw new HttpError(409, job.error ?? 'Reel analysis failed.');
    }
    if (job.status === 'COMPLETED' && !job.analysis) {
      throw new HttpError(500, 'The completed Reel analysis is unavailable.');
    }

    return {
      videoId,
      status: job.status,
      analysis: job.analysis,
    };
  }

  private scheduleProcessing(videoId: string): void {
    // Keep queue dispatch isolated so BullMQ can replace this in a later milestone.
    setImmediate(() => {
      void this.processVideo(videoId);
    });
  }

  private async processVideo(videoId: string): Promise<void> {
    const job = this.getJob(videoId);
    const processingDirectory = path.join(env.extractedPath, videoId);
    const framesDirectory = path.join(processingDirectory, 'frames');
    const audioPath = path.join(processingDirectory, 'audio.mp3');

    try {
      log(videoId, 'Inspecting video with FFprobe.');
      job.metadata = await ffmpegService.probeVideo(job.uploadPath, job.extension);
      job.updatedAt = new Date().toISOString();

      await fs.mkdir(framesDirectory, { recursive: true });

      if (job.metadata.audioCodec) {
        log(videoId, 'Extracting MP3 audio.');
        await ffmpegService.extractAudio(job.uploadPath, audioPath);
        job.audio = { available: true, filename: 'audio.mp3' };
      } else {
        log(videoId, 'No audio stream found; skipping audio extraction.');
        job.audio = { available: false, filename: null };
      }

      log(videoId, 'Extracting one JPEG frame per second.');
      await ffmpegService.extractFrames(job.uploadPath, path.join(framesDirectory, 'frame_%03d.jpg'));
      let frameFilenames = await listFrameFilenames(framesDirectory);

      if (frameFilenames.length === 0) {
        await ffmpegService.extractFirstFrame(job.uploadPath, path.join(framesDirectory, 'frame_001.jpg'));
        frameFilenames = await listFrameFilenames(framesDirectory);
      }

      job.frames = {
        count: frameFilenames.length,
        directory: toRelativeDirectory(framesDirectory),
      };

      job.analysis = await reelAnalysisService.analyze(videoId, {
        audioPath: job.audio.available ? audioPath : null,
        framesDirectory,
        metadata: job.metadata,
        caption: job.caption,
      }, (stage) => this.updateStatus(job, stage));

      const completedAt = new Date().toISOString();
      await writeJsonFile(path.join(processingDirectory, 'analysis.json'), job.analysis);
      await writeJsonFile(path.join(processingDirectory, 'metadata.json'), {
        videoId,
        status: 'COMPLETED',
        createdAt: job.createdAt,
        completedAt,
        metadata: job.metadata,
        audio: job.audio,
        frames: job.frames,
        analysis: 'analysis.json',
      });

      this.updateStatus(job, 'COMPLETED');
      log(videoId, `Processing and AI analysis completed with ${frameFilenames.length} frame(s); audio=${job.audio.available}.`);
    } catch (error) {
      const isValidationError = error instanceof VideoValidationError;
      const isAnalysisError = error instanceof AIAnalysisError;
      const preserveExtractedAssets = isAnalysisError && job.frames !== null;
      this.updateStatus(job, 'FAILED');
      job.error = isValidationError || isAnalysisError
        ? error.message
        : 'Video processing failed. Check server media tool configuration and try again.';
      job.analysis = null;

      console.error(`[${new Date().toISOString()}] [video:${videoId}] Processing failed.`, error);

      if (preserveExtractedAssets) {
        try {
          await writeJsonFile(path.join(processingDirectory, 'metadata.json'), {
            videoId,
            status: 'FAILED',
            createdAt: job.createdAt,
            failedAt: job.updatedAt,
            metadata: job.metadata,
            audio: job.audio,
            frames: job.frames,
            analysis: null,
            error: job.error,
          });
        } catch (metadataError) {
          console.error(`[${new Date().toISOString()}] [video:${videoId}] Unable to persist failure metadata.`, metadataError);
        }
      } else {
        job.audio = null;
        job.frames = null;
        await this.cleanupFailedProcessing(job, processingDirectory, isValidationError);
      }
    }
  }

  private async cleanupFailedProcessing(
    job: VideoJob,
    processingDirectory: string,
    removeUpload: boolean,
  ): Promise<void> {
    try {
      await removeDirectoryIfExists(processingDirectory);
      if (removeUpload) await removeFileIfExists(job.uploadPath);
    } catch (cleanupError) {
      console.error(`[${new Date().toISOString()}] [video:${job.videoId}] Cleanup failed.`, cleanupError);
    }
  }

  private getJob(videoId: string): VideoJob {
    const job = this.jobs.get(videoId);
    if (!job) throw new HttpError(404, 'Video not found.');
    return job;
  }

  private updateStatus(job: VideoJob, status: ProcessingStatus): void {
    job.status = status;
    job.updatedAt = new Date().toISOString();
  }

  private toProcessingInfo(job: VideoJob): VideoProcessingInfo {
    return {
      videoId: job.videoId,
      status: job.status,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      metadata: job.metadata,
      audio: job.audio,
      frames: job.frames,
      analysisAvailable: Boolean(job.analysis),
      error: job.error,
    };
  }
}

export const videoService = new VideoService();
