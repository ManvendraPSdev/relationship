import type { RequestHandler } from 'express';
import { z } from 'zod';
import { videoService } from '../services/video.service';
import { HttpError } from '../utils/http-error.utils';
import { sendSuccess } from '../utils/response.utils';

const videoParametersSchema = z.object({
  videoId: z.string().uuid(),
});

const uploadBodySchema = z.object({
  caption: z.string().trim().max(2200).optional(),
});

export const uploadVideoController: RequestHandler = (request, response) => {
  if (!request.file) {
    throw new HttpError(400, 'A video file is required in the multipart field named "video".');
  }

  const { caption } = uploadBodySchema.parse(request.body);
  const video = videoService.acceptUpload(request.file, caption || null);
  sendSuccess(response, 202, 'Video upload accepted and processing started.', video);
};

export const getVideoStatusController: RequestHandler = (request, response) => {
  const { videoId } = videoParametersSchema.parse(request.params);
  sendSuccess(response, 200, 'Video processing status retrieved.', videoService.getStatus(videoId));
};

export const getVideoController: RequestHandler = (request, response) => {
  const { videoId } = videoParametersSchema.parse(request.params);
  sendSuccess(response, 200, 'Video processing information retrieved.', videoService.getVideo(videoId));
};

export const getVideoAnalysisController: RequestHandler = (request, response) => {
  const { videoId } = videoParametersSchema.parse(request.params);
  const result = videoService.getAnalysis(videoId);
  const completed = result.status === 'COMPLETED';
  sendSuccess(
    response,
    completed ? 200 : 202,
    completed ? 'Reel analysis retrieved.' : 'Reel analysis is still processing.',
    result,
  );
};
