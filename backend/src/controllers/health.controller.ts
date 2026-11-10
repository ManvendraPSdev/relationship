import type { RequestHandler } from 'express';
import { env } from '../config/env';
import { ffmpegService } from '../services/ffmpeg.service';
import { sendSuccess } from '../utils/response.utils';

export const healthController: RequestHandler = async (_request, response) => {
  const tools = await ffmpegService.checkAvailability();
  const openAIConfigured = Boolean(env.OPENAI_API_KEY);
  const healthy = tools.ffmpeg && tools.ffprobe && openAIConfigured;

  sendSuccess(response, 200, healthy ? 'Backend, media tools, and AI configuration are available.' : 'Backend is running with degraded dependencies.', {
    status: healthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    ffmpeg: { available: tools.ffmpeg },
    ffprobe: { available: tools.ffprobe },
    openai: { configured: openAIConfigured },
  });
};
