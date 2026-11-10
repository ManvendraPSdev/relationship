import type { z } from 'zod';
import type { reelContentAnalysisSchema, visualModelAnalysisSchema } from '../schemas/analysis.schema';
import type { VideoMetadata } from './video.types';

export type ReelContentAnalysis = z.infer<typeof reelContentAnalysisSchema>;
export type VisualModelAnalysis = z.infer<typeof visualModelAnalysisSchema>;

export type TranscriptionStatus = 'COMPLETED' | 'NO_AUDIO' | 'EMPTY_FILE' | 'NO_SPEECH' | 'FAILED';
export type VisualAnalysisStatus = 'COMPLETED' | 'NO_FRAMES' | 'FAILED';
export type AnalysisStage = 'TRANSCRIBING' | 'ANALYZING_VISUALS' | 'GENERATING_ANALYSIS';

export interface TranscriptResult {
  status: TranscriptionStatus;
  text: string | null;
  error: string | null;
}

export interface VisualAnalysisResult {
  status: VisualAnalysisStatus;
  selectedFrameCount: number;
  analysis: VisualModelAnalysis | null;
  error: string | null;
}

export interface ReelAnalysisResult extends ReelContentAnalysis {
  videoId: string;
  createdAt: string;
  transcript: TranscriptResult;
  visual: VisualAnalysisResult;
  warnings: string[];
}

export interface ReelAnalysisInput {
  audioPath: string | null;
  framesDirectory: string;
  metadata: VideoMetadata;
  caption: string | null;
}

export interface CombinedAnalysisInput {
  metadata: VideoMetadata;
  caption: string | null;
  transcript: TranscriptResult;
  visual: VisualAnalysisResult;
}

export interface PreparedVisualFrame {
  dataUrl: string;
  sourceIndex: number;
}

export interface AIProvider {
  transcribeAudio(audioPath: string): Promise<string>;
  analyzeVisualFrames(frames: PreparedVisualFrame[]): Promise<VisualModelAnalysis>;
  generateContentAnalysis(input: CombinedAnalysisInput): Promise<ReelContentAnalysis>;
}
