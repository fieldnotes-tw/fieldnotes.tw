import { createReadStream, statSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type { Context } from 'hono';
import { isSafeServeMediaFilename } from './media.js';
import { publicRoot } from './assets.js';

const MEDIA_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/mp4',
};

function mediaContentType(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return MEDIA_MIME[ext] ?? 'application/octet-stream';
}

function phenomenonMediaPath(filename: string) {
  return join(publicRoot(), 'media', 'phenomena', filename);
}

/** Stream uploaded media with correct MIME types and byte-range support for video. */
export async function servePhenomenonMedia(c: Context) {
  const filename = c.req.param('filename');
  if (!filename || !isSafeServeMediaFilename(filename)) {
    return c.text('Not found', 404);
  }

  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(phenomenonMediaPath(filename));
  } catch {
    return c.text('Not found', 404);
  }

  const size = stat.size;
  const contentType = mediaContentType(filename);
  const rangeHeader = c.req.header('range');

  c.header('Accept-Ranges', 'bytes');
  c.header('Cache-Control', 'public, max-age=31536000, immutable');

  if (rangeHeader) {
    const match = /^bytes=(\d+)-(\d*)$/i.exec(rangeHeader);
    if (!match) {
      return c.body(null, 416, { 'Content-Range': `bytes */${size}` });
    }

    const start = Number.parseInt(match[1], 10);
    const end = match[2] ? Number.parseInt(match[2], 10) : size - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start >= size || end >= size || start > end) {
      return c.body(null, 416, { 'Content-Range': `bytes */${size}` });
    }

    const chunkSize = end - start + 1;
    c.header('Content-Range', `bytes ${start}-${end}/${size}`);
    c.header('Content-Length', String(chunkSize));
    c.header('Content-Type', contentType);

    const stream = createReadStream(phenomenonMediaPath(filename), { start, end });
    return c.body(Readable.toWeb(stream) as ReadableStream, 206);
  }

  c.header('Content-Length', String(size));
  c.header('Content-Type', contentType);
  const stream = createReadStream(phenomenonMediaPath(filename));
  return c.body(Readable.toWeb(stream) as ReadableStream, 200);
}
