import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { after, before, test } from 'node:test';
import sharp from 'sharp';
import { env } from '../src/config/env';
import { reelContentAnalysisSchema } from '../src/schemas/analysis.schema';
import { OpenAIClientService } from '../src/services/ai-client.service';
import { AIAnalysisError, ReelAnalysisService } from '../src/services/reel-analysis.service';
import { TranscriptionService } from '../src/services/transcription.service';
import { VisualAnalysisService } from '../src/services/visual-analysis.service';
import type { AIProvider, ReelContentAnalysis } from '../src/types/analysis.types';
import {
  contentAnalysisFixture,
  videoMetadataFixture,
  visualModelAnalysisFixture,
} from './helpers/analysis.fixtures';

const temporaryDirectory = path.join(process.cwd(), '.test-tmp-analysis');
const framesDirectory = path.join(temporaryDirectory, 'frames');

function provider(overrides: Partial<AIProvider> = {}): AIProvider {
  return {
    transcribeAudio: async () => 'A spoken technical explanation.',
    analyzeVisualFrames: async () => visualModelAnalysisFixture,
    generateContentAnalysis: async () => contentAnalysisFixture(),
    ...overrides,
  };
}

before(async () => {
  await fs.mkdir(framesDirectory, { recursive: true });
  await sharp({ create: { width: 640, height: 480, channels: 3, background: '#224466' } })
    .jpeg()
    .toFile(path.join(framesDirectory, 'frame_001.jpg'));
});

after(async () => {
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
});

test('analysis schema accepts valid output and rejects invalid confidence, enums, and unknown fields', () => {
  assert.doesNotThrow(() => reelContentAnalysisSchema.parse(contentAnalysisFixture()));
  assert.throws(() => reelContentAnalysisSchema.parse({ ...contentAnalysisFixture(), confidence: 1.2 }));
  assert.throws(() => reelContentAnalysisSchema.parse({ ...contentAnalysisFixture(), contentCategory: 'Personality' }));
  assert.throws(() => reelContentAnalysisSchema.parse({ ...contentAnalysisFixture(), unexpected: true }));
});

test('transcription distinguishes no audio, empty files, and corrupted audio provider failures', async () => {
  let providerCalls = 0;
  const failingProvider = provider({
    transcribeAudio: async () => {
      providerCalls += 1;
      throw new Error('Unsupported or corrupted audio.');
    },
  });
  const service = new TranscriptionService(failingProvider);
  const emptyPath = path.join(temporaryDirectory, 'empty.mp3');
  const corruptedPath = path.join(temporaryDirectory, 'corrupted.mp3');
  await fs.writeFile(emptyPath, '');
  await fs.writeFile(corruptedPath, 'not an mp3');

  assert.equal((await service.transcribe(null)).status, 'NO_AUDIO');
  assert.equal((await service.transcribe(emptyPath)).status, 'EMPTY_FILE');
  const failed = await service.transcribe(corruptedPath);
  assert.equal(failed.status, 'FAILED');
  assert.equal(failed.text, null);
  assert.equal(providerCalls, 1);
});

test('visual analysis limits frames and sends compressed actual image data', async () => {
  const manyFramesDirectory = path.join(temporaryDirectory, 'many-frames');
  await fs.mkdir(manyFramesDirectory, { recursive: true });
  const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffffff', '#123456', '#654321', '#111111'];
  for (let index = 0; index < colors.length; index += 1) {
    await sharp({ create: { width: 1000, height: 800, channels: 3, background: colors[index] } })
      .jpeg()
      .toFile(path.join(manyFramesDirectory, `frame_${String(index + 1).padStart(3, '0')}.jpg`));
  }

  let sentFrames: Array<{ dataUrl: string }> = [];
  const service = new VisualAnalysisService(provider({
    analyzeVisualFrames: async (frames) => {
      sentFrames = frames;
      return visualModelAnalysisFixture;
    },
  }), {
    maxFrames: 3,
    maxDimension: 512,
    jpegQuality: 70,
    maxFrameBytes: 50000,
    duplicateThreshold: 12,
  });

  const result = await service.analyze(manyFramesDirectory);
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.selectedFrameCount, 3);
  assert.equal(sentFrames.length, 3);

  for (const frame of sentFrames) {
    assert.ok(frame.dataUrl.startsWith('data:image/jpeg;base64,'));
    const jpeg = Buffer.from(frame.dataUrl.split(',')[1], 'base64');
    assert.ok(jpeg.byteLength <= 50000);
    const metadata = await sharp(jpeg).metadata();
    assert.ok((metadata.width ?? 0) <= 512 && (metadata.height ?? 0) <= 512);
  }
});

test('visual analysis removes near-duplicate frames', async () => {
  const duplicatesDirectory = path.join(temporaryDirectory, 'duplicates');
  await fs.mkdir(duplicatesDirectory, { recursive: true });
  for (let index = 1; index <= 4; index += 1) {
    await sharp({ create: { width: 320, height: 240, channels: 3, background: '#000000' } })
      .jpeg()
      .toFile(path.join(duplicatesDirectory, `frame_${String(index).padStart(3, '0')}.jpg`));
  }

  let frameCount = 0;
  const service = new VisualAnalysisService(provider({
    analyzeVisualFrames: async (frames) => {
      frameCount = frames.length;
      return visualModelAnalysisFixture;
    },
  }));
  const result = await service.analyze(duplicatesDirectory);
  assert.equal(result.status, 'COMPLETED');
  assert.equal(frameCount, 1);
  assert.equal(result.selectedFrameCount, 1);
});

test('combined analysis preserves visual evidence when transcription fails', async () => {
  const corruptedAudio = path.join(temporaryDirectory, 'corrupted.mp3');
  const stages: string[] = [];
  let combinedCalls = 0;
  const service = new ReelAnalysisService(provider({
    transcribeAudio: async () => { throw new Error('Invalid audio'); },
    generateContentAnalysis: async (input) => {
      combinedCalls += 1;
      assert.equal(input.transcript.status, 'FAILED');
      assert.equal(input.visual.status, 'COMPLETED');
      return contentAnalysisFixture();
    },
  }));

  const result = await service.analyze(randomUUID(), {
    audioPath: corruptedAudio,
    framesDirectory,
    metadata: videoMetadataFixture,
    caption: null,
  }, (stage) => stages.push(stage));

  assert.equal(result.transcript.status, 'FAILED');
  assert.equal(result.visual.status, 'COMPLETED');
  assert.equal(result.warnings.length, 1);
  assert.equal(combinedCalls, 1);
  assert.deepEqual(stages, ['TRANSCRIBING', 'ANALYZING_VISUALS', 'GENERATING_ANALYSIS']);
});

test('combined analysis continues with a transcript when visual AI fails', async () => {
  const audioPath = path.join(temporaryDirectory, 'valid.mp3');
  await fs.writeFile(audioPath, 'nonempty test audio');
  const service = new ReelAnalysisService(provider({
    analyzeVisualFrames: async () => { throw new Error('Vision provider unavailable'); },
  }));

  const result = await service.analyze(randomUUID(), {
    audioPath,
    framesDirectory,
    metadata: videoMetadataFixture,
    caption: null,
  });
  assert.equal(result.transcript.status, 'COMPLETED');
  assert.equal(result.visual.status, 'FAILED');
  assert.deepEqual(result.visualObservations, []);
  assert.equal(result.warnings.length, 1);
});

test('combined analysis supports videos with no audio', async () => {
  const service = new ReelAnalysisService(provider());
  const result = await service.analyze(randomUUID(), {
    audioPath: null,
    framesDirectory,
    metadata: { ...videoMetadataFixture, audioCodec: null },
    caption: null,
  });
  assert.equal(result.transcript.status, 'NO_AUDIO');
  assert.equal(result.transcript.text, null);
  assert.equal(result.visual.status, 'COMPLETED');
});

test('OpenAI client rejects syntactically malformed JSON from the provider', async () => {
  const originalApiKey = env.OPENAI_API_KEY;
  env.OPENAI_API_KEY = 'unit-test-placeholder';
  const service = new OpenAIClientService();
  (service as unknown as { client: unknown }).client = {
    responses: { create: async () => ({ output_text: '{not-valid-json' }) },
  };

  try {
    await assert.rejects(service.generateContentAnalysis({
      metadata: videoMetadataFixture,
      caption: null,
      transcript: { status: 'NO_AUDIO', text: null, error: null },
      visual: { status: 'NO_FRAMES', selectedFrameCount: 0, analysis: null, error: null },
    }), /malformed JSON/);
  } finally {
    env.OPENAI_API_KEY = originalApiKey;
  }
});

test('provider failure and malformed structured output fail the combined analysis safely', async () => {
  const providerFailure = new ReelAnalysisService(provider({
    generateContentAnalysis: async () => { throw new Error('Provider unavailable'); },
  }));
  const input = {
    audioPath: null,
    framesDirectory,
    metadata: videoMetadataFixture,
    caption: null,
  };
  await assert.rejects(providerFailure.analyze(randomUUID(), input), AIAnalysisError);

  const malformed = new ReelAnalysisService(provider({
    generateContentAnalysis: async () => ({ ...contentAnalysisFixture(), confidence: 4 }) as ReelContentAnalysis,
  }));
  await assert.rejects(malformed.analyze(randomUUID(), input), AIAnalysisError);
});

test('no usable evidence prevents an unnecessary combined AI request', async () => {
  let combinedCalls = 0;
  const emptyFramesDirectory = path.join(temporaryDirectory, 'empty-frames');
  await fs.mkdir(emptyFramesDirectory, { recursive: true });
  const service = new ReelAnalysisService(provider({
    generateContentAnalysis: async () => {
      combinedCalls += 1;
      return contentAnalysisFixture();
    },
  }));

  await assert.rejects(service.analyze(randomUUID(), {
    audioPath: null,
    framesDirectory: emptyFramesDirectory,
    metadata: { ...videoMetadataFixture, audioCodec: null },
    caption: null,
  }), AIAnalysisError);
  assert.equal(combinedCalls, 0);
});
