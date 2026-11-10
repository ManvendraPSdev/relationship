export const PROCESSING_STATUSES = ['UPLOADED', 'PROCESSING', 'COMPLETED', 'FAILED'] as const;

export type ProcessingStatus = (typeof PROCESSING_STATUSES)[number];
export type SupportedVideoExtension = '.mp4' | '.mov';
export type SupportedVideoFormat = 'mp4' | 'mov';

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  frameRate: number;
  videoCodec: string;
  audioCodec: string | null;
  fileSize: number;
  format: SupportedVideoFormat;
}

export interface AudioProcessingResult {
  available: boolean;
  filename: string | null;
}

export interface FrameProcessingResult {
  count: number;
  directory: string;
}

export interface VideoJob {
  videoId: string;
  status: ProcessingStatus;
  uploadPath: string;
  extension: SupportedVideoExtension;
  createdAt: string;
  updatedAt: string;
  metadata: VideoMetadata | null;
  audio: AudioProcessingResult | null;
  frames: FrameProcessingResult | null;
  error: string | null;
}

export interface VideoProcessingInfo {
  videoId: string;
  status: ProcessingStatus;
  createdAt: string;
  updatedAt: string;
  metadata: VideoMetadata | null;
  audio: AudioProcessingResult | null;
  frames: FrameProcessingResult | null;
  error: string | null;
}
