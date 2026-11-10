import type { RequestHandler } from 'express';
import { ffmpegService } from '../services/ffmpeg.service';
import { sendSuccess } from '../utils/response.utils';

export const healthController: RequestHandler = async (_request, response) => {
  const tools = await ffmpegService.checkAvailability();
  const healthy = tools.ffmpeg && tools.ffprobe;

  sendSuccess(response, 200, healthy ? 'Backend and media tools are available.' : 'Backend is running with degraded media tools.', {
    status: healthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    ffmpeg: { available: tools.ffmpeg },
    ffprobe: { available: tools.ffprobe },
  });
};
