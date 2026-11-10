import { promises as fs } from 'node:fs';
import path from 'node:path';
import { env } from '../config/env';

export async function ensureStorageDirectories(): Promise<void> {
  await Promise.all([
    fs.mkdir(env.uploadPath, { recursive: true }),
    fs.mkdir(env.extractedPath, { recursive: true }),
  ]);
}

export async function removeFileIfExists(filePath: string): Promise<void> {
  await fs.rm(filePath, { force: true });
}

export async function removeDirectoryIfExists(directoryPath: string): Promise<void> {
  await fs.rm(directoryPath, { recursive: true, force: true });
}

export async function listFrameFilenames(framesDirectory: string): Promise<string[]> {
  const entries = await fs.readdir(framesDirectory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /^frame_\d{3,}\.jpg$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

export async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  const temporaryPath = `${filePath}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(temporaryPath, filePath);
}

export function toRelativeDirectory(directoryPath: string): string {
  return path.relative(process.cwd(), directoryPath).split(path.sep).join(path.posix.sep);
}
