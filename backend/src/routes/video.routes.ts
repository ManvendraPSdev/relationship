import { Router } from 'express';
import {
  getVideoAnalysisController,
  getVideoController,
  getVideoStatusController,
  uploadVideoController,
} from '../controllers/video.controller';
import { uploadVideo } from '../middlewares/upload.middleware';

export const videoRouter = Router();

videoRouter.post('/upload', uploadVideo, uploadVideoController);
videoRouter.get('/:videoId/status', getVideoStatusController);
videoRouter.get('/:videoId/analysis', getVideoAnalysisController);
videoRouter.get('/:videoId', getVideoController);
