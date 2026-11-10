import { app } from './app';
import { env } from './config/env';
import { ffmpegService } from './services/ffmpeg.service';
import { ensureStorageDirectories } from './utils/file.utils';

async function startServer(): Promise<void> {
  await ensureStorageDirectories();
  const tools = await ffmpegService.checkAvailability();

  if (!tools.ffmpeg || !tools.ffprobe) {
    console.warn(`[${new Date().toISOString()}] FFmpeg availability: ffmpeg=${tools.ffmpeg}, ffprobe=${tools.ffprobe}. Video processing will fail until both are installed.`);
  }

  app.listen(env.PORT, () => {
    console.log(`[${new Date().toISOString()}] Backend listening on http://localhost:${env.PORT} (${env.NODE_ENV}).`);
  });
}

void startServer().catch((error: unknown) => {
  console.error('Unable to start backend.', error);
  process.exitCode = 1;
});
