import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '../../public');

type Manifest = Record<
  string,
  {
    file: string;
    css?: string[];
    isEntry?: boolean;
  }
>;

let cached: { css: string; js: string } | null = null;

function loadManifest(): Manifest {
  const path = join(publicDir, 'assets/.vite/manifest.json');
  return JSON.parse(readFileSync(path, 'utf8')) as Manifest;
}

/** Resolved hashed asset URLs from the Vite manifest. */
export function getAssets(): { css: string; js: string } {
  if (cached && process.env.NODE_ENV === 'production') return cached;

  try {
    const manifest = loadManifest();
    const entry =
      manifest['client/main.js'] ||
      Object.values(manifest).find((entry) => entry.isEntry);

    if (!entry) {
      throw new Error('No Vite entry in manifest');
    }

    const cssFile = entry.css?.[0];
    cached = {
      js: `/assets/${entry.file.replace(/^\/?assets\//, '')}`,
      css: cssFile
        ? `/assets/${cssFile.replace(/^\/?assets\//, '')}`
        : '/assets/styles.css',
    };
  } catch {
    // Dev fallback before the first assets build.
    cached = {
      js: '/assets/main.js',
      css: '/assets/styles.css',
    };
  }

  return cached;
}

export function publicRoot(): string {
  return publicDir;
}
