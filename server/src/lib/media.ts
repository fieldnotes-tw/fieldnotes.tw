import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const FILENAME_RE = /^[0-9a-f-]{36}\.(jpg|png|webp)$/i;

const here = dirname(fileURLToPath(import.meta.url));
const localMediaRoot = join(here, '../../public');

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

export function isAllowedContentType(contentType: string) {
  return Boolean(ALLOWED_TYPES[contentType]);
}

export function isSafeMediaFilename(filename: string) {
  return FILENAME_RE.test(filename);
}

function newObjectName(contentType: string) {
  const ext = ALLOWED_TYPES[contentType];
  if (!ext) {
    throw new Error('Unsupported content type');
  }
  const filename = `${randomUUID()}.${ext}`;
  const key = `media/phenomena/${filename}`;
  const publicPath = `${mediaPublicPrefix()}/phenomena/${filename}`;
  return { filename, key, publicPath, contentType, ext };
}

export async function createUploadUrl(contentType: string) {
  const { filename, key, publicPath } = newObjectName(contentType);

  if (mediaBackend() === 'local') {
    return {
      uploadUrl: `/api/admin/uploads/local/${filename}`,
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

export async function saveLocalUpload(filename: string, body: ArrayBuffer, contentType: string) {
  if (!isSafeMediaFilename(filename)) {
    throw new Error('Invalid filename');
  }
  if (!isAllowedContentType(contentType)) {
    throw new Error('Unsupported content type');
  }

  const expectedExt = ALLOWED_TYPES[contentType];
  if (!filename.toLowerCase().endsWith(`.${expectedExt}`)) {
    throw new Error('Content type mismatch');
  }

  const abs = join(localMediaRoot, 'media', 'phenomena', filename);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, Buffer.from(body));
  return `${mediaPublicPrefix()}/phenomena/${filename}`;
}
