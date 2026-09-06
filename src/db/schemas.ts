/**
 * Schémas Zod de validation des données utilisateur, utilisés à l'import et pour
 * valider un bundle avant restauration. Ils reflètent les types de `src/types/`.
 */

import { z } from 'zod'
import { EXPORT_FORMAT } from '../types/backup'

const finite = z.number().refine(Number.isFinite, { message: 'nombre non fini' })
const intNonNeg = z.number().int().nonnegative()
const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'format YYYY-MM-DD attendu')

export const cardStateSchema = z.enum(['new', 'learning', 'review', 'relearning'])
export const ratingSchema = z.enum(['again', 'hard', 'good', 'easy'])
export const itemTypeSchema = z.enum(['word', 'grammar'])
export const cardTypeSchema = z.enum([
  'hanzi_to_sense',
  'sense_to_hanzi',
  'hanzi_to_pinyin',
  'audio_to_sense',
  'grammar_fill',
  'grammar_order',
])

export const srsStateSchema = z.object({
  state: cardStateSchema,
  due: finite,
  stability: finite,
  difficulty: finite,
  reps: intNonNeg,
  lapses: intNonNeg,
  lastReviewedAt: finite.nullable(),
  learningStep: z.number().int(),
})

export const cardSchema = srsStateSchema.extend({
  id: z.string().min(1),
  itemType: itemTypeSchema,
  itemId: z.string().min(1),
  cardType: cardTypeSchema,
  leech: z.boolean(),
  suspended: z.boolean(),
  createdAt: finite,
})

const baseEvent = { id: z.string().min(1), seq: intNonNeg, at: finite }

export const journalEventSchema = z.discriminatedUnion('kind', [
  z.object({
    ...baseEvent,
    kind: z.literal('card_created'),
    cardId: z.string().min(1),
    card: cardSchema,
  }),
  z.object({
    ...baseEvent,
    kind: z.literal('card_reviewed'),
    cardId: z.string().min(1),
    sessionId: z.string().min(1),
    rating: ratingSchema,
    stateBefore: srsStateSchema,
    stateAfter: srsStateSchema,
    intervalBeforeDays: finite,
    intervalAfterDays: finite,
    elapsedMs: finite,
  }),
  z.object({
    ...baseEvent,
    kind: z.literal('card_suspended'),
    cardId: z.string().min(1),
    reason: z.enum(['leech', 'manual']),
  }),
  z.object({
    ...baseEvent,
    kind: z.literal('card_unsuspended'),
    cardId: z.string().min(1),
  }),
  z.object({
    ...baseEvent,
    kind: z.literal('lesson_completed'),
    lessonId: z.string().min(1),
  }),
])

export const settingsSchema = z.object({
  id: z.literal('settings'),
  dailyReviewTarget: intNonNeg,
  newCardsPerDay: intNonNeg,
  // Ajouté après coup : les bundles exportés avant cette version n'ont pas le champ.
  extraReviewsPerDay: intNonNeg.default(20),
  dailyMinutesTarget: intNonNeg,
  audioEnabled: z.boolean(),
  theme: z.enum(['light', 'dark', 'system']),
  leechThreshold: intNonNeg,
})

export const userProgressSchema = z.object({
  id: z.literal('progress'),
  completedLessonIds: z.array(z.string()),
  streakDays: intNonNeg,
  lastActiveDayKey: dayKey.nullable(),
  totalReviews: intNonNeg,
  totalTimeMs: intNonNeg,
})

export const userDataDumpSchema = z.object({
  cards: z.array(cardSchema),
  events: z.array(journalEventSchema),
  userProgress: userProgressSchema,
  settings: settingsSchema,
  meta: z.record(z.string(), z.string()),
})

export const exportBundleSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.number().int().positive(),
  exportedAt: finite,
  schemaVersion: z.number().int().positive(),
  appVersion: z.string(),
  contentVersion: z.string(),
  data: userDataDumpSchema,
})
