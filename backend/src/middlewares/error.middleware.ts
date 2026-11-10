import type { ErrorRequestHandler, RequestHandler } from 'express';
import { MulterError } from 'multer';
import { ZodError } from 'zod';
import { env } from '../config/env';
import { HttpError } from '../utils/http-error.utils';

export const notFoundHandler: RequestHandler = (request, response) => {
  response.status(404).json({
    success: false,
    message: `Route ${request.method} ${request.path} not found.`,
  });
};

export const errorHandler: ErrorRequestHandler = (error: unknown, request, response, _next) => {
  if (error instanceof MulterError) {
    const isFileTooLarge = error.code === 'LIMIT_FILE_SIZE';
    response.status(isFileTooLarge ? 413 : 400).json({
      success: false,
      message: isFileTooLarge
        ? `Video exceeds the ${env.MAX_VIDEO_SIZE_MB} MB upload limit.`
        : `Upload rejected: ${error.message}`,
    });
    return;
  }

  if (error instanceof ZodError) {
    response.status(400).json({
      success: false,
      message: 'Request validation failed.',
      errors: error.flatten(),
    });
    return;
  }

  if (error instanceof HttpError) {
    response.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
    return;
  }

  if (error instanceof SyntaxError && 'body' in error) {
    response.status(400).json({ success: false, message: 'Malformed JSON request body.' });
    return;
  }

  console.error(`[${new Date().toISOString()}] Unhandled request error`, error);
  response.status(500).json({
    success: false,
    message: env.NODE_ENV === 'production' ? 'Internal server error.' : 'An unexpected server error occurred.',
  });
};
