/**
 * Upload seed JPGs from ../public/images into the media bucket.
 *
 * Usage:
 *   MEDIA_BUCKET=fieldnotes-staging-media-... AWS_REGION=ap-east-2 \
 *     npx tsx scripts/upload-seed-media.ts
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const imagesDir = path.resolve(__dirname, '../../public/images');

async function main() {
  const bucket = process.env.MEDIA_BUCKET?.trim();
  if (!bucket) {
    throw new Error('MEDIA_BUCKET is required');
  }

  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-east-2';
  const client = new S3Client({ region });
  const files = (await readdir(imagesDir)).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));

  if (files.length === 0) {
    throw new Error(`No images found in ${imagesDir}`);
  }

  for (const file of files) {
    const body = await readFile(path.join(imagesDir, file));
    const key = `media/phenomena/${file.replace(/\.jpeg$/i, '.jpg')}`;
    const contentType = file.toLowerCase().endsWith('.png')
      ? 'image/png'
      : file.toLowerCase().endsWith('.webp')
        ? 'image/webp'
        : 'image/jpeg';

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    console.log(`Uploaded s3://${bucket}/${key}`);
  }

  console.log(`Done. ${files.length} file(s) uploaded.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
