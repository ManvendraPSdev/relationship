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
