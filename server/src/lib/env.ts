import { config } from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = join(here, '../../..');
export const serverRoot = join(here, '../..');

// Load server/.env whether we were started from repo root or server/.
config({ path: join(serverRoot, '.env') });

export function isDev() {
  return process.env.NODE_ENV !== 'production';
}
