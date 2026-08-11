import { sql } from 'drizzle-orm';
import { db } from './index.js';
import { phenomena } from './schema.js';

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
    imageUrl: 'images/moorhen-chick.jpg',
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
    imageUrl: 'images/qipan-jiao.jpg',
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
    imageUrl: 'images/longan.jpg',
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
    imageUrl: 'images/water-caltrop.jpg',
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
    imageUrl: 'images/mango-sticky-rice.jpg',
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
    imageUrl: 'images/bougainvillea.jpg',
    imageAlt: '盛開的桃紅色九重葛花叢',
    observerName: '里長伯',
    metaLabel: '最近一次注意到 · 5 小時前',
    lastNoticedAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
  },
];

async function seed() {
  const reset = process.env.SEED_RESET === '1';

  if (reset) {
    await db.execute(sql`TRUNCATE TABLE phenomena`);
    console.log('Truncated phenomena.');
  } else {
    const existing = await db.select({ id: phenomena.id }).from(phenomena).limit(1);
    if (existing.length > 0) {
      console.log('Phenomena already seeded; skipping. Set SEED_RESET=1 to replace.');
      process.exit(0);
    }
  }

  await db.insert(phenomena).values(seedData);
  console.log(`Seeded ${seedData.length} phenomena.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
