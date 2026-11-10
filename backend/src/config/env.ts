import 'dotenv/config';
import path from 'node:path';
import { z } from 'zod';

const environmentSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  MAX_VIDEO_SIZE_MB: z.coerce.number().positive().max(1024).default(100),
  UPLOAD_DIR: z.string().trim().min(1).default('uploads'),
  EXTRACTED_DIR: z.string().trim().min(1).default('extracted'),
  FFMPEG_PATH: z.string().trim().min(1).default('ffmpeg'),
  FFPROBE_PATH: z.string().trim().min(1).default('ffprobe'),
  MAX_VIDEO_DURATION_SECONDS: z.coerce.number().int().min(1).max(3600).default(300),
  MAX_FRAMES: z.coerce.number().int().min(1).max(3600).default(300),
  FFMPEG_TIMEOUT_MS: z.coerce.number().int().min(1000).default(120000),
  OPENAI_API_KEY: z.string().trim().default(''),
  OPENAI_TRANSCRIPTION_MODEL: z.string().trim().min(1).default('gpt-4o-mini-transcribe'),
  OPENAI_VISION_MODEL: z.string().trim().min(1).default('gpt-4o-mini'),
  OPENAI_ANALYSIS_MODEL: z.string().trim().min(1).default('gpt-4o-mini'),
  OPENAI_TIMEOUT_MS: z.coerce.number().int().min(1000).default(60000),
  OPENAI_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  OPENAI_RETRY_BASE_DELAY_MS: z.coerce.number().int().min(0).default(500),
  OPENAI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(256).max(8192).default(2000),
  MAX_ANALYSIS_FRAMES: z.coerce.number().int().min(1).max(20).default(8),
  ANALYSIS_FRAME_MAX_DIMENSION: z.coerce.number().int().min(256).max(2048).default(768),
  ANALYSIS_JPEG_QUALITY: z.coerce.number().int().min(30).max(90).default(70),
  MAX_ANALYSIS_FRAME_BYTES: z.coerce.number().int().min(50000).max(2000000).default(512000),
  VISUAL_FRAME_DIFF_THRESHOLD: z.coerce.number().min(0).max(255).default(12),
  MAX_TRANSCRIPTION_AUDIO_BYTES: z.coerce.number().int().min(1024).max(26214400).default(26214400),
  ANALYSIS_TRANSCRIPT_MAX_CHARACTERS: z.coerce.number().int().min(1000).max(100000).default(20000),
});

const parsedEnvironment = environmentSchema.safeParse(process.env);

if (!parsedEnvironment.success) {
  const issues = parsedEnvironment.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
  throw new Error(`Invalid environment configuration: ${issues}`);
}

const values = parsedEnvironment.data;

export const env = {
  ...values,
  MAX_VIDEO_SIZE_BYTES: Math.floor(values.MAX_VIDEO_SIZE_MB * 1024 * 1024),
  uploadPath: path.resolve(process.cwd(), values.UPLOAD_DIR),
  extractedPath: path.resolve(process.cwd(), values.EXTRACTED_DIR),
};
