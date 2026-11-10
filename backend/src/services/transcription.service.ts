import { promises as fs } from 'node:fs';
import path from 'node:path';
import { env } from '../config/env';
import type { AIProvider, TranscriptResult } from '../types/analysis.types';
import { aiClientService } from './ai-client.service';

export class TranscriptionService {
  constructor(private readonly provider: AIProvider = aiClientService) {}

  async transcribe(audioPath: string | null): Promise<TranscriptResult> {
    if (!audioPath) return { status: 'NO_AUDIO', text: null, error: null };

    try {
      if (path.extname(audioPath).toLowerCase() !== '.mp3') {
        return { status: 'FAILED', text: null, error: 'The extracted audio format is not supported.' };
      }

      const stats = await fs.stat(audioPath);
      if (stats.size === 0) return { status: 'EMPTY_FILE', text: null, error: null };
      if (stats.size > env.MAX_TRANSCRIPTION_AUDIO_BYTES) {
        return {
          status: 'FAILED',
          text: null,
          error: 'The extracted audio exceeds the transcription size limit.',
        };
      }

      const transcript = (await this.provider.transcribeAudio(audioPath)).trim();
      if (!transcript) return { status: 'NO_SPEECH', text: null, error: null };
      return { status: 'COMPLETED', text: transcript, error: null };
    } catch (error) {
      console.warn(`[${new Date().toISOString()}] [ai] Audio transcription unavailable: ${error instanceof Error ? error.message : 'unknown error'}`);
      return {
        status: 'FAILED',
        text: null,
        error: 'Audio transcription was unavailable for this Reel.',
      };
    }
  }
}

export const transcriptionService = new TranscriptionService();
