# Reel Compatibility AI — Milestones 1 and 2 Backend

Express and TypeScript backend for uploading MP4/MOV videos, extracting metadata/audio/frames with FFmpeg, and generating structured AI content analysis with OpenAI transcription and vision models. The analysis describes Reel content only; it does not infer an uploader's personality. Authentication, database, Instagram integration, compatibility scoring, and frontend functionality remain out of scope.

## Prerequisites

- Node.js 20 or later
- npm
- FFmpeg and FFprobe installed as system binaries
- An OpenAI API key with access to the configured transcription and vision models
- Postman for manual API testing (optional)

Installing an npm package does **not** install FFmpeg or FFprobe. Verify both commands:

```bash
ffmpeg -version
ffprobe -version
```

### Install FFmpeg on macOS

Using Homebrew:

```bash
brew install ffmpeg
```

### Install FFmpeg on Windows

Using WinGet in PowerShell:

```powershell
winget install Gyan.FFmpeg
```

Alternatively, using Chocolatey:

```powershell
choco install ffmpeg
```

Open a new terminal after installation so the updated `PATH` is loaded. You can also set `FFMPEG_PATH` and `FFPROBE_PATH` to the full executable paths in `.env`.

### Install FFmpeg on Linux

Ubuntu/Debian:

```bash
sudo apt update
sudo apt install ffmpeg
```

Fedora:

```bash
sudo dnf install ffmpeg
```

## Project setup

```bash
cd backend
npm install
cp .env.example .env
```

On Windows PowerShell, copy the environment file with:

```powershell
Copy-Item .env.example .env
```

The server resolves `UPLOAD_DIR` and `EXTRACTED_DIR` relative to the backend working directory. Run all npm commands from `backend`.

Set `OPENAI_API_KEY` in `.env` before processing real uploads. Create and manage the key in the OpenAI platform, and never commit it or paste it into source files. The `.env` file is ignored by Git. Model names can be changed without code changes if your account uses different compatible models.

## Environment configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8000` | Express listening port |
| `NODE_ENV` | `development` | Runtime environment |
| `MAX_VIDEO_SIZE_MB` | `100` | Multer upload size limit |
| `UPLOAD_DIR` | `uploads` | Original video storage directory |
| `EXTRACTED_DIR` | `extracted` | Processing output directory |
| `FFMPEG_PATH` | `ffmpeg` | FFmpeg executable or absolute path |
| `FFPROBE_PATH` | `ffprobe` | FFprobe executable or absolute path |
| `MAX_VIDEO_DURATION_SECONDS` | `300` | Maximum accepted video duration |
| `MAX_FRAMES` | `300` | Maximum JPEG frames per video |
| `FFMPEG_TIMEOUT_MS` | `120000` | Timeout for each FFprobe/FFmpeg execution |
| `OPENAI_API_KEY` | empty | Required OpenAI credential; validated when AI processing starts |
| `OPENAI_TRANSCRIPTION_MODEL` | `gpt-4o-mini-transcribe` | Speech-to-text model |
| `OPENAI_VISION_MODEL` | `gpt-4o-mini` | Vision-capable frame analysis model |
| `OPENAI_ANALYSIS_MODEL` | `gpt-4o-mini` | Structured combined analysis model |
| `OPENAI_TIMEOUT_MS` | `60000` | Timeout for each OpenAI request |
| `OPENAI_MAX_RETRIES` | `2` | Retries for transient provider/network errors |
| `OPENAI_RETRY_BASE_DELAY_MS` | `500` | Exponential retry backoff base |
| `OPENAI_MAX_OUTPUT_TOKENS` | `2000` | Output-token cap per structured response |
| `MAX_ANALYSIS_FRAMES` | `8` | Maximum selected frames sent to vision |
| `ANALYSIS_FRAME_MAX_DIMENSION` | `768` | Maximum width/height of transmitted frames |
| `ANALYSIS_JPEG_QUALITY` | `70` | Initial JPEG compression quality |
| `MAX_ANALYSIS_FRAME_BYTES` | `512000` | Maximum encoded bytes per transmitted frame |
| `VISUAL_FRAME_DIFF_THRESHOLD` | `12` | Mean pixel difference below which frames are duplicates |
| `MAX_TRANSCRIPTION_AUDIO_BYTES` | `26214400` | Maximum audio upload size for transcription |
| `ANALYSIS_TRANSCRIPT_MAX_CHARACTERS` | `20000` | Transcript character cap for the combined prompt only |

Environment values are validated with Zod at startup. The API key is checked lazily by the AI provider so the health endpoint can still report a missing credential. Never log or expose the key.

## Running the backend

Development with automatic reload:

```bash
cd backend
npm run dev
```

Production-style build and start:

```bash
cd backend
npm run build
npm start
```

The API base URL is `http://localhost:8000/api/v1`.

## API endpoints

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/v1/videos/upload` | Accept one `video` multipart file and start processing |
| `GET` | `/api/v1/videos/:videoId/status` | Get current processing status |
| `GET` | `/api/v1/videos/:videoId` | Get status, metadata, audio, and frame information |
| `GET` | `/api/v1/videos/:videoId/analysis` | Get pending status or the persisted structured Reel analysis |
| `GET` | `/api/v1/health` | Check backend, FFmpeg, FFprobe, and OpenAI configuration |

Upload rules:

- Multipart field name: `video`
- Extensions: `.mp4`, `.mov`
- MIME types: `video/mp4`, `video/quicktime`
- Maximum size: 100 MiB by default
- Maximum duration: 300 seconds by default
- Only one file per request
- Optional text field: `caption`, trimmed and limited to 2,200 characters

### Successful upload response — HTTP 202

```json
{
  "success": true,
  "message": "Video upload accepted and processing started.",
  "data": {
    "videoId": "9d3ee3e4-e5a2-42dc-a824-d94bf11880dc",
    "status": "PROCESSING",
    "createdAt": "2026-11-10T12:00:00.000Z",
    "updatedAt": "2026-11-10T12:00:00.000Z",
    "metadata": null,
    "audio": null,
    "frames": null,
    "analysisAvailable": false,
    "error": null
  }
}
```

### Completed video response — HTTP 200

```json
{
  "success": true,
  "message": "Video processing information retrieved.",
  "data": {
    "videoId": "9d3ee3e4-e5a2-42dc-a824-d94bf11880dc",
    "status": "COMPLETED",
    "createdAt": "2026-11-10T12:00:00.000Z",
    "updatedAt": "2026-11-10T12:00:01.000Z",
    "metadata": {
      "duration": 20,
      "width": 1080,
      "height": 1920,
      "frameRate": 30,
      "videoCodec": "h264",
      "audioCodec": "aac",
      "fileSize": 5242880,
      "format": "mp4"
    },
    "audio": {
      "available": true,
      "filename": "audio.mp3"
    },
    "frames": {
      "count": 20,
      "directory": "extracted/9d3ee3e4-e5a2-42dc-a824-d94bf11880dc/frames"
    },
    "analysisAvailable": true,
    "error": null
  }
}
```

A video without an audio stream still completes. Its audio result is `{ "available": false, "filename": null }`, and no `audio.mp3` is created.

### Failed status response — HTTP 200

```json
{
  "success": true,
  "message": "Video processing status retrieved.",
  "data": {
    "videoId": "9d3ee3e4-e5a2-42dc-a824-d94bf11880dc",
    "status": "FAILED",
    "updatedAt": "2026-11-10T12:00:01.000Z",
    "error": "The uploaded file is not a readable MP4 or MOV video."
  }
}
```

Unsupported extensions/MIME types return HTTP 400, oversized uploads return HTTP 413, unknown IDs return HTTP 404, and unexpected server errors return HTTP 500. FFprobe failures discovered after upload are represented by a `FAILED` job because processing is asynchronous. The analysis endpoint returns HTTP 202 while processing and HTTP 409 after a fatal processing/analysis failure.

### Health response — HTTP 200

```json
{
  "success": true,
  "message": "Backend, media tools, and AI configuration are available.",
  "data": {
    "status": "ok",
    "timestamp": "2026-11-10T12:00:00.000Z",
    "ffmpeg": { "available": true },
    "ffprobe": { "available": true },
    "openai": { "configured": true }
  }
}
```

`data.status` is `degraded` when either executable is unavailable or `OPENAI_API_KEY` is empty. `configured` only confirms that a credential exists; it does not call OpenAI or verify account access.

## AI analysis pipeline

### Audio transcription

The transcription service reads the existing `audio.mp3`; it does not rerun FFmpeg. Missing audio returns `NO_AUDIO`, a zero-byte file returns `EMPTY_FILE`, and a blank provider transcript returns `NO_SPEECH`. Empty, missing, oversized, corrupted, and provider-rejected audio cannot crash the process. A transcription failure returns `FAILED` with no fabricated text, and visual analysis can still supply evidence for the final result.

### Visual analysis

The visual service samples up to three times the configured frame budget across the chronological frame set. It creates 16×16 grayscale signatures and skips near-duplicates using mean absolute pixel difference. Selected frames are resized and JPEG-compressed with Sharp, with progressively smaller settings until each satisfies `MAX_ANALYSIS_FRAME_BYTES`. Only the configured maximum number of actual image data URLs is sent to the vision model. The original video, URLs, and local paths are never sent as substitutes for media.

The visual response identifies observable objects, activities, scenes, visible text, and context. It is independently validated with Zod. If vision fails but a transcript exists, the final analysis continues and records a warning.

### Combined structured analysis

The combined service supplies only the transcript, visual evidence, optional caption, and video metadata. Captions, transcripts, and visible text are explicitly treated as untrusted content rather than instructions. The model receives a strict JSON schema and its response is parsed and validated again with Zod, including controlled categories, humour styles, mood values, and confidence scores from 0 to 1.

Results are stored in `extracted/<videoId>/analysis.json`; `metadata.json` references that file. Transcript and visual statuses distinguish unavailable evidence from genuinely absent content. Model confidence is an estimate, not a factual guarantee.

### Reliability and cost control

- OpenAI requests have timeouts, output-token limits, and bounded retries with exponential backoff for transient errors.
- Audio size, frame count, frame dimensions, encoded frame bytes, and combined-prompt transcript length are capped.
- A completed analysis is reused by all subsequent GET requests; reads never trigger another AI call.
- Transcription and visual failures preserve usable partial evidence. Failure of the final combined analysis marks the job `FAILED`.
- Provider errors are logged without credentials. API keys and internal storage paths are never returned to clients.

## Complete request lifecycle

1. A React client, Postman, or another HTTP client sends `multipart/form-data` to `POST /api/v1/videos/upload`. The file part is named `video`; an optional `caption` text part can provide context.
2. Multer checks the extension, MIME type, file count, and 100 MiB size limit. The client filename is never used as a storage path.
3. Multer writes the original video to `uploads/<uuid>.<ext>`. The UUID becomes the public `videoId`.
4. The video service creates an in-memory job with `UPLOADED`, changes it to `PROCESSING`, and schedules asynchronous work with `setImmediate`. The client receives HTTP 202 without waiting for media or AI processing.
5. FFprobe inspects the stored bytes and records duration, dimensions, frame rate, codecs, and file size.
6. For videos with an audio stream, FFmpeg writes `extracted/<videoId>/audio.mp3`. Videos without audio skip extraction.
7. FFmpeg applies `fps=1` to write sequential JPEGs under `extracted/<videoId>/frames`, enforcing the frame cap and preserving the original video.
8. The status becomes `TRANSCRIBING`; the transcription service sends the extracted MP3 to the configured OpenAI speech-to-text model when audio exists.
9. The status becomes `ANALYZING_VISUALS`; the visual service selects, deduplicates, and compresses frames before sending actual image inputs to the vision model.
10. The status becomes `GENERATING_ANALYSIS`; transcript, visual evidence, caption, and metadata are sent for a structured content-only analysis.
11. The combined response is validated against the strict Zod schema. Partial transcription/visual warnings are preserved without inventing missing evidence.
12. The service writes `analysis.json` and `metadata.json`, then marks the job `COMPLETED`.
13. Clients poll `/status`, retrieve processing information from `/:videoId`, and retrieve the structured result from `/:videoId/analysis`.
14. Invalid media and incomplete extraction artifacts are cleaned up. If only the AI stage fails, valid extracted media is retained and `metadata.json` records the failure.

FFmpeg and FFprobe are launched with `child_process.spawn`, fixed argument arrays, and `shell: false`. User input is never interpolated into a shell command.

## Postman testing

1. Configure `OPENAI_API_KEY`, start the backend, and create a `GET` request to `http://localhost:8000/api/v1/health`. Confirm both media tools report `available: true` and OpenAI reports `configured: true`.
2. Create a `POST` request to `http://localhost:8000/api/v1/videos/upload`.
3. Open **Body → form-data**. Add the key `video`, change its type from Text to **File**, and choose a real `.mp4` or `.mov` file. Optionally add a text key `caption`. Do not manually add a `Content-Type` header; Postman supplies the multipart boundary.
4. Send the request and confirm HTTP 202. Copy `data.videoId`.
5. Create a `GET` request to `http://localhost:8000/api/v1/videos/{{videoId}}/status`, replacing `{{videoId}}` with the copied ID or defining a Postman variable. Repeat until the status is `COMPLETED` or `FAILED`.
6. Send `GET http://localhost:8000/api/v1/videos/{{videoId}}` for metadata and output information.
7. Send `GET http://localhost:8000/api/v1/videos/{{videoId}}/analysis`. While processing it returns HTTP 202 with `analysis: null`; after completion it returns HTTP 200 and the structured result.
8. Inspect `backend/uploads`, `backend/extracted/<videoId>/audio.mp3`, `frames`, `metadata.json`, and `analysis.json`.
9. Repeat the analysis GET and confirm it returns the same stored result without another processing run.
10. Repeat with a silent video and a corrupted `.mp4`. A real provider failure can be tested with an invalid key only in a disposable development environment; restore the correct key afterward.

Equivalent upload command:

```bash
curl -F "video=@/absolute/path/to/sample.mp4;type=video/mp4" \
  -F "caption=A technical introduction" \
  http://localhost:8000/api/v1/videos/upload
```

### Completed analysis response — HTTP 200

```json
{
  "success": true,
  "message": "Reel analysis retrieved.",
  "data": {
    "videoId": "9d3ee3e4-e5a2-42dc-a824-d94bf11880dc",
    "status": "COMPLETED",
    "analysis": {
      "videoId": "9d3ee3e4-e5a2-42dc-a824-d94bf11880dc",
      "createdAt": "2026-11-10T12:00:02.000Z",
      "summary": "A person explains an API concept using a diagram.",
      "topics": [{ "name": "Technology", "confidence": 0.94 }],
      "interests": [{ "name": "Programming", "confidence": 0.91 }],
      "humour": { "present": false, "style": [], "confidence": 0.88 },
      "mood": { "primary": "Informative", "secondary": ["Curious"], "confidence": 0.88 },
      "contentCategory": "Education",
      "visualObservations": ["A technical diagram is visible on a screen."],
      "keywords": ["API", "Technology", "Programming"],
      "language": "English",
      "confidence": 0.89,
      "transcript": {
        "status": "COMPLETED",
        "text": "The actual transcript returned by the speech-to-text model.",
        "error": null
      },
      "visual": {
        "status": "COMPLETED",
        "selectedFrameCount": 6,
        "analysis": {
          "observations": ["A person presents beside a screen."],
          "objects": ["screen", "diagram"],
          "activities": ["presenting"],
          "scenes": ["indoor workspace"],
          "visibleText": ["API"],
          "context": "A short technical presentation."
        },
        "error": null
      },
      "warnings": []
    }
  }
}
```

## Automated verification

With FFmpeg installed, run:

```bash
cd backend
npm run typecheck
npm test
```

The integration suite generates real MP4/MOV fixtures and checks the complete media pipeline with a mocked AI boundary. Unit tests cover schemas, missing/empty/corrupted audio, transcription fallback, vision fallback, frame limits, near-duplicate removal, JPEG compression, silent videos, provider failures, malformed output, and unusable evidence. API tests additionally cover pending/completed/failed analysis responses, captions, persisted `analysis.json`, and repeated reads without duplicate AI calls. No OpenAI request or API key is used by the automated suite. Test artifacts are removed afterward; the oversized-file test allocates just over 100 MiB of memory.

## Troubleshooting

### `ffmpeg` or `ffprobe` not found

- Confirm `ffmpeg -version` and `ffprobe -version` work in the same terminal used to start Node.
- Restart the terminal after installation.
- Set absolute executable paths in `.env`, for example `/opt/homebrew/bin/ffmpeg` and `/opt/homebrew/bin/ffprobe` on Apple Silicon Homebrew installations.

### Upload immediately becomes `FAILED`

- Check the backend console for the detailed FFprobe/FFmpeg error.
- Confirm the file is a real, playable MP4/MOV and not merely renamed.
- Confirm the duration and size limits.
- Check write permissions for `uploads` and `extracted`.

### MP3 extraction fails with an encoder error

Install a full FFmpeg build that includes `libmp3lame`. Videos without audio do not need this encoder because extraction is skipped.

### No frames are generated

Confirm the file contains a decodable video stream. Very short valid videos use a fallback first-frame extraction. Corrupted streams are marked `FAILED`, and partial frames are cleaned up.

### Processing times out

Increase `FFMPEG_TIMEOUT_MS` or `OPENAI_TIMEOUT_MS` cautiously, or use smaller/shorter inputs. Do not remove duration, frame, upload-size, or execution-time limits on a public server.

### AI analysis is unavailable

- Confirm `OPENAI_API_KEY` is set in the backend `.env` and restart the server.
- Confirm the account has access to all three configured models and available billing/quota.
- Check provider status and backend logs for timeout, rate-limit, or transient-error retries.
- If only transcription or vision fails, inspect `warnings`, `transcript.status`, and `visual.status` in a completed result.
- If the final combined analysis fails, the job is `FAILED`; valid extracted media is retained, but automatic job retries are not yet implemented.

## Current limitations and API costs

- Job status is process-local memory: restarting the server clears API job history, although completed files remain on disk.
- `setImmediate` provides no persistent queue, retries, distributed workers, or backpressure. The isolated scheduling method is the future BullMQ integration point.
- There is no endpoint to download/delete processed media, authenticate users, or resume failed jobs.
- Local disk usage is not automatically reclaimed after successful processing.
- CORS uses the permissive development default and should be restricted before deployment.
- OpenAI calls incur usage charges. Costs grow with audio duration, selected frame count, image detail, transcript length, and output tokens; tune the provided limits before production use.
- Very long transcripts are stored in full but truncated only for the combined prompt, so the final summary may not reflect omitted trailing speech.
- Frame sampling can miss brief visual events, and pixel-based deduplication is heuristic rather than semantic.
- AI outputs and confidence scores can be wrong. They describe observed content and must not be treated as personality assessments or factual guarantees.
- Real OpenAI integration requires a manual API-key/billing check; automated tests intentionally use mocked provider responses.
- Failed jobs do not yet have a retry endpoint, and completed results are not reconstructed into the in-memory registry after a restart.
