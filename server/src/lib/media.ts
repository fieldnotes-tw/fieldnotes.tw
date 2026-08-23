import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

const FILENAME_RE = /^[0-9a-f-]{36}\.(jpg|png|webp|mp4|webm|mov)$/i;
/** Seed / legacy filenames (e.g. moorhen-chick.jpg) — serving only, not uploads. */
const SERVE_FILENAME_RE = /^[a-z0-9][a-z0-9-]{0,62}\.(jpg|jpeg|png|webp|mp4|webm|mov)$/i;

const here = dirname(fileURLToPath(import.meta.url));
const localMediaRoot = join(here, '../../public');
const execFileAsync = promisify(execFile);

export function videoPosterPublicPath(publicPath: string) {
  if (!/\.(mp4|webm|mov)(\?|#|$)/i.test(publicPath)) return undefined;
  return publicPath.replace(/\.(mp4|webm|mov)(?=($|[?#]))/i, '-poster.jpg');
}

async function extractVideoPoster(sourceAbs: string) {
  const dir = dirname(sourceAbs);
  const base = basename(sourceAbs).replace(/\.(mp4|mov|webm)$/i, '');
  const posterAbs = join(dir, `${base}-poster.jpg`);
  try {
    await execFileAsync('ffmpeg', [
      '-i', sourceAbs,
      '-ss', '0.5',
      '-frames:v', '1',
      '-update', '1',
      '-vf', 'scale=960:-2',
      '-q:v', '3',
      '-y', posterAbs,
    ], { timeout: 120_000 });
    await stat(posterAbs);
    return posterAbs;
  } catch (err) {
    await unlink(posterAbs).catch(() => {});
    console.error('Video poster extraction failed', basename(sourceAbs), err);
    return null;
  }
}

async function transcodeVideoToMp4(sourceAbs: string) {
  const dir = dirname(sourceAbs);
  const base = basename(sourceAbs).replace(/\.(mov|webm|mp4)$/i, '');
  const destAbs = join(dir, `${base}.mp4`);
  const tempAbs = join(dir, `${base}.tmp.mp4`);

  try {
    // Re-encode (not stream copy) so iPhone rotation metadata is baked in.
    await execFileAsync('ffmpeg', [
      '-i', sourceAbs,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart',
      '-y', tempAbs,
    ], { timeout: 600_000 });
    if (sourceAbs !== tempAbs) await unlink(sourceAbs).catch(() => {});
    await unlink(destAbs).catch(() => {});
    await rename(tempAbs, destAbs);
    return destAbs;
  } catch (err) {
    await unlink(tempAbs).catch(() => {});
    console.error('Video transcode failed', basename(sourceAbs), err);
    return null;
  }
}

export { transcodeVideoToMp4, extractVideoPoster };

export function mediaBucket() {
  return process.env.MEDIA_BUCKET?.trim() || '';
}

export function mediaPublicPrefix() {
  const prefix = process.env.MEDIA_PUBLIC_PREFIX?.trim() || '/media';
  return prefix.startsWith('/') ? prefix.replace(/\/$/, '') : `/${prefix.replace(/\/$/, '')}`;
}

/** S3 when MEDIA_BUCKET is set; otherwise write under server/public/media for local dev. */
export function mediaBackend(): 's3' | 'local' {
  return mediaBucket() ? 's3' : 'local';
}

export function normalizeContentType(contentType: string) {
  return contentType.split(';')[0]?.trim().toLowerCase() || '';
}

export function isAllowedContentType(contentType: string) {
  return Boolean(ALLOWED_TYPES[normalizeContentType(contentType)]);
}

export function isSafeMediaFilename(filename: string) {
  return FILENAME_RE.test(filename);
}

export function isSafeServeMediaFilename(filename: string) {
  return isSafeMediaFilename(filename) || SERVE_FILENAME_RE.test(filename);
}

function newObjectName(contentType: string) {
  const ext = ALLOWED_TYPES[normalizeContentType(contentType)];
  if (!ext) {
    throw new Error('Unsupported content type');
  }
  const filename = `${randomUUID()}.${ext}`;
  const key = `media/phenomena/${filename}`;
  const publicPath = `${mediaPublicPrefix()}/phenomena/${filename}`;
  return { filename, key, publicPath, contentType, ext };
}

export async function createUploadUrl(
  contentType: string,
  options?: { localUploadBase?: string },
) {
  const { filename, key, publicPath } = newObjectName(contentType);
  const localBase = options?.localUploadBase ?? '/api/admin/uploads/local';

  if (mediaBackend() === 'local') {
    return {
      uploadUrl: `${localBase}/${filename}`,
      publicPath,
      key,
      contentType,
      backend: 'local' as const,
    };
  }

  const bucket = mediaBucket();
  const client = new S3Client({
    region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-east-2',
  });

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 60 * 5 });

  return {
    uploadUrl,
    publicPath,
    key,
    contentType,
    backend: 's3' as const,
  };
}

export type LocalUploadResult = {
  publicPath: string;
  posterPath?: string;
};

export async function saveLocalUpload(
  filename: string,
  body: ArrayBuffer,
  contentType: string,
): Promise<LocalUploadResult> {
  if (!isSafeMediaFilename(filename)) {
    throw new Error('Invalid filename');
  }
  const normalizedType = normalizeContentType(contentType);
  if (!isAllowedContentType(normalizedType)) {
    throw new Error('Unsupported content type');
  }

  const expectedExt = ALLOWED_TYPES[normalizedType];
  if (!filename.toLowerCase().endsWith(`.${expectedExt}`)) {
    throw new Error('Content type mismatch');
  }

  const abs = join(localMediaRoot, 'media', 'phenomena', filename);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, Buffer.from(body));

  let finalFilename = filename;
  let finalAbs = abs;
  let posterPath: string | undefined;

  if (normalizedType.startsWith('video/')) {
    const mp4Abs = await transcodeVideoToMp4(abs);
    if (mp4Abs) {
      finalFilename = basename(mp4Abs);
      finalAbs = mp4Abs;
    }
    const posterAbs = await extractVideoPoster(finalAbs);
    if (posterAbs) {
      posterPath = `${mediaPublicPrefix()}/phenomena/${basename(posterAbs)}`;
    }
  }

  return {
    publicPath: `${mediaPublicPrefix()}/phenomena/${finalFilename}`,
    posterPath,
  };
}
