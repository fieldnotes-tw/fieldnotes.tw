import 'dotenv/config';
import { eq, sql } from 'drizzle-orm';
import { db } from './index.js';
import { phenomena, sightings } from './schema.js';

const titleQuery = process.argv[2]?.trim() || '棋盤腳';

async function main() {
  const [row] = await db
    .select({ id: phenomena.id, title: phenomena.title })
    .from(phenomena)
    .where(sql`${phenomena.title} ilike ${`%${titleQuery}%`}`)
    .limit(1);

  if (!row) {
    console.log(`No phenomenon matching "${titleQuery}".`);
    process.exit(1);
  }

  const deleted = await db
    .delete(sightings)
    .where(eq(sightings.phenomenonId, row.id))
    .returning({ id: sightings.id });

  console.log(`Deleted ${deleted.length} sighting(s) for "${row.title}".`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
