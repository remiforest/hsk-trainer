/**
 * Ponts entre la couche `db` et la logique de session (`core/srs`).
 *
 * `persistAnswer` est le point critique : la réponse (événement de révision +
 * carte mise à jour + éventuelle mise en pause pour leech + progression) est
 * écrite dans **une seule transaction**. Fermer l'onglet en pleine session ne
 * peut donc jamais laisser un état partiel.
 */

import { type HskDatabase } from './db'
import { nextSeq } from './repositories/events'
import { getAllCards } from './repositories/cards'
import { getAllEvents } from './repositories/events'
import { ensureProgress } from './repositories/singletons'
import { addDaysToDayKey, localDayKey } from '../core/time/day'
import { buildDayQueue, buildExtraQueue, type DayQueue, type ExtraQueue } from '../core/srs/queue'
import { type LeechDecision } from '../core/srs/leech'
import { type ReviewOutcome } from '../core/srs/scheduler'
import { generateCardsForLesson, type GenerateOptions } from '../core/cards/generate'
import { type ContentCatalog, type Lesson } from '../types/content'
import { isReviewEvent, type CardCreatedEvent, type CardSuspendedEvent } from '../types/events'
import { newEventId } from '../types/ids'
import { type Settings } from '../types/progress'

export async function getDayPlan(
  db: HskDatabase,
  settings: Pick<Settings, 'newCardsPerDay'>,
  now: number,
  timeZone?: string,
): Promise<DayQueue> {
  const [cards, events] = await Promise.all([getAllCards(db), getAllEvents(db)])
  return buildDayQueue({
    cards,
    events,
    settings,
    now,
    ...(timeZone !== undefined ? { timeZone } : {}),
  })
}

/**
 * File de révision « en plus » : cartes mûres révisables en avance, pour
 * continuer quand la file du jour est épuisée. Ne touche jamais aux nouvelles
 * cartes ni au plafond `newCardsPerDay`.
 */
export async function getExtraPlan(
  db: HskDatabase,
  settings: Pick<Settings, 'extraReviewsPerDay'>,
  now: number,
  timeZone?: string,
): Promise<ExtraQueue> {
  const [cards, events] = await Promise.all([getAllCards(db), getAllEvents(db)])
  return buildExtraQueue({
    cards,
    events,
    settings,
    now,
    ...(timeZone !== undefined ? { timeZone } : {}),
  })
}

export interface TodayStats {
  reviews: number
  timeMs: number
  newCards: number
}

export async function getTodayStats(
  db: HskDatabase,
  now: number,
  timeZone?: string,
): Promise<TodayStats> {
  const events = await getAllEvents(db)
  const todayKey = localDayKey(now, timeZone)
  let reviews = 0
  let timeMs = 0
  const newCardIds = new Set<string>()
  for (const e of events) {
    if (!isReviewEvent(e) || localDayKey(e.at, timeZone) !== todayKey) {
      continue
    }
    reviews += 1
    timeMs += Math.max(0, e.elapsedMs)
    if (e.stateBefore.state === 'new') {
      newCardIds.add(e.cardId)
    }
  }
  return { reviews, timeMs, newCards: newCardIds.size }
}

export interface PersistAnswerInput {
  outcome: ReviewOutcome
  leech: LeechDecision
  now: number
  elapsedMs: number
  timeZone?: string
}

export async function persistAnswer(db: HskDatabase, input: PersistAnswerInput): Promise<void> {
  const { outcome, leech, now, elapsedMs, timeZone } = input
  const todayKey = localDayKey(now, timeZone)

  await db.transaction('rw', db.cards, db.events, db.userProgress, async () => {
    const seq = await nextSeq(db)
    await db.events.add({ ...outcome.draft, id: newEventId(), seq })

    const card = leech.shouldSuspend
      ? { ...outcome.updatedCard, suspended: true, leech: true }
      : outcome.updatedCard
    await db.cards.put(card)

    if (leech.shouldSuspend) {
      const suspendEvent: CardSuspendedEvent = {
        kind: 'card_suspended',
        id: newEventId(),
        seq: seq + 1,
        at: now,
        cardId: card.id,
        reason: 'leech',
      }
      await db.events.add(suspendEvent)
    }

    const progress = await ensureProgress(db)
    let streakDays = progress.streakDays
    if (progress.lastActiveDayKey !== todayKey) {
      streakDays =
        progress.lastActiveDayKey === addDaysToDayKey(todayKey, -1) ? progress.streakDays + 1 : 1
    }
    await db.userProgress.put({
      ...progress,
      totalReviews: progress.totalReviews + 1,
      totalTimeMs: progress.totalTimeMs + Math.max(0, elapsedMs),
      streakDays,
      lastActiveDayKey: todayKey,
    })
  })
}

export interface AddLessonCardsResult {
  created: number
  alreadyPresent: number
}

/**
 * Crée les cartes d'une leçon (événements `card_created` + lignes `cards`),
 * marque la leçon comme terminée. Idempotent : les cartes déjà présentes sont
 * ignorées.
 */
export async function addLessonCards(
  db: HskDatabase,
  lesson: Lesson,
  catalog: ContentCatalog,
  opts: { now: number; cardTypes?: GenerateOptions['cardTypes'] },
): Promise<AddLessonCardsResult> {
  const generated = generateCardsForLesson(
    lesson,
    catalog,
    opts.now,
    opts.cardTypes ? { cardTypes: opts.cardTypes } : undefined,
  )

  return db.transaction('rw', db.cards, db.events, db.userProgress, async () => {
    const existing = new Set((await db.cards.toArray()).map((c) => c.id))
    const fresh = generated.filter((c) => !existing.has(c.id))

    let seq = await nextSeq(db)
    for (const card of fresh) {
      const created: CardCreatedEvent = {
        kind: 'card_created',
        id: newEventId(),
        seq,
        at: opts.now,
        cardId: card.id,
        card,
      }
      seq += 1
      await db.events.add(created)
      await db.cards.add(card)
    }

    const progress = await ensureProgress(db)
    if (!progress.completedLessonIds.includes(lesson.id)) {
      await db.events.add({
        kind: 'lesson_completed',
        id: newEventId(),
        seq,
        at: opts.now,
        lessonId: lesson.id,
      })
      await db.userProgress.put({
        ...progress,
        completedLessonIds: [...progress.completedLessonIds, lesson.id],
      })
    }

    return { created: fresh.length, alreadyPresent: generated.length - fresh.length }
  })
}

/** Prochaine leçon non terminée dont tous les prérequis sont acquis. */
export function nextLesson(
  lessons: readonly Lesson[],
  completedIds: readonly string[],
): Lesson | null {
  const done = new Set(completedIds)
  const candidates = lessons
    .filter((l) => !done.has(l.id) && l.prerequisites.every((p) => done.has(p)))
    .sort((a, b) => a.ordre - b.ordre)
  return candidates[0] ?? null
}
