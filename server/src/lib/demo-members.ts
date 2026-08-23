import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { phenomena, sightingImages, sightings, users } from '../db/schema.js';
import { hashPassword } from './auth.js';
import { getPrimarySpotId } from './spots.js';

export const CHEN_EN_BIO = `陳恩是退休的國中老師，也曾擔任生態解說志工，現在仍然非常喜歡自然、長期關心凹仔底公園的生態。她會觀察黃鸝一年築了幾個巢、用了什麼材料，也留意落羽杉什麼時候變色、雀榕什麼時候整樹落葉，再重新長出新葉。

她擅長觀察不同生命怎麼在城市裡生活，也常從植物、鳥和人的生活中，看見彼此之間的關係。`;

export const PODCARPUS_TITLE = '來找羅漢松的「小羅漢」，會慢慢變紅哦';

export async function resolveChenEnUserId() {
  const [byName] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.displayName, '陳恩'))
    .limit(1);
  return byName?.id ?? null;
}

async function linkChenEnContent(userId: string) {
  await db
    .update(phenomena)
    .set({ userId, observerName: null, updatedAt: new Date() })
    .where(eq(phenomena.observerName, '陳恩'));

  await db
    .update(sightings)
    .set({ userId, observerName: null })
    .where(eq(sightings.observerName, '陳恩'));
}

async function ensureChenEnPodocarpusSighting(userId: string) {
  const [phenomenon] = await db
    .select({ id: phenomena.id })
    .from(phenomena)
    .where(eq(phenomena.title, PODCARPUS_TITLE))
    .limit(1);
  if (!phenomenon) return;

  await db
    .update(phenomena)
    .set({ userId, observerName: null, updatedAt: new Date() })
    .where(eq(phenomena.id, phenomenon.id));

  const [existing] = await db
    .select({ id: sightings.id })
    .from(sightings)
    .where(and(
      eq(sightings.phenomenonId, phenomenon.id),
      eq(sightings.userId, userId),
    ))
    .limit(1);
  if (existing) return;

  const spotId = await getPrimarySpotId(phenomenon.id);
  if (!spotId) return;

  const [inserted] = await db
    .insert(sightings)
    .values({
      phenomenonId: phenomenon.id,
      spotId,
      userId,
      seenAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      note: '雌株的種子正慢慢成熟，可以找找看可愛的「小羅漢」。',
    })
    .returning({ id: sightings.id });

  await db.insert(sightingImages).values({
    sightingId: inserted.id,
    imageUrl: '/media/phenomena/podocarpus.jpg',
    imageAlt: '凹子底公園旁、迷路小章魚左前方的羅漢松',
    sortOrder: 0,
  });
}

export async function ensureChenEnMember() {
  const email = (process.env.DEMO_CHENEN_EMAIL ?? 'chenen@fieldnotes.tw').trim().toLowerCase();
  let userId = await resolveChenEnUserId();

  if (!userId) {
    const [byEmail] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    userId = byEmail?.id ?? null;
  }

  if (!userId) {
    const password = process.env.DEMO_CHENEN_PASSWORD ?? 'demo-chenen-not-for-login';
    const [created] = await db
      .insert(users)
      .values({
        email,
        passwordHash: await hashPassword(password),
        displayName: '陳恩',
        bio: CHEN_EN_BIO,
        role: 'user',
        emailVerifiedAt: new Date(),
      })
      .returning({ id: users.id });
    userId = created.id;
    console.log('Created 陳恩 demo member account.');
  } else {
    await db
      .update(users)
      .set({
        displayName: '陳恩',
        bio: CHEN_EN_BIO,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
    console.log('Updated 陳恩 member profile.');
  }

  await linkChenEnContent(userId);
  await ensureChenEnPodocarpusSighting(userId);
  return userId;
}
