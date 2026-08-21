import 'dotenv/config';
import { readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { eq } from 'drizzle-orm';
import { db } from './index.js';
import { phenomena, phenomenonImages, sightingImages } from './schema.js';
import { mediaPublicPrefix, transcodeVideoToMp4 } from '../lib/media.js';
import { publicRoot } from '../lib/assets.js';

const mediaDir = join(publicRoot(), 'media', 'phenomena');
const prefix = mediaPublicPrefix();

async function replaceMediaUrl(oldPath: string, newPath: string) {
  if (oldPath === newPath) return;
  await db.update(phenomena).set({ imageUrl: newPath }).where(eq(phenomena.imageUrl, oldPath));
  await db.update(phenomenonImages).set({ imageUrl: newPath }).where(eq(phenomenonImages.imageUrl, oldPath));
  await db.update(sightingImages).set({ imageUrl: newPath }).where(eq(sightingImages.imageUrl, oldPath));
}

async function main() {
  const files = await readdir(mediaDir);
  const videoFiles = files.filter((name) => /\.(mov|webm|mp4)$/i.test(name));
  if (!videoFiles.length) {
    console.log('No video files to transcode.');
    return;
  }

  for (const filename of videoFiles) {
    const abs = join(mediaDir, filename);
    const publicPath = `${prefix}/phenomena/${filename}`;
    console.log(`Transcoding ${filename}…`);
    const mp4Abs = await transcodeVideoToMp4(abs);
    if (!mp4Abs) {
      console.warn(`Skipped ${filename} (transcode failed).`);
      continue;
    }
    const newPath = `${prefix}/phenomena/${basename(mp4Abs)}`;
    await replaceMediaUrl(publicPath, newPath);
    console.log(`Done: ${basename(mp4Abs)}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
