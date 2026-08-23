import {
  PHENOMENON_CATEGORIES,
  type Phenomenon,
} from '../db/schema.js';

export type PhenomenonCategory = (typeof PHENOMENON_CATEGORIES)[number];

export function normalizeCategories(input: {
  category?: PhenomenonCategory | null;
  categories?: PhenomenonCategory[] | null;
}): PhenomenonCategory[] {
  const raw = input.categories?.length
    ? input.categories
    : input.category
      ? [input.category]
      : ['plant'];

  const seen = new Set<PhenomenonCategory>();
  const categories: PhenomenonCategory[] = [];
  for (const value of raw) {
    if (!PHENOMENON_CATEGORIES.includes(value as PhenomenonCategory) || seen.has(value as PhenomenonCategory)) continue;
    seen.add(value as PhenomenonCategory);
    categories.push(value as PhenomenonCategory);
  }

  return categories.length ? categories : ['plant'];
}

export function resolveCategoryFields(input: {
  category?: PhenomenonCategory | null;
  categories?: PhenomenonCategory[] | null;
}): Pick<Phenomenon, 'category' | 'categories'> {
  const categories = normalizeCategories(input);
  return {
    category: categories[0],
    categories,
  };
}

export function phenomenonCategories(item: {
  category: PhenomenonCategory;
  categories?: PhenomenonCategory[] | null;
}): PhenomenonCategory[] {
  return normalizeCategories(item);
}
