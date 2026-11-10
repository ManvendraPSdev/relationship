import { randomUUID } from 'node:crypto';
import path from 'node:path';
import multer from 'multer';
import { env } from '../config/env';
import type { SupportedVideoExtension } from '../types/video.types';
import { HttpError } from '../utils/http-error.utils';

const allowedMimeTypes: Record<SupportedVideoExtension, string[]> = {
  '.mp4': ['video/mp4'],
  '.mov': ['video/quicktime'],
};

const storage = multer.diskStorage({
  destination: (_request, _file, callback) => callback(null, env.uploadPath),
  filename: (_request, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase() as SupportedVideoExtension;
    callback(null, `${randomUUID()}${extension}`);
  },
});

const uploader = multer({
  storage,
  preservePath: false,
  limits: {
    fileSize: env.MAX_VIDEO_SIZE_BYTES,
    files: 1,
  },
  fileFilter: (_request, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase() as SupportedVideoExtension;
    const mimeType = file.mimetype.toLowerCase();

    if (!Object.hasOwn(allowedMimeTypes, extension)) {
      callback(new HttpError(400, 'Only .mp4 and .mov video files are supported.'));
      return;
    }

    if (!allowedMimeTypes[extension].includes(mimeType)) {
      callback(new HttpError(400, 'The file extension and MIME type do not match a supported video format.'));
      return;
    }

    callback(null, true);
  },
});

export const uploadVideo = uploader.single('video');
