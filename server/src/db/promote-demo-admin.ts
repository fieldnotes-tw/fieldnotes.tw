import { eq, sql } from 'drizzle-orm';
import { db } from './index.js';
import { users } from './schema.js';

async function main() {
  const email = process.env.DEMO_MEMBER_EMAIL?.trim().toLowerCase();
  let target = null;

  if (email) {
    [target] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
  }

  if (!target) {
    [target] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(sql`lower(${users.displayName}) = 'chao'`)
      .limit(1);
  }

  if (!target) {
    console.error('Demo member account not found. Set DEMO_MEMBER_EMAIL or use displayName Chao.');
    process.exit(1);
  }

  if (target.role === 'admin') {
    console.log('Already admin.');
    process.exit(0);
  }

  await db
    .update(users)
    .set({ role: 'admin', updatedAt: new Date() })
    .where(eq(users.id, target.id));

  console.log('Promoted demo member to admin.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
