import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dropDb, freshDb } from '../test/idb'
import { JournalBuilder, makeCard, srsOf } from '../test/factories'
import { fakeNextState } from '../test/factories'
import { type HskDatabase } from './db'
import { recordReview, type RecordReviewInput } from './record-review'
import { getAllEvents } from './repositories/events'
import { newSessionId } from '../types/ids'
import { type Card } from '../types/srs'

const T0 = Date.UTC(2026, 0, 10, 8, 0, 0)
const DAY = 86_400_000

function reviewInput(card: Card, at: number): RecordReviewInput {
  const before = srsOf(card)
  const after = fakeNextState(before, 'good', at)
  return {
    card: { ...card, ...after },
    event: {
      kind: 'card_reviewed',
      at,
      cardId: card.id,
      sessionId: newSessionId(),
      rating: 'good',
      stateBefore: before,
      stateAfter: after,
      intervalBeforeDays: 0,
      intervalAfterDays: (after.due - at) / DAY,
      elapsedMs: 1500,
    },
  }
}

describe('recordReview', () => {
  let db: HskDatabase

  beforeEach(async () => {
    db = await freshDb()
    const card = makeCard({ itemId: 'w-0001' })
    await db.cards.put({ ...card, due: T0 })
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await dropDb(db)
  })

  it('écrit la carte et l’événement dans la même transaction', async () => {
    const card = (await db.cards.toArray())[0]!
    const { event } = await recordReview(db, reviewInput(card, T0 + DAY))

    expect(event.seq).toBe(1)
    expect(await db.events.count()).toBe(1)
    const stored = await db.cards.get(card.id)
    expect(stored?.reps).toBe(1)
    expect(stored?.state).toBe('review')
  })

  it('attribue des seq monotones sur des révisions successives', async () => {
    const card = (await db.cards.toArray())[0]!
    const r1 = await recordReview(db, reviewInput(card, T0 + DAY))
    const r2 = await recordReview(db, reviewInput(r1.card, T0 + 2 * DAY))
    const r3 = await recordReview(db, reviewInput(r2.card, T0 + 3 * DAY))
    expect([r1.event.seq, r2.event.seq, r3.event.seq]).toEqual([1, 2, 3])
  })

  it('sérialise les écritures concurrentes sans collision de seq', async () => {
    const cards = [
      makeCard({ itemId: 'w-0002' }),
      makeCard({ itemId: 'w-0003' }),
      makeCard({ itemId: 'w-0004' }),
    ]
    await db.cards.bulkPut(cards.map((c) => ({ ...c, due: T0 })))

    await Promise.all(cards.map((c) => recordReview(db, reviewInput(c, T0 + DAY))))

    const events = await getAllEvents(db)
    const seqs = events.map((e) => e.seq).sort((a, b) => a - b)
    expect(seqs).toEqual([1, 2, 3])
    expect(new Set(events.map((e) => e.id)).size).toBe(3)
  })

  it('annule tout si l’écriture de la carte échoue — aucun événement ne subsiste', async () => {
    const card = (await db.cards.toArray())[0]!
    const spy = vi.spyOn(db.cards, 'put').mockRejectedValueOnce(new Error('quota dépassé'))

    await expect(recordReview(db, reviewInput(card, T0 + DAY))).rejects.toThrow('quota dépassé')

    expect(spy).toHaveBeenCalledOnce()
    expect(await db.events.count()).toBe(0)
    const stored = await db.cards.get(card.id)
    expect(stored?.reps).toBe(0)
  })

  it('refuse un événement qui ne correspond pas à la carte', async () => {
    const card = (await db.cards.toArray())[0]!
    const bad = reviewInput(card, T0 + DAY)
    bad.event = { ...bad.event, cardId: makeCard({ itemId: 'w-9999' }).id }
    await expect(recordReview(db, bad)).rejects.toThrow(/ne correspondent pas/)
  })

  it('le journal complet reste rejouable après plusieurs révisions', async () => {
    const b = new JournalBuilder()
    const c = makeCard({ itemId: 'w-0005' })
    b.create(c, T0)
    await db.cards.put(b.expectedCards[0]!)
    // rejoue les mêmes notes via recordReview
    let current = b.expectedCards[0]!
    for (const [i, rating] of (['good', 'again', 'good', 'easy'] as const).entries()) {
      const at = T0 + (i + 1) * DAY
      const before = srsOf(current)
      const after = fakeNextState(before, rating, at)
      const res = await recordReview(db, {
        card: { ...current, ...after },
        event: {
          kind: 'card_reviewed',
          at,
          cardId: current.id,
          sessionId: newSessionId(),
          rating,
          stateBefore: before,
          stateAfter: after,
          intervalBeforeDays: 0,
          intervalAfterDays: (after.due - at) / DAY,
          elapsedMs: 1000,
        },
      })
      current = res.card
    }
    const events = await getAllEvents(db)
    expect(events).toHaveLength(4)
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3, 4])
  })
})
