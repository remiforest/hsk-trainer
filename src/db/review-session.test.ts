import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dropDb, freshDb } from '../test/idb'
import {
  makeCard,
  makeCatalog,
  makeGrammarPoint,
  makeLesson,
  makeProgress,
  makeWord,
} from '../test/factories'
import { type HskDatabase } from './db'
import {
  addLessonCards,
  getDayPlan,
  getTodayStats,
  nextLesson,
  persistAnswer,
} from './review-session'
import { getAllEvents } from './repositories/events'
import { ensureProgress, getProgress } from './repositories/singletons'
import { evaluateLeech, type LeechDecision } from '../core/srs/leech'
import { makeReviewOutcome, type ReviewOutcome } from '../core/srs/scheduler'
import { newSessionId } from '../types/ids'
import { type Card, type Rating } from '../types/srs'

const DAY = 86_400_000
const at = (y: number, m: number, d: number, h = 12): number => Date.UTC(y, m, d, h, 0, 0)
const TZ = 'UTC'
const T0 = at(2026, 0, 10)

const noLeech: LeechDecision = { becameLeech: false, shouldSuspend: false }

function reviewCard(id: string, over: Partial<Card> = {}): Card {
  return makeCard({
    itemId: id,
    state: 'review',
    due: T0 - 3600_000,
    stability: 10,
    difficulty: 5,
    reps: 4,
    ...over,
  })
}

function outcomeFor(card: Card, rating: Rating, now: number, elapsedMs: number): ReviewOutcome {
  return makeReviewOutcome({ card, rating, now, sessionId: newSessionId(), elapsedMs })
}

describe('review-session (db)', () => {
  let db: HskDatabase

  beforeEach(async () => {
    db = await freshDb()
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await dropDb(db)
  })

  describe('getDayPlan', () => {
    it('construit la file du jour à partir des cartes et des réglages', async () => {
      const due = reviewCard('w-0001', { due: T0 - DAY })
      const fresh = makeCard({ itemId: 'w-0002', state: 'new', createdAt: T0 - DAY })
      await db.cards.bulkPut([due, fresh])

      const plan = await getDayPlan(db, { newCardsPerDay: 5 }, T0, TZ)

      expect(plan.due.map((c) => c.id)).toEqual([due.id])
      expect(plan.fresh.map((c) => c.id)).toEqual([fresh.id])
      expect(plan.counts).toMatchObject({
        due: 1,
        newAvailable: 1,
        newIntroducedToday: 0,
        newSlotsLeft: 5,
      })
    })

    it('tient compte du journal pour le plafond de nouvelles cartes', async () => {
      await db.cards.bulkPut([
        makeCard({ itemId: 'w-0002', state: 'new', createdAt: T0 - 2 * DAY }),
        makeCard({ itemId: 'w-0003', state: 'new', createdAt: T0 - DAY }),
      ])
      // une nouvelle carte introduite aujourd'hui via une vraie réponse
      const introduced = makeCard({ itemId: 'w-0009', state: 'new', due: T0 })
      await persistAnswer(db, {
        outcome: outcomeFor(introduced, 'good', T0, 1000),
        leech: noLeech,
        now: T0,
        elapsedMs: 1000,
        timeZone: TZ,
      })

      const plan = await getDayPlan(db, { newCardsPerDay: 2 }, T0 + 3600_000, TZ)

      expect(plan.counts.newIntroducedToday).toBe(1)
      expect(plan.counts.newSlotsLeft).toBe(1)
      expect(plan.fresh).toHaveLength(1)
    })
  })

  describe('getTodayStats', () => {
    it('agrège nombre de révisions, temps et nouvelles cartes du jour', async () => {
      const answer = async (card: Card, now: number, elapsedMs: number): Promise<void> => {
        await persistAnswer(db, {
          outcome: outcomeFor(card, 'good', now, elapsedMs),
          leech: noLeech,
          now,
          elapsedMs,
          timeZone: TZ,
        })
      }
      await answer(makeCard({ itemId: 'w-0001', state: 'new', due: T0 }), at(2026, 0, 10, 9), 3000)
      await answer(reviewCard('w-0002'), at(2026, 0, 10, 10), 5000)
      await answer(reviewCard('w-0003'), at(2026, 0, 9, 10), 9999) // hier : exclu

      const stats = await getTodayStats(db, at(2026, 0, 10, 20), TZ)

      expect(stats).toEqual({ reviews: 2, timeMs: 8000, newCards: 1 })
    })

    it('ignore les durées négatives', async () => {
      await persistAnswer(db, {
        outcome: outcomeFor(
          makeCard({ itemId: 'w-0001', state: 'new', due: T0 }),
          'good',
          T0,
          -500,
        ),
        leech: noLeech,
        now: T0,
        elapsedMs: -500,
        timeZone: TZ,
      })
      expect((await getTodayStats(db, T0, TZ)).timeMs).toBe(0)
    })
  })

  describe('persistAnswer', () => {
    it('écrit événement, carte et progression dans une seule transaction', async () => {
      const card = reviewCard('w-0001', { due: T0 })
      await db.cards.put(card)

      await persistAnswer(db, {
        outcome: outcomeFor(card, 'good', T0, 2000),
        leech: noLeech,
        now: T0,
        elapsedMs: 2000,
        timeZone: TZ,
      })

      const events = await getAllEvents(db)
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({ kind: 'card_reviewed', seq: 1, cardId: card.id })
      expect(events[0]?.id).toBeTruthy()

      const stored = await db.cards.get(card.id)
      expect(stored?.reps).toBe(card.reps + 1)

      expect(await getProgress(db)).toMatchObject({
        totalReviews: 1,
        totalTimeMs: 2000,
        streakDays: 1,
        lastActiveDayKey: '2026-01-10',
      })
    })

    it('annule tout si l’écriture de la carte échoue', async () => {
      const card = reviewCard('w-0001', { due: T0 })
      await db.cards.put(card)
      await ensureProgress(db)
      const spy = vi.spyOn(db.cards, 'put').mockRejectedValueOnce(new Error('quota dépassé'))

      await expect(
        persistAnswer(db, {
          outcome: outcomeFor(card, 'good', T0, 2000),
          leech: noLeech,
          now: T0,
          elapsedMs: 2000,
          timeZone: TZ,
        }),
      ).rejects.toThrow('quota dépassé')

      expect(spy).toHaveBeenCalledOnce()
      expect(await db.events.count()).toBe(0)
      expect((await getProgress(db))?.totalReviews).toBe(0)
      expect((await db.cards.get(card.id))?.reps).toBe(4)
    })

    it('attribue des seq monotones sur des réponses successives', async () => {
      const a = reviewCard('w-0001', { due: T0 })
      const b = reviewCard('w-0002', { due: T0 })
      await db.cards.bulkPut([a, b])

      await persistAnswer(db, {
        outcome: outcomeFor(a, 'good', T0, 1000),
        leech: noLeech,
        now: T0,
        elapsedMs: 1000,
        timeZone: TZ,
      })
      await persistAnswer(db, {
        outcome: outcomeFor(b, 'good', T0 + 60_000, 1000),
        leech: noLeech,
        now: T0 + 60_000,
        elapsedMs: 1000,
        timeZone: TZ,
      })

      expect((await getAllEvents(db)).map((e) => e.seq)).toEqual([1, 2])
    })

    it('met la carte en pause et journalise card_suspended quand elle devient leech', async () => {
      const card = reviewCard('w-0001', { lapses: 5 })
      await db.cards.put(card)
      const outcome = outcomeFor(card, 'again', T0, 4000)
      const leech = evaluateLeech(outcome.draft.stateBefore, outcome.draft.stateAfter, card, 6)
      expect(leech.shouldSuspend).toBe(true) // pré-condition

      await persistAnswer(db, { outcome, leech, now: T0, elapsedMs: 4000, timeZone: TZ })

      const stored = await db.cards.get(card.id)
      expect(stored?.suspended).toBe(true)
      expect(stored?.leech).toBe(true)

      const events = await getAllEvents(db)
      expect(events.map((e) => e.kind)).toEqual(['card_reviewed', 'card_suspended'])
      expect(events.map((e) => e.seq)).toEqual([1, 2])
      expect(events[1]).toMatchObject({ kind: 'card_suspended', reason: 'leech', cardId: card.id })
    })

    it('gère la série : +1 si la veille était active, remise à 1 sinon', async () => {
      await db.userProgress.put(makeProgress({ lastActiveDayKey: '2026-01-08', streakDays: 3 }))
      const card = reviewCard('w-0001', { due: T0 })

      const answer = async (now: number): Promise<void> => {
        await persistAnswer(db, {
          outcome: outcomeFor(card, 'good', now, 1000),
          leech: noLeech,
          now,
          elapsedMs: 1000,
          timeZone: TZ,
        })
      }

      await answer(at(2026, 0, 10, 9)) // trou depuis le 08 -> remise à 1
      expect((await getProgress(db))?.streakDays).toBe(1)

      await answer(at(2026, 0, 10, 11)) // même jour -> inchangé
      expect((await getProgress(db))?.streakDays).toBe(1)

      await answer(at(2026, 0, 11, 9)) // lendemain -> +1
      expect(await getProgress(db)).toMatchObject({
        streakDays: 2,
        lastActiveDayKey: '2026-01-11',
        totalReviews: 3,
      })
    })
  })

  describe('addLessonCards', () => {
    it('crée les cartes et événements d’une leçon puis la marque terminée', async () => {
      const catalog = makeCatalog({
        words: [makeWord({ id: 'w-1' }), makeWord({ id: 'w-2' })],
        grammarPoints: [makeGrammarPoint({ id: 'g-1' })],
      })
      const lesson = makeLesson({
        id: 'lesson-1',
        wordIds: ['w-1', 'w-2'],
        grammarPointIds: ['g-1'],
      })

      const res = await addLessonCards(db, lesson, catalog, { now: T0 })

      expect(res).toEqual({ created: 10, alreadyPresent: 0 }) // 2 mots x4 + 1 grammaire x2
      expect(await db.cards.count()).toBe(10)

      const events = await getAllEvents(db)
      expect(events.filter((e) => e.kind === 'card_created')).toHaveLength(10)
      expect(events.filter((e) => e.kind === 'lesson_completed')).toHaveLength(1)
      expect(events.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
      expect((await getProgress(db))?.completedLessonIds).toEqual(['lesson-1'])
    })

    it('est idempotent : relancer n’ajoute ni carte ni doublon de leçon', async () => {
      const catalog = makeCatalog({ words: [makeWord({ id: 'w-1' })] })
      const lesson = makeLesson({ id: 'lesson-1', wordIds: ['w-1'], grammarPointIds: [] })

      await addLessonCards(db, lesson, catalog, { now: T0 })
      const res = await addLessonCards(db, lesson, catalog, { now: T0 + DAY })

      expect(res).toEqual({ created: 0, alreadyPresent: 4 })
      expect(await db.cards.count()).toBe(4)
      expect((await getProgress(db))?.completedLessonIds).toEqual(['lesson-1'])
      expect((await getAllEvents(db)).filter((e) => e.kind === 'lesson_completed')).toHaveLength(1)
    })

    it('ignore les références absentes du catalogue', async () => {
      const catalog = makeCatalog({ words: [makeWord({ id: 'w-1' })] })
      const lesson = makeLesson({ id: 'lesson-1', wordIds: ['w-1', 'w-404'], grammarPointIds: [] })

      const res = await addLessonCards(db, lesson, catalog, { now: T0 })

      expect(res).toEqual({ created: 4, alreadyPresent: 0 })
    })
  })

  describe('nextLesson', () => {
    const lesson = (
      id: string,
      ordre: number,
      prerequisites: string[] = [],
    ): ReturnType<typeof makeLesson> => makeLesson({ id, ordre, prerequisites })

    it('renvoie la première leçon faisable par ordre croissant', () => {
      const lessons = [lesson('c', 3), lesson('a', 1), lesson('b', 2, ['a'])]
      expect(nextLesson(lessons, [])?.id).toBe('a')
      expect(nextLesson(lessons, ['a'])?.id).toBe('b')
      expect(nextLesson(lessons, ['a', 'b'])?.id).toBe('c')
    })

    it('saute une leçon dont un prérequis manque', () => {
      const lessons = [lesson('a', 1, ['x']), lesson('b', 2)]
      expect(nextLesson(lessons, [])?.id).toBe('b')
    })

    it('renvoie null quand toutes les leçons sont terminées', () => {
      expect(nextLesson([lesson('a', 1), lesson('b', 2)], ['a', 'b'])).toBeNull()
    })
  })
})
