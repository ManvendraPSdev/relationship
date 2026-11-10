# Reel Compatibility AI — Milestone 1 Backend

Express and TypeScript backend for uploading MP4/MOV videos and asynchronously extracting metadata, MP3 audio, and one JPEG frame per second with FFmpeg. This milestone intentionally has no AI, authentication, database, Instagram integration, or frontend.

## Prerequisites

- Node.js 20 or later
- npm
- FFmpeg and FFprobe installed as system binaries
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

Environment values are validated with Zod at startup. No secrets are required in this milestone.

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
| `GET` | `/api/v1/health` | Check backend, FFmpeg, and FFprobe availability |

Upload rules:

- Multipart field name: `video`
- Extensions: `.mp4`, `.mov`
- MIME types: `video/mp4`, `video/quicktime`
- Maximum size: 100 MiB by default
- Maximum duration: 300 seconds by default
- Only one file per request

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

Unsupported extensions/MIME types return HTTP 400, oversized uploads return HTTP 413, unknown IDs return HTTP 404, and unexpected server errors return HTTP 500. FFprobe failures discovered after upload are represented by a `FAILED` job because processing is asynchronous.

### Health response — HTTP 200

```json
{
  "success": true,
  "message": "Backend and media tools are available.",
  "data": {
    "status": "ok",
    "timestamp": "2026-11-10T12:00:00.000Z",
    "ffmpeg": { "available": true },
    "ffprobe": { "available": true }
  }
}
```

`data.status` is `degraded` when either executable is unavailable.

## Complete request lifecycle

1. A React client, Postman, or another HTTP client sends `multipart/form-data` to `POST /api/v1/videos/upload`. The file part is named `video`.
2. Multer checks the extension, MIME type, file count, and 100 MiB size limit. The client filename is never used as a storage path.
3. Multer writes the original video to `uploads/<uuid>.<ext>`. The UUID becomes the public `videoId`.
4. The video service creates an in-memory job with `UPLOADED`, changes it to `PROCESSING`, and schedules asynchronous work with `setImmediate`. The client receives HTTP 202 without waiting for media processing.
5. FFprobe inspects the stored bytes. The service rejects non-MP4/MOV containers, files without a valid video stream, unreadable files, and videos over the duration limit. It records duration, dimensions, frame rate, codecs, and file size.
6. For videos with an audio stream, FFmpeg decodes the audio and writes `extracted/<videoId>/audio.mp3` using the MP3 LAME encoder. Video is excluded with `-vn`. Videos without audio skip this step.
7. FFmpeg applies the `fps=1` filter to sample one frame per second, sequentially writing JPEGs to `extracted/<videoId>/frames/frame_%03d.jpg`. `-frames:v` enforces the frame cap. A very short video that produces no sampled frame gets a one-frame fallback.
8. The service counts the actual JPEG files and atomically writes `extracted/<videoId>/metadata.json`. The original upload remains unchanged.
9. The job becomes `COMPLETED`. Clients poll `/status` and then retrieve the full processing result from `/:videoId`.
10. On failure, the job becomes `FAILED`, partial extracted files are removed, and invalid uploads are deleted. API responses contain relative output directories, never arbitrary absolute server paths.

FFmpeg and FFprobe are launched with `child_process.spawn`, fixed argument arrays, and `shell: false`. User input is never interpolated into a shell command.

## Postman testing

1. Start the backend and create a `GET` request to `http://localhost:8000/api/v1/health`. Confirm both media tools report `available: true`.
2. Create a `POST` request to `http://localhost:8000/api/v1/videos/upload`.
3. Open **Body → form-data**. Add the key `video`, change its type from Text to **File**, and choose a real `.mp4` or `.mov` file. Do not manually add a `Content-Type` header; Postman supplies the multipart boundary.
4. Send the request and confirm HTTP 202. Copy `data.videoId`.
5. Create a `GET` request to `http://localhost:8000/api/v1/videos/{{videoId}}/status`, replacing `{{videoId}}` with the copied ID or defining a Postman variable. Repeat until the status is `COMPLETED` or `FAILED`.
6. Send `GET http://localhost:8000/api/v1/videos/{{videoId}}` for metadata and output information.
7. Inspect `backend/uploads`, `backend/extracted/<videoId>/audio.mp3`, `frames`, and `metadata.json`.
8. Repeat with a text file renamed to `.txt`, a file over 100 MiB, a silent video, and a corrupted `.mp4` to verify error handling.

Equivalent upload command:

```bash
curl -F "video=@/absolute/path/to/sample.mp4;type=video/mp4" \
  http://localhost:8000/api/v1/videos/upload
```

## Automated verification

With FFmpeg installed, run:

```bash
cd backend
npm run typecheck
npm test
```

The integration suite generates real MP4/MOV fixtures and checks health, upload, storage, metadata, audio, frames, silent video, short video, unsupported formats, MIME mismatch, missing files, 100 MiB limit, corrupted media, UUID validation, unknown IDs, and terminal processing statuses. Test artifacts are removed afterward. The oversized-file test allocates just over 100 MiB of memory.

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

Increase `FFMPEG_TIMEOUT_MS` cautiously, or use smaller/shorter inputs. Do not remove duration, frame, upload-size, or execution-time limits on a public server.

## Milestone 1 limitations

- Job status is process-local memory: restarting the server clears API job history, although completed files remain on disk.
- `setImmediate` provides no persistent queue, retries, distributed workers, or backpressure. The isolated scheduling method is the future BullMQ integration point.
- There is no endpoint to download/delete processed media, authenticate users, or resume failed jobs.
- Local disk usage is not automatically reclaimed after successful processing.
- CORS uses the permissive development default and should be restricted before deployment.
