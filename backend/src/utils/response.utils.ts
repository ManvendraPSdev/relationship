import type { Response } from 'express';

interface SuccessResponse<T> {
  success: true;
  message: string;
  data: T;
}

export function sendSuccess<T>(
  response: Response,
  statusCode: number,
  message: string,
  data: T,
): Response<SuccessResponse<T>> {
  return response.status(statusCode).json({
    success: true,
    message,
    data,
  });
}
