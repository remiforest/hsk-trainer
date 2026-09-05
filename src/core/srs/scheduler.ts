/**
 * Enveloppe déterministe de `ts-fsrs` (FSRS-6). Les paliers d'apprentissage
 * courts façon Anki (1 min / 10 min) sont gérés nativement par la librairie
 * (`enable_short_term`). Le fuzz est **désactivé** : c'est la condition pour que
 * le rejeu du journal soit reproductible (voir ADR 0001 / 0003).
 *
 * Ce module est pur : il ne lit ni l'horloge (fournie en paramètre) ni le
 * stockage.
 */

import {
  createEmptyCard,
  FSRSVersion,
  fsrs,
  Rating as FsrsRating,
  State as FsrsState,
  type Card as FsrsCard,
  type Grade,
} from 'ts-fsrs'
import { type ReviewEvent } from '../../types/events'
import { makeCardId, type CardType, type ItemType, type SessionId } from '../../types/ids'
import {
  initialSrsState,
  pickSrsState,
  type Card,
  type CardState,
  type Rating,
  type SrsState,
} from '../../types/srs'

export const LEARNING_STEPS = ['1m', '10m'] as const
export const RELEARNING_STEPS = ['10m'] as const

/** Identifie la configuration FSRS ; stocké dans `meta` pour un rejeu cohérent. */
export const FSRS_PARAMS_VERSION = `${FSRSVersion}|learn:1m,10m|relearn:10m|fuzz:off`

const engine = fsrs({
  enable_fuzz: false,
  enable_short_term: true,
  learning_steps: LEARNING_STEPS,
  relearning_steps: RELEARNING_STEPS,
})

const DAY_MS = 86_400_000

const STATE_TO_NUM: Record<CardState, FsrsState> = {
  new: FsrsState.New,
  learning: FsrsState.Learning,
  review: FsrsState.Review,
  relearning: FsrsState.Relearning,
}

const NUM_TO_STATE: Record<number, CardState> = {
  [FsrsState.New]: 'new',
  [FsrsState.Learning]: 'learning',
  [FsrsState.Review]: 'review',
  [FsrsState.Relearning]: 'relearning',
}

const RATING_TO_GRADE: Record<Rating, Grade> = {
  again: FsrsRating.Again,
  hard: FsrsRating.Hard,
  good: FsrsRating.Good,
  easy: FsrsRating.Easy,
}

function toFsrsCard(s: SrsState): FsrsCard {
  const scheduledDays =
    s.lastReviewedAt === null ? 0 : Math.max(0, Math.round((s.due - s.lastReviewedAt) / DAY_MS))
  return {
    due: new Date(s.due),
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: 0,
    scheduled_days: scheduledDays,
    learning_steps: Math.max(0, s.learningStep),
    reps: s.reps,
    lapses: s.lapses,
    state: STATE_TO_NUM[s.state],
    ...(s.lastReviewedAt !== null ? { last_review: new Date(s.lastReviewedAt) } : {}),
  }
}

function fromFsrsCard(c: FsrsCard): SrsState {
  const state = NUM_TO_STATE[c.state] ?? 'new'
  const inLearning = c.state === FsrsState.Learning || c.state === FsrsState.Relearning
  return {
    state,
    due: c.due.getTime(),
    stability: c.stability,
    difficulty: c.difficulty,
    reps: c.reps,
    lapses: c.lapses,
    lastReviewedAt: c.last_review ? c.last_review.getTime() : null,
    learningStep: inLearning ? c.learning_steps : -1,
  }
}

export interface ScheduleResult {
  next: SrsState
  intervalBeforeDays: number
  intervalAfterDays: number
}

/** Calcule le nouvel état d'une carte après une note, à l'instant `now`. */
export function scheduleReview(before: SrsState, rating: Rating, now: number): ScheduleResult {
  const { card } = engine.next(toFsrsCard(before), new Date(now), RATING_TO_GRADE[rating])
  const next = fromFsrsCard(card)
  const intervalBeforeDays =
    before.lastReviewedAt === null ? 0 : Math.max(0, (before.due - before.lastReviewedAt) / DAY_MS)
  const intervalAfterDays = Math.max(0, (next.due - now) / DAY_MS)
  return { next, intervalBeforeDays, intervalAfterDays }
}

export function createInitialCard(input: {
  itemType: ItemType
  itemId: string
  cardType: CardType
  now: number
}): Card {
  const empty = fromFsrsCard(createEmptyCard(new Date(input.now)))
  return {
    id: makeCardId(input.itemType, input.itemId, input.cardType),
    itemType: input.itemType,
    itemId: input.itemId,
    cardType: input.cardType,
    ...empty,
    leech: false,
    suspended: false,
    createdAt: input.now,
  }
}

export interface ReviewOutcome {
  updatedCard: Card
  draft: Omit<ReviewEvent, 'id' | 'seq'>
}

/** Produit la carte mise à jour et le brouillon d'événement à persister. */
export function makeReviewOutcome(input: {
  card: Card
  rating: Rating
  now: number
  sessionId: SessionId
  elapsedMs: number
}): ReviewOutcome {
  const before = pickSrsState(input.card)
  const { next, intervalBeforeDays, intervalAfterDays } = scheduleReview(
    before,
    input.rating,
    input.now,
  )
  return {
    updatedCard: { ...input.card, ...next },
    draft: {
      kind: 'card_reviewed',
      at: input.now,
      cardId: input.card.id,
      sessionId: input.sessionId,
      rating: input.rating,
      stateBefore: before,
      stateAfter: next,
      intervalBeforeDays,
      intervalAfterDays,
      elapsedMs: input.elapsedMs,
    },
  }
}

/**
 * Rejeu « fort » : recalcule l'état d'une carte en repartant de zéro et en
 * rejouant les notes via le scheduler. Sert de recoupement avec le rejeu
 * « faible » de `core/journal/rebuild.ts` (qui, lui, applique les `stateAfter`
 * enregistrés).
 */
export function replayCardFromReviews(reviews: readonly ReviewEvent[]): SrsState {
  const ordered = [...reviews].sort((a, b) => a.seq - b.seq)
  if (ordered.length === 0) {
    return initialSrsState(0)
  }
  let state = initialSrsState(ordered[0]!.at)
  for (const ev of ordered) {
    state = scheduleReview(state, ev.rating, ev.at).next
  }
  return state
}
