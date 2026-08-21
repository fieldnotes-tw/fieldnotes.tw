import { eq, or, sql } from 'drizzle-orm';
import { db } from './index.js';
import { phenomena, sightingImages, sightings, users } from './schema.js';
import { createPrimarySpotForPhenomenon, getPrimarySpotId } from '../lib/spots.js';
import { hashPassword } from '../lib/auth.js';

const seedData = [
  {
    status: 'active' as const,
    category: 'plant' as const,
    title: '來找羅漢松的「小羅漢」，會慢慢變紅哦',
    description: '雌株的種子正慢慢成熟，可以找找看可愛的「小羅漢」。',
    location: '凹子底公園旁 · 迷路小章魚左前方',
    notes: `你可曾留意過豪宅門前總少不了什麼植栽？俗諺說：「家有羅漢松，一世不會窮。」是的，就是終年長青的羅漢松。

目前已過了羅漢松的盛花期，雄株的毬花多半已經枯萎掉落，而雌株的種子正慢慢成熟中。這時候可以特別找找看它可愛的「小羅漢」。

🔎 為什麼叫羅漢松？
仔細看看它的種子，圓圓的種子長在膨大的紅色種托上，看起來就像一個頂著圓形光頭、披著紅色袈裟的羅漢佛像，十分可愛，因此有了「羅漢松」這個名字。

🔎 紅色的是果實嗎？
圓圓的頭可不是果實喔！羅漢松屬於裸子植物，還沒演化出果皮將種子包裹住。種子下方的種托成熟時會慢慢變成紅色，就像羅漢披著紅色袈裟的身體。

🔎 羅漢松也有公母
羅漢松是雌雄異株，也就是有公樹、母樹之別。雄株的毬花 3～5 朵叢生在葉腋，看起來有點像小毛毛蟲，成熟時會釋放出花粉。現在盛花期已過，雄株的毬花多半已經枯萎掉落；雌株的種子則正慢慢成熟。

🔎 下次也觀察看看
我曾經特別檢視過豪宅門前種植的羅漢松，發現大多是雄株。你知道為什麼嗎？下次經過羅漢松時，也可以試著找找看：眼前這棵究竟是公樹，還是母樹？`,
    lat: 22.6601,
    lng: 120.2992,
    imageUrl: '/media/phenomena/podocarpus.jpg',
    imageAlt: '凹子底公園旁、迷路小章魚左前方的羅漢松',
    observerName: '陳恩',
    metaLabel: '最近一次注意到 · 2 小時前',
    lastNoticedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    createdAt: new Date(),
  },
  {
    status: 'active' as const,
    category: 'animal' as const,
    title: '紅冠水雞生寶寶了',
    description: '蓮池潭龍虎塔旁，紅冠水雞生小寶寶了。',
    location: '蓮池潭龍虎塔旁',
    findingHint: '從龍虎塔步道往水塘方向走，留意蘆葦叢邊緣與睡蓮葉之間。',
    notes: `蓮池潭龍虎塔旁的水塘裡，最近常看到紅冠水雞帶著幼鳥覓食。

🔎 怎麼認？
頭頂有鮮紅的冠，嘴尖黃色，身體烏黑；幼鳥顏色較淡、還沒有紅冠。

🔎 在哪裡看？
龍虎塔東側水岸、步道旁蘆葦叢附近最容易看到。清晨和傍晚活動較頻繁。

⚠️ 請保持距離
親鳥正在護幼，請勿靠近或使用閃光燈，以免驚擾。`,
    lat: 22.6907,
    lng: 120.2951,
    imageUrl: '/media/phenomena/moorhen-chick.jpg',
    imageAlt: '紅冠水雞成鳥帶著幼鳥在水面覓食',
    observerName: 'Chao',
    metaLabel: '最近一次注意到 · 5 小時前',
    lastNoticedAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
  },
  {
    status: 'active' as const,
    category: 'plant' as const,
    title: '棋盤腳進入花季',
    description: '洲仔濕地的棋盤腳進入花季，晚上六點到七點開花。',
    location: '洲仔濕地公園',
    notes: '夜間光線昏暗，建議攜帶手電筒並注意路滑。',
    lat: 22.6978,
    lng: 120.2938,
    imageUrl: '/media/phenomena/qipan-jiao.jpg',
    imageAlt: '棋盤腳的花與果實，長長的花絲垂在葉叢間',
    observerName: '小華',
    metaLabel: '開花時間 · 18:00–19:00',
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
  },
  {
    status: 'active' as const,
    category: 'taste' as const,
    title: '第一批菱角上市',
    description: '哈囉市場開始賣今年第一批菱角了。',
    location: '哈囉市場',
    notes: '數量有限，建議提早前往。',
    lat: 22.6775,
    lng: 120.2935,
    imageUrl: '/media/phenomena/water-caltrop.jpg',
    imageAlt: '三顆黑色菱角平放在白色桌面上',
    observerName: '陳老闆',
    metaLabel: '上市時間 · 這幾天',
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
  },
];

async function seedAdmin() {
  const email = (process.env.ADMIN_EMAIL ?? 'admin@fieldnotes.tw').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!password) {
    console.log('ADMIN_PASSWORD not set; skipping admin user seed.');
    return;
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) {
    console.log(`Admin user "${email}" already exists; skipping.`);
    return;
  }

  await db.insert(users).values({
    email,
    passwordHash: await hashPassword(password),
    role: 'admin',
    emailVerifiedAt: new Date(),
  });
  console.log(`Seeded admin user "${email}".`);
}

async function seedPhenomena() {
  // Demo cards are opt-in. Production should stay empty until real observers post.
  // Local/staging: SEED_DEMO=1. Images live in public/images (or S3), not the app bundle.
  if (process.env.SEED_DEMO !== '1') {
    console.log('SEED_DEMO not set; skipping phenomena seed (empty catalog).');
    return;
  }

  const reset = process.env.SEED_RESET === '1';

  if (reset) {
    await db.execute(sql`TRUNCATE TABLE sightings, spots, phenomena CASCADE`);
    console.log('Truncated phenomena, spots, and sightings.');
  } else {
    const existing = await db.select({ id: phenomena.id }).from(phenomena).limit(1);
    if (existing.length > 0) {
      console.log('Phenomena already seeded; skipping. Set SEED_RESET=1 to replace.');
      return;
    }
  }

  for (const entry of seedData) {
    const [row] = await db
      .insert(phenomena)
      .values(entry)
      .returning({ id: phenomena.id });

    await createPrimarySpotForPhenomenon(row.id, {
      location: entry.location,
      lat: entry.lat,
      lng: entry.lng,
      findingHint: entry.findingHint ?? null,
    });
  }
  console.log(`Seeded ${seedData.length} demo phenomena with primary spots.`);
}

const sightingSeedByTitle: Record<string, {
  sightings: {
    observerName: string;
    seenAt: Date;
    condition?: 'abundant' | 'fewer' | 'gone' | 'unsure';
    note: string;
    imageUrl?: string;
    imageAlt?: string;
  }[];
}> = {
  '紅冠水雞生寶寶了': {
    sightings: [
      {
        observerName: 'Chao',
        seenAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
        condition: 'abundant',
        note: '大概六點，龍虎塔東邊水岸，三隻小的跟成鳥在找吃的，會鑽蘆葦。聽說是亞成鳥幫忙帶？有人看過嗎',
        imageUrl: '/media/phenomena/moorhen-chick.jpg',
      },
    ],
  },
};

async function resolveChaoUserId() {
  const email = process.env.DEMO_MEMBER_EMAIL?.trim().toLowerCase();
  if (email) {
    const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (row) return row.id;
  }
  const [byName] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.displayName}) = 'chao'`)
    .limit(1);
  return byName?.id ?? null;
}

async function linkChaoMemberContent() {
  const userId = await resolveChaoUserId();
  if (!userId) {
    console.log('No Chao member account found; demo sightings stay name-only. Set DEMO_MEMBER_EMAIL to link.');
    return;
  }
  await db
    .update(sightings)
    .set({ userId, observerName: null })
    .where(or(
      eq(sightings.observerName, 'Chao'),
      sql`lower(${sightings.observerName}) = 'chao'`,
    ));
  await db
    .update(phenomena)
    .set({ userId, observerName: null })
    .where(or(
      eq(phenomena.observerName, 'Chao'),
      sql`lower(${phenomena.observerName}) = 'chao'`,
    ));
  console.log('Linked Chao demo content to member account.');
}

async function promoteDemoMemberToAdmin() {
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

  if (!target || target.role === 'admin') return;

  await db
    .update(users)
    .set({ role: 'admin', updatedAt: new Date() })
    .where(eq(users.id, target.id));
  console.log('Promoted demo member to admin.');
}

async function seedSightings() {
  const existing = await db.select({ id: sightings.id }).from(sightings).limit(1);
  if (existing.length > 0) {
    console.log('Sightings already seeded; skipping.');
    return;
  }

  const rows = await db
    .select({ id: phenomena.id, title: phenomena.title })
    .from(phenomena);

  const chaoUserId = await resolveChaoUserId();

  for (const row of rows) {
    const bundle = sightingSeedByTitle[row.title];
    if (!bundle) continue;

    for (const entry of bundle.sightings) {
      const isChao = entry.observerName.toLowerCase() === 'chao';
      const spotId = await getPrimarySpotId(row.id);
      if (!spotId) continue;

      const [inserted] = await db
        .insert(sightings)
        .values({
          phenomenonId: row.id,
          spotId,
          userId: isChao && chaoUserId ? chaoUserId : null,
          observerName: isChao && chaoUserId ? null : entry.observerName,
          seenAt: entry.seenAt,
          condition: entry.condition,
          note: entry.note,
        })
        .returning({ id: sightings.id });

      if (entry.imageUrl) {
        await db.insert(sightingImages).values({
          sightingId: inserted.id,
          imageUrl: entry.imageUrl,
          imageAlt: entry.imageAlt ?? null,
          sortOrder: 0,
        });
      }
    }
  }

  console.log('Seeded demo sightings.');
}

async function seed() {
  await seedAdmin();
  await seedPhenomena();
  if (process.env.SEED_DEMO === '1') {
    await seedSightings();
    await linkChaoMemberContent();
    await promoteDemoMemberToAdmin();
  }
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
