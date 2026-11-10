import type {
  ReelAnalysisInput,
  ReelAnalysisResult,
  ReelContentAnalysis,
  VisualModelAnalysis,
} from '../../src/types/analysis.types';
import type { VideoMetadata } from '../../src/types/video.types';

export const visualModelAnalysisFixture: VisualModelAnalysis = {
  observations: ['A person presents a technical diagram on a screen.'],
  objects: ['screen', 'diagram'],
  activities: ['presenting'],
  scenes: ['indoor workspace'],
  visibleText: ['API'],
  context: 'A short technical presentation.',
};

export const videoMetadataFixture: VideoMetadata = {
  duration: 2,
  width: 320,
  height: 240,
  frameRate: 24,
  videoCodec: 'h264',
  audioCodec: 'aac',
  fileSize: 1024,
  format: 'mp4',
};

export function contentAnalysisFixture(): ReelContentAnalysis {
  return {
    summary: 'A brief technical presentation about an API concept.',
    topics: [{ name: 'Technology', confidence: 0.9 }],
    interests: [{ name: 'Programming', confidence: 0.85 }],
    humour: { present: false, style: [], confidence: 0.9 },
    mood: { primary: 'Informative', secondary: ['Curious'], confidence: 0.85 },
    contentCategory: 'Education',
    visualObservations: ['A technical diagram is visible on a screen.'],
    keywords: ['API', 'Technology', 'Programming'],
    language: 'English',
    confidence: 0.86,
  };
}

export function analysisResultFixture(videoId: string, input?: ReelAnalysisInput): ReelAnalysisResult {
  const hasAudio = Boolean(input?.audioPath);
  return {
    videoId,
    createdAt: new Date().toISOString(),
    ...contentAnalysisFixture(),
    transcript: {
      status: hasAudio ? 'COMPLETED' : 'NO_AUDIO',
      text: hasAudio ? 'This is a mocked transcript for integration testing.' : null,
      error: null,
    },
    visual: {
      status: 'COMPLETED',
      selectedFrameCount: 2,
      analysis: visualModelAnalysisFixture,
      error: null,
    },
    warnings: [],
  };
}
