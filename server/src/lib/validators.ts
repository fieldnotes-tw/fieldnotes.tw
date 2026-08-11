import { z } from 'zod';
import {
  PHENOMENON_CATEGORIES,
  PHENOMENON_STATUSES,
} from '../db/schema.js';

export const categorySchema = z.enum(PHENOMENON_CATEGORIES);
export const statusSchema = z.enum(PHENOMENON_STATUSES);
export const uuidSchema = z.string().uuid();

export const createPhenomenonSchema = z.object({
  status: statusSchema.optional(),
  category: categorySchema,
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000),
  location: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(2000).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  imageUrl: z.string().trim().max(1000).optional(),
  imageAlt: z.string().trim().max(500).optional(),
  observerName: z.string().trim().max(100).optional(),
  metaLabel: z.string().trim().max(200).optional(),
  lastNoticedAt: z.coerce.date().optional(),
});

export const updatePhenomenonSchema = createPhenomenonSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'errors.atLeastOneField' },
);
