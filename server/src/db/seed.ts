import { eq, sql } from 'drizzle-orm';
import { db } from './index.js';
import { phenomena, sightingImages, sightings, users } from './schema.js';
import { hashPassword } from '../lib/auth.js';

const seedData = [
  {
    status: 'active' as const,
    category: 'animal' as const,
    title: '紅冠水雞生寶寶了',
    description: '蓮池潭龍虎塔旁，紅冠水雞生小寶寶了。',
    location: '蓮池潭龍虎塔旁',
    notes: '親鳥護幼中，請保持距離，不要驚擾。',
    lat: 22.6907,
    lng: 120.2951,
    imageUrl: '/media/phenomena/moorhen-chick.jpg',
    imageAlt: '紅冠水雞成鳥帶著幼鳥在水面覓食',
    observerName: '阿明',
    metaLabel: '最近一次注意到 · 1 天前',
    lastNoticedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
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
  },
  {
    status: 'active' as const,
    category: 'plant' as const,
    title: '蓮霧、龍眼結果了',
    description: '見城之道旁的蓮霧樹跟龍眼樹在結果。',
    location: '見城之道（東門段）',
    notes: '為住家與店家庭院果樹，請只賞不採。',
    lat: 22.6828,
    lng: 120.2995,
    imageUrl: '/media/phenomena/longan.jpg',
    imageAlt: '龍眼樹枝頭結實累累',
    observerName: '阿珠',
    metaLabel: '最近一次注意到 · 3 天前',
    lastNoticedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
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
  },
  {
    status: 'active' as const,
    category: 'taste' as const,
    title: '芒果糯米飯開賣',
    description: '大城老船麵的芒果糯米飯開賣了。',
    location: '大城老船麵（大路）',
    notes: '每日限量，售完即止。',
    lat: 22.6865,
    lng: 120.3045,
    imageUrl: '/media/phenomena/mango-sticky-rice.jpg',
    imageAlt: '芒果切片鋪在椰奶糯米飯上',
    observerName: '阿吉',
    metaLabel: '販售時間 · 每日限量',
  },
  {
    status: 'active' as const,
    category: 'plant' as const,
    title: '九重葛盛開',
    description: '果貿社區幾條巷子的九重葛開得正盛，牆面幾乎染成一片桃紅。',
    location: '果貿社區',
    notes: '花期估計還可持續兩週左右。',
    lat: 22.6968,
    lng: 120.2975,
    imageUrl: '/media/phenomena/bougainvillea.jpg',
    imageAlt: '盛開的桃紅色九重葛花叢',
    observerName: '里長伯',
    metaLabel: '最近一次注意到 · 5 小時前',
    lastNoticedAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
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
    await db.execute(sql`TRUNCATE TABLE sightings, phenomena CASCADE`);
    console.log('Truncated phenomena and sightings.');
  } else {
    const existing = await db.select({ id: phenomena.id }).from(phenomena).limit(1);
    if (existing.length > 0) {
      console.log('Phenomena already seeded; skipping. Set SEED_RESET=1 to replace.');
      return;
    }
  }

  await db.insert(phenomena).values(seedData);
  console.log(`Seeded ${seedData.length} demo phenomena.`);
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
  '棋盤腳進入花季': {
    sightings: [
      {
        observerName: 'Chao',
        seenAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        condition: 'abundant',
        note: '現在花量很多，六點半左右開始開。',
        imageUrl: '/media/phenomena/qipan-jiao.jpg',
        imageAlt: '棋盤腳的花與果實',
      },
      {
        observerName: '陳恩',
        seenAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
        condition: 'abundant',
        note: '靠水邊的幾棵已經開始了，大概六點左右陸續綻放。',
        imageUrl: '/media/phenomena/qipan-jiao.jpg',
      },
      {
        observerName: '美妃',
        seenAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
        note: '看到今年第一批花苞出現了。',
        imageUrl: '/media/phenomena/qipan-jiao.jpg',
      },
    ],
  },
  '紅冠水雞生寶寶了': {
    sightings: [
      {
        observerName: '阿明',
        seenAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        condition: 'abundant',
        note: '幼鳥還跟在成鳥旁邊，請保持距離。',
        imageUrl: '/media/phenomena/moorhen-chick.jpg',
      },
      {
        observerName: '金蓮',
        seenAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        note: '龍虎塔旁水雞家族活動中。',
        imageUrl: '/media/phenomena/moorhen-chick.jpg',
      },
    ],
  },
  '九重葛盛開': {
    sightings: [
      {
        observerName: '里長伯',
        seenAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
        condition: 'abundant',
        note: '果貿社區幾條巷子都開得很滿。',
        imageUrl: '/media/phenomena/bougainvillea.jpg',
      },
    ],
  },
};

async function seedSightings() {
  const existing = await db.select({ id: sightings.id }).from(sightings).limit(1);
  if (existing.length > 0) {
    console.log('Sightings already seeded; skipping.');
    return;
  }

  const rows = await db
    .select({ id: phenomena.id, title: phenomena.title })
    .from(phenomena);

  for (const row of rows) {
    const bundle = sightingSeedByTitle[row.title];
    if (!bundle) continue;

    for (const entry of bundle.sightings) {
      const [inserted] = await db
        .insert(sightings)
        .values({
          phenomenonId: row.id,
          observerName: entry.observerName,
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
  if (process.env.SEED_DEMO === '1') await seedSightings();
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
