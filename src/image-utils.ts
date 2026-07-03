/**
 * Image utilities for TAPD MCP server.
 *
 * Extracts <img> URLs from HTML descriptions and downloads the images
 * to a local temp directory so the calling agent can read them via
 * Read / file tools.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';

let downloadDirPath: string | null = null;

function getDownloadDir(): string {
  if (!downloadDirPath) {
    downloadDirPath = join(tmpdir(), 'tapd-mcp-images');
  }
  return downloadDirPath;
}

export function setDownloadDir(dir: string): void {
  downloadDirPath = dir;
}

export interface DownloadedImage {
  source: string;
  filename: string;
  local_path: string;
  mime_type: string;
  size: number;
}

export function extractImageUrls(html: string): string[] {
  if (!html) return [];
  const urls: string[] = [];
  const re = /<img[^>]+src\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const src = m[1].trim();
    if (src) urls.push(src);
  }
  return urls;
}

function mimeFromExtension(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp',
    svg: 'image/svg+xml',
  };
  return map[ext] || 'application/octet-stream';
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function safeFilename(url: string): string {
  let name = url.split('/').pop() || 'image';
  name = name.split('?')[0];
  name = name.replace(/[<>:"/\|?*]/g, '_');
  const hash = hashString(url).toString(16).slice(0, 8);
  return `${hash}_${name}`;
}

export async function downloadImage(
  url: string,
  customFetch?: typeof fetch
): Promise<DownloadedImage> {
  const fn = customFetch || fetch;
  const dir = getDownloadDir();

  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  const response = await fn(url);
  if (!response.ok) {
    throw new Error(
      `Failed to download image: HTTP ${response.status} ${response.statusText} (${url})`
    );
  }

  const contentType = response.headers.get('content-type') || '';
  const mimeType = contentType.split(';')[0].trim() || mimeFromExtension(url);
  const buffer = Buffer.from(await response.arrayBuffer());
  const fname = safeFilename(url);
  const localPath = join(dir, fname);

  await writeFile(localPath, buffer);

  return {
    source: url,
    filename: fname,
    local_path: localPath,
    mime_type: mimeType,
    size: buffer.length,
  };
}

export async function downloadImages(
  urls: string[],
  customFetch?: typeof fetch
): Promise<{
  images: DownloadedImage[];
  errors: Array<{ url: string; error: string }>;
}> {
  const images: DownloadedImage[] = [];
  const errors: Array<{ url: string; error: string }> = [];

  for (const url of urls) {
    try {
      const img = await downloadImage(url, customFetch);
      images.push(img);
    } catch (e) {
      errors.push({
        url,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { images, errors };
}

export function isTapdInlineImage(path: string): boolean {
  return /\/tfl\/captures\//.test(path) && !/^https?:\/\//.test(path);
}
