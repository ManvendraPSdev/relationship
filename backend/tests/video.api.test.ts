import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { promisify } from 'node:util';
import request from 'supertest';
import { app } from '../src/app';
import { env } from '../src/config/env';
import { ffmpegService } from '../src/services/ffmpeg.service';
import { ensureStorageDirectories } from '../src/utils/file.utils';

const executeFile = promisify(execFile);
const fixturesDirectory = path.join(process.cwd(), '.test-tmp');
const createdVideos: Array<{ videoId: string; extension: string }> = [];

async function createFixture(filename: string, withAudio: boolean, duration: number): Promise<string> {
  const fixturePath = path.join(fixturesDirectory, filename);
  const args = [
    '-y',
    '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=24',
  ];

  if (withAudio) {
    args.push('-f', 'lavfi', '-i', 'sine=frequency=1000:sample_rate=44100');
  }

  args.push('-t', String(duration), '-c:v', 'libx264', '-pix_fmt', 'yuv420p');
  if (withAudio) args.push('-c:a', 'aac', '-shortest');
  args.push(fixturePath);

  await executeFile(env.FFMPEG_PATH, args, { timeout: 30_000 });
  return fixturePath;
}

async function waitForTerminalStatus(videoId: string, expectedStatus: 'COMPLETED' | 'FAILED') {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const response = await request(app).get(`/api/v1/videos/${videoId}/status`);
    assert.equal(response.status, 200);
    if (response.body.data.status === expectedStatus) return response.body.data;
    assert.notEqual(response.body.data.status, expectedStatus === 'COMPLETED' ? 'FAILED' : 'COMPLETED');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${videoId} to reach ${expectedStatus}.`);
}

before(async () => {
  const tools = await ffmpegService.checkAvailability();
  assert.ok(tools.ffmpeg && tools.ffprobe, 'FFmpeg and FFprobe are required for integration tests.');
  await ensureStorageDirectories();
  await fs.mkdir(fixturesDirectory, { recursive: true });
});

after(async () => {
  await Promise.all(createdVideos.map(async ({ videoId, extension }) => {
    await fs.rm(path.join(env.uploadPath, `${videoId}${extension}`), { force: true });
    await fs.rm(path.join(env.extractedPath, videoId), { recursive: true, force: true });
  }));
  await fs.rm(fixturesDirectory, { recursive: true, force: true });
});

test('health endpoint reports FFmpeg and FFprobe availability', async () => {
  const response = await request(app).get('/api/v1/health');
  assert.equal(response.status, 200);
  assert.equal(response.body.data.status, 'ok');
  assert.equal(response.body.data.ffmpeg.available, true);
  assert.equal(response.body.data.ffprobe.available, true);
});

test('MP4 upload stores video and extracts metadata, MP3 audio, and frames', async () => {
  const fixturePath = await createFixture('with-audio.mp4', true, 2.2);
  const uploadResponse = await request(app).post('/api/v1/videos/upload').attach('video', fixturePath);

  assert.equal(uploadResponse.status, 202);
  assert.equal(uploadResponse.body.data.status, 'PROCESSING');
  const videoId = uploadResponse.body.data.videoId as string;
  createdVideos.push({ videoId, extension: '.mp4' });

  await waitForTerminalStatus(videoId, 'COMPLETED');
  const detailResponse = await request(app).get(`/api/v1/videos/${videoId}`);
  const video = detailResponse.body.data;

  assert.equal(detailResponse.status, 200);
  assert.equal(video.metadata.width, 320);
  assert.equal(video.metadata.height, 240);
  assert.equal(video.metadata.frameRate, 24);
  assert.equal(video.metadata.format, 'mp4');
  assert.ok(video.metadata.duration >= 2);
  assert.ok(video.metadata.fileSize > 0);
  assert.equal(video.audio.available, true);
  assert.equal(video.audio.filename, 'audio.mp3');
  assert.ok(video.frames.count >= 2 && video.frames.count <= 3);
  assert.ok(!('uploadPath' in video));

  const processingDirectory = path.join(env.extractedPath, videoId);
  const uploadedStats = await fs.stat(path.join(env.uploadPath, `${videoId}.mp4`));
  const audioStats = await fs.stat(path.join(processingDirectory, 'audio.mp3'));
  const frameFiles = (await fs.readdir(path.join(processingDirectory, 'frames'))).filter((name) => name.endsWith('.jpg'));
  const metadataFile = JSON.parse(await fs.readFile(path.join(processingDirectory, 'metadata.json'), 'utf8'));

  assert.ok(uploadedStats.size > 0);
  assert.ok(audioStats.size > 0);
  assert.equal(frameFiles.length, video.frames.count);
  assert.equal(metadataFile.videoId, videoId);
  assert.equal(metadataFile.status, 'COMPLETED');
});

test('short MOV without audio completes with no MP3 and at least one frame', async () => {
  const fixturePath = await createFixture('silent.mov', false, 0.6);
  const uploadResponse = await request(app).post('/api/v1/videos/upload').attach('video', fixturePath);

  assert.equal(uploadResponse.status, 202);
  const videoId = uploadResponse.body.data.videoId as string;
  createdVideos.push({ videoId, extension: '.mov' });
  await waitForTerminalStatus(videoId, 'COMPLETED');

  const detailResponse = await request(app).get(`/api/v1/videos/${videoId}`);
  assert.equal(detailResponse.body.data.audio.available, false);
  assert.equal(detailResponse.body.data.audio.filename, null);
  assert.equal(detailResponse.body.data.frames.count, 1);
  assert.equal(detailResponse.body.data.metadata.audioCodec, null);
  assert.equal(detailResponse.body.data.metadata.format, 'mov');

  const processingDirectory = path.join(env.extractedPath, videoId);
  await assert.rejects(fs.access(path.join(processingDirectory, 'audio.mp3')));
  assert.equal((await fs.readdir(path.join(processingDirectory, 'frames'))).length, 1);
});

test('unsupported extensions and MIME mismatches are rejected', async () => {
  const unsupported = await request(app)
    .post('/api/v1/videos/upload')
    .attach('video', Buffer.from('plain text'), { filename: 'notes.txt', contentType: 'text/plain' });
  assert.equal(unsupported.status, 400);

  const mismatch = await request(app)
    .post('/api/v1/videos/upload')
    .attach('video', Buffer.from('not a video'), { filename: 'fake.mp4', contentType: 'text/plain' });
  assert.equal(mismatch.status, 400);

  const missing = await request(app).post('/api/v1/videos/upload');
  assert.equal(missing.status, 400);
});

test('files over 100 MB are rejected with HTTP 413', async () => {
  const oversizedFile = Buffer.alloc(env.MAX_VIDEO_SIZE_BYTES + 1, 0);
  const response = await request(app)
    .post('/api/v1/videos/upload')
    .attach('video', oversizedFile, { filename: 'oversized.mp4', contentType: 'video/mp4' });
  assert.equal(response.status, 413);
});

test('corrupted MP4 moves to FAILED and removes invalid upload artifacts', async () => {
  const response = await request(app)
    .post('/api/v1/videos/upload')
    .attach('video', Buffer.from('not a real MP4 container'), {
      filename: 'corrupted.mp4',
      contentType: 'video/mp4',
    });

  assert.equal(response.status, 202);
  const videoId = response.body.data.videoId as string;
  const status = await waitForTerminalStatus(videoId, 'FAILED');
  assert.match(status.error, /not a readable MP4 or MOV video/i);
  await assert.rejects(fs.access(path.join(env.uploadPath, `${videoId}.mp4`)));
  await assert.rejects(fs.access(path.join(env.extractedPath, videoId)));
});

test('malformed and unknown video IDs receive validation and not-found responses', async () => {
  const malformed = await request(app).get('/api/v1/videos/not-a-uuid/status');
  assert.equal(malformed.status, 400);

  const unknown = await request(app).get(`/api/v1/videos/${randomUUID()}`);
  assert.equal(unknown.status, 404);
});
