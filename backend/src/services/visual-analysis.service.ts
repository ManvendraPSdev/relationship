import path from 'node:path';
import sharp from 'sharp';
import { env } from '../config/env';
import { visualModelAnalysisSchema } from '../schemas/analysis.schema';
import type {
  AIProvider,
  PreparedVisualFrame,
  VisualAnalysisResult,
} from '../types/analysis.types';
import { listFrameFilenames } from '../utils/file.utils';
import { aiClientService } from './ai-client.service';

interface VisualAnalysisOptions {
  maxFrames: number;
  maxDimension: number;
  jpegQuality: number;
  maxFrameBytes: number;
  duplicateThreshold: number;
}

const defaultOptions: VisualAnalysisOptions = {
  maxFrames: env.MAX_ANALYSIS_FRAMES,
  maxDimension: env.ANALYSIS_FRAME_MAX_DIMENSION,
  jpegQuality: env.ANALYSIS_JPEG_QUALITY,
  maxFrameBytes: env.MAX_ANALYSIS_FRAME_BYTES,
  duplicateThreshold: env.VISUAL_FRAME_DIFF_THRESHOLD,
};

function evenlySpacedIndexes(total: number, count: number): number[] {
  if (total <= count) return Array.from({ length: total }, (_, index) => index);
  if (count === 1) return [Math.floor(total / 2)];

  return [...new Set(Array.from({ length: count }, (_, index) => (
    Math.round((index * (total - 1)) / (count - 1))
  )))];
}

function averagePixelDifference(left: Buffer, right: Buffer): number {
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference += Math.abs(left[index] - right[index]);
  }
  return difference / left.length;
}

export class VisualAnalysisService {
  constructor(
    private readonly provider: AIProvider = aiClientService,
    private readonly options: VisualAnalysisOptions = defaultOptions,
  ) {}

  async analyze(framesDirectory: string): Promise<VisualAnalysisResult> {
    let selectedFrameCount = 0;

    try {
      const filenames = await listFrameFilenames(framesDirectory);
      if (filenames.length === 0) {
        return { status: 'NO_FRAMES', selectedFrameCount: 0, analysis: null, error: null };
      }

      const candidateIndexes = evenlySpacedIndexes(filenames.length, Math.min(
        filenames.length,
        this.options.maxFrames * 3,
      ));
      const frames: PreparedVisualFrame[] = [];
      const signatures: Buffer[] = [];

      for (const candidateIndex of candidateIndexes) {
        const framePath = path.join(framesDirectory, filenames[candidateIndex]);
        try {
          const signature = await sharp(framePath)
            .resize(16, 16, { fit: 'fill' })
            .grayscale()
            .raw()
            .toBuffer();

          const isDuplicate = signatures.some((selectedSignature) => (
            averagePixelDifference(signature, selectedSignature) < this.options.duplicateThreshold
          ));
          if (isDuplicate) continue;

          const jpeg = await this.compressFrame(framePath);
          frames.push({
            dataUrl: `data:image/jpeg;base64,${jpeg.toString('base64')}`,
            sourceIndex: candidateIndex + 1,
          });
          signatures.push(signature);
          if (frames.length === this.options.maxFrames) break;
        } catch {
          console.warn(`[${new Date().toISOString()}] [ai] Skipping unreadable extracted frame ${filenames[candidateIndex]}.`);
        }
      }

      selectedFrameCount = frames.length;
      if (frames.length === 0) throw new Error('No extracted frames could be prepared.');

      const analysis = visualModelAnalysisSchema.parse(await this.provider.analyzeVisualFrames(frames));
      return { status: 'COMPLETED', selectedFrameCount, analysis, error: null };
    } catch (error) {
      console.warn(`[${new Date().toISOString()}] [ai] Visual analysis unavailable: ${error instanceof Error ? error.message : 'unknown error'}`);
      return {
        status: 'FAILED',
        selectedFrameCount,
        analysis: null,
        error: 'Visual analysis was unavailable for this Reel.',
      };
    }
  }

  private async compressFrame(framePath: string): Promise<Buffer> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const maxDimension = Math.max(256, Math.floor(this.options.maxDimension * 0.75 ** attempt));
      const quality = Math.max(30, this.options.jpegQuality - attempt * 10);
      const jpeg = await sharp(framePath)
        .rotate()
        .resize({
          width: maxDimension,
          height: maxDimension,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality })
        .toBuffer();

      if (jpeg.byteLength <= this.options.maxFrameBytes) return jpeg;
    }

    throw new Error('Frame exceeds the analysis request size limit.');
  }
}

export const visualAnalysisService = new VisualAnalysisService();
