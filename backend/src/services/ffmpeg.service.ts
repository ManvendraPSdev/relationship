import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { env } from '../config/env';
import type { SupportedVideoExtension, VideoMetadata } from '../types/video.types';

interface CommandResult {
  stdout: string;
  stderr: string;
}

interface ProbeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  r_frame_rate?: string;
}

interface ProbeResult {
  streams?: ProbeStream[];
  format?: {
    duration?: string;
    size?: string;
    format_name?: string;
  };
}

class MediaCommandError extends Error {}
class MediaToolUnavailableError extends Error {}
export class VideoValidationError extends Error {}

function runMediaCommand(command: string, args: string[], timeoutMs = env.FFMPEG_TIMEOUT_MS): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-16_000);
    });
    child.on('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timeout);
      if (error.code === 'ENOENT') {
        reject(new MediaToolUnavailableError(`${command} is not installed or is not executable.`));
        return;
      }
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(new MediaCommandError(`${command} exceeded the ${timeoutMs} ms execution timeout.`));
        return;
      }
      if (code !== 0) {
        reject(new MediaCommandError(`${command} exited with code ${code}: ${stderr}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function parseFrameRate(stream: ProbeStream): number {
  const rational = stream.avg_frame_rate && stream.avg_frame_rate !== '0/0'
    ? stream.avg_frame_rate
    : stream.r_frame_rate;
  if (!rational) return 0;

  const [numerator, denominator] = rational.split('/').map(Number);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 1000;
}

async function probeVideo(uploadPath: string, extension: SupportedVideoExtension): Promise<VideoMetadata> {
  let result: CommandResult;
  try {
    result = await runMediaCommand(env.FFPROBE_PATH, [
      '-v', 'error',
      '-show_entries', 'format=duration,size,format_name:stream=codec_type,codec_name,width,height,avg_frame_rate,r_frame_rate',
      '-of', 'json',
      uploadPath,
    ]);
  } catch (error) {
    if (error instanceof MediaToolUnavailableError) throw error;
    throw new VideoValidationError('The uploaded file is not a readable MP4 or MOV video.');
  }

  let probe: ProbeResult;
  try {
    probe = JSON.parse(result.stdout) as ProbeResult;
  } catch {
    throw new VideoValidationError('FFprobe returned unreadable video information.');
  }

  const containerFormats = probe.format?.format_name?.split(',') ?? [];
  if (!containerFormats.includes('mp4') && !containerFormats.includes('mov')) {
    throw new VideoValidationError('The file contents are not an MP4 or MOV container.');
  }

  const videoStream = probe.streams?.find((stream) => stream.codec_type === 'video');
  const audioStream = probe.streams?.find((stream) => stream.codec_type === 'audio');
  const duration = Number(probe.format?.duration);
  const fileSize = Number(probe.format?.size);

  if (!videoStream?.codec_name || !videoStream.width || !videoStream.height || !Number.isFinite(duration) || duration <= 0) {
    throw new VideoValidationError('The file does not contain a valid video stream.');
  }
  if (duration > env.MAX_VIDEO_DURATION_SECONDS) {
    throw new VideoValidationError(`Video exceeds the ${env.MAX_VIDEO_DURATION_SECONDS} second duration limit.`);
  }

  const stats = await fs.stat(uploadPath);
  return {
    duration: Math.round(duration * 1000) / 1000,
    width: videoStream.width,
    height: videoStream.height,
    frameRate: parseFrameRate(videoStream),
    videoCodec: videoStream.codec_name,
    audioCodec: audioStream?.codec_name ?? null,
    fileSize: Number.isFinite(fileSize) ? fileSize : stats.size,
    format: extension === '.mov' ? 'mov' : 'mp4',
  };
}

async function extractAudio(uploadPath: string, audioPath: string): Promise<void> {
  await runMediaCommand(env.FFMPEG_PATH, [
    '-nostdin', '-y',
    '-i', uploadPath,
    '-map', '0:a:0',
    '-vn',
    '-acodec', 'libmp3lame',
    '-q:a', '2',
    audioPath,
  ]);
}

async function extractFrames(uploadPath: string, framePattern: string): Promise<void> {
  await runMediaCommand(env.FFMPEG_PATH, [
    '-nostdin', '-y',
    '-i', uploadPath,
    '-map', '0:v:0',
    '-vf', 'fps=1',
    '-frames:v', String(env.MAX_FRAMES),
    '-q:v', '2',
    framePattern,
  ]);
}

async function extractFirstFrame(uploadPath: string, framePath: string): Promise<void> {
  await runMediaCommand(env.FFMPEG_PATH, [
    '-nostdin', '-y',
    '-i', uploadPath,
    '-map', '0:v:0',
    '-frames:v', '1',
    '-q:v', '2',
    framePath,
  ]);
}

async function isToolAvailable(command: string): Promise<boolean> {
  try {
    await runMediaCommand(command, ['-version'], 5000);
    return true;
  } catch {
    return false;
  }
}

export const ffmpegService = {
  probeVideo,
  extractAudio,
  extractFrames,
  extractFirstFrame,
  checkAvailability: async (): Promise<{ ffmpeg: boolean; ffprobe: boolean }> => {
    const [ffmpeg, ffprobe] = await Promise.all([
      isToolAvailable(env.FFMPEG_PATH),
      isToolAvailable(env.FFPROBE_PATH),
    ]);
    return { ffmpeg, ffprobe };
  },
};
