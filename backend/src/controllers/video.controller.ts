import type { RequestHandler } from 'express';
import { z } from 'zod';
import { videoService } from '../services/video.service';
import { HttpError } from '../utils/http-error.utils';
import { sendSuccess } from '../utils/response.utils';

const videoParametersSchema = z.object({
  videoId: z.string().uuid(),
});

export const uploadVideoController: RequestHandler = (request, response) => {
  if (!request.file) {
    throw new HttpError(400, 'A video file is required in the multipart field named "video".');
  }

  const video = videoService.acceptUpload(request.file);
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
