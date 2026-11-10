import { reelContentAnalysisSchema } from '../schemas/analysis.schema';
import type {
  AIProvider,
  AnalysisStage,
  ReelAnalysisInput,
  ReelAnalysisResult,
} from '../types/analysis.types';
import { aiClientService } from './ai-client.service';
import { TranscriptionService } from './transcription.service';
import { VisualAnalysisService } from './visual-analysis.service';

export class AIAnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AIAnalysisError';
  }
}

export class ReelAnalysisService {
  private readonly transcriptionService: TranscriptionService;
  private readonly visualAnalysisService: VisualAnalysisService;

  constructor(private readonly provider: AIProvider = aiClientService) {
    this.transcriptionService = new TranscriptionService(provider);
    this.visualAnalysisService = new VisualAnalysisService(provider);
  }

  async analyze(
    videoId: string,
    input: ReelAnalysisInput,
    onStage: (stage: AnalysisStage) => void = () => undefined,
  ): Promise<ReelAnalysisResult> {
    onStage('TRANSCRIBING');
    const transcript = await this.transcriptionService.transcribe(input.audioPath);

    onStage('ANALYZING_VISUALS');
    const visual = await this.visualAnalysisService.analyze(input.framesDirectory);

    if (transcript.status !== 'COMPLETED' && visual.status !== 'COMPLETED' && !input.caption) {
      throw new AIAnalysisError('AI analysis could not obtain usable audio, visual, or caption evidence.');
    }

    onStage('GENERATING_ANALYSIS');
    try {
      const generatedAnalysis = reelContentAnalysisSchema.parse(await this.provider.generateContentAnalysis({
        metadata: input.metadata,
        caption: input.caption,
        transcript,
        visual,
      }));
      const contentAnalysis = {
        ...generatedAnalysis,
        visualObservations: visual.status === 'COMPLETED' ? generatedAnalysis.visualObservations : [],
      };

      return {
        videoId,
        createdAt: new Date().toISOString(),
        ...contentAnalysis,
        transcript,
        visual,
        warnings: [transcript.error, visual.error].filter((warning): warning is string => Boolean(warning)),
      };
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [ai] Combined analysis failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      throw new AIAnalysisError('The structured AI content analysis could not be generated.');
    }
  }
}

export const reelAnalysisService = new ReelAnalysisService();
