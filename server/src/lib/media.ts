import { randomUUID } from 'node:crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function mediaBucket() {
  return process.env.MEDIA_BUCKET?.trim() || '';
}

export function mediaPublicPrefix() {
  const prefix = process.env.MEDIA_PUBLIC_PREFIX?.trim() || '/media';
  return prefix.startsWith('/') ? prefix.replace(/\/$/, '') : `/${prefix.replace(/\/$/, '')}`;
}

export function isAllowedContentType(contentType: string) {
  return Boolean(ALLOWED_TYPES[contentType]);
}

export async function createUploadUrl(contentType: string) {
  const bucket = mediaBucket();
  if (!bucket) {
    throw new Error('MEDIA_BUCKET is not configured');
  }

  const ext = ALLOWED_TYPES[contentType];
  if (!ext) {
    throw new Error('Unsupported content type');
  }

  // CloudFront /media/* maps to S3 key media/...
  const filename = `${randomUUID()}.${ext}`;
  const key = `media/phenomena/${filename}`;
  const publicPath = `${mediaPublicPrefix()}/phenomena/${filename}`;

  const client = new S3Client({
    region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-east-2',
  });

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 60 * 5 });

  return { uploadUrl, publicPath, key, contentType };
}
