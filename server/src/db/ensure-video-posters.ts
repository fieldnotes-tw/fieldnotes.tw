import 'dotenv/config';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { extractVideoPoster, mediaPublicPrefix, transcodeVideoToMp4 } from '../lib/media.js';
import { publicRoot } from '../lib/assets.js';

const mediaDir = join(publicRoot(), 'media', 'phenomena');

async function main() {
  const files = await readdir(mediaDir);
  const videos = files.filter((name) => /\.(mp4|mov|webm)$/i.test(name));
  if (!videos.length) {
    console.log('No videos found.');
    return;
  }

  for (const filename of videos) {
    const abs = join(mediaDir, filename);
    let sourceAbs = abs;

    if (/\.(mov|webm)$/i.test(filename)) {
      console.log(`Transcoding ${filename}…`);
      const mp4Abs = await transcodeVideoToMp4(abs);
      if (mp4Abs) sourceAbs = mp4Abs;
    }

    const posterAbs = join(
      mediaDir,
      `${sourceAbs.split('/').pop()?.replace(/\.(mp4|mov|webm)$/i, '')}-poster.jpg`,
    );

    try {
      await stat(posterAbs);
      console.log(`Poster exists: ${posterAbs.split('/').pop()}`);
      continue;
    } catch {
      /* generate below */
    }

    console.log(`Poster for ${sourceAbs.split('/').pop()}…`);
    const created = await extractVideoPoster(sourceAbs);
    if (created) {
      console.log(`  → ${created.split('/').pop()}`);
    } else {
      console.warn(`  ✗ failed`);
    }
  }

  console.log('Done.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
