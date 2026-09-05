import { newSessionId } from '../../types/ids'
import { initialSrsState } from '../../types/srs'
import {
  createInitialCard,
  makeReviewOutcome,
  replayCardFromReviews,
  scheduleReview,
} from './scheduler'
import { type ReviewEvent } from '../../types/events'

const DAY = 86_400_000
const T0 = Date.UTC(2026, 0, 5, 9, 0, 0)

describe('scheduleReview', () => {
  it('carte neuve + Bien -> apprentissage, échéance courte, reps 1', () => {
    const { next, intervalAfterDays } = scheduleReview(initialSrsState(T0), 'good', T0)
    expect(next.state).toBe('learning')
    expect(next.reps).toBe(1)
    expect(next.due - T0).toBeLessThanOrEqual(15 * 60_000) // ~10 min
    expect(intervalAfterDays).toBeLessThan(1)
  })

  it('carte neuve + Facile -> révision, échéance en jours', () => {
    const { next } = scheduleReview(initialSrsState(T0), 'easy', T0)
    expect(next.state).toBe('review')
    expect(next.due - T0).toBeGreaterThan(DAY)
  })

  it('Encore en apprentissage -> reste en apprentissage, palier au début', () => {
    const afterGood = scheduleReview(initialSrsState(T0), 'good', T0).next
    const afterAgain = scheduleReview(afterGood, 'again', afterGood.due).next
    expect(afterAgain.state).toBe('learning')
    expect(afterAgain.learningStep).toBe(0)
  })

  it('échec d’une carte en révision -> relearning, lapses +1', () => {
    let s = scheduleReview(initialSrsState(T0), 'easy', T0).next // review
    s = scheduleReview(s, 'good', s.due).next
    const lapsesBefore = s.lapses
    const lapsed = scheduleReview(s, 'again', s.due).next
    expect(lapsed.state).toBe('relearning')
    expect(lapsed.lapses).toBe(lapsesBefore + 1)
  })

  it('est déterministe (fuzz désactivé)', () => {
    const a = scheduleReview(initialSrsState(T0), 'good', T0).next
    const b = scheduleReview(initialSrsState(T0), 'good', T0).next
    expect(a).toEqual(b)

    let s1 = initialSrsState(T0)
    let s2 = initialSrsState(T0)
    for (const [i, r] of (['good', 'good', 'again', 'good', 'easy'] as const).entries()) {
      s1 = scheduleReview(s1, r, T0 + i * DAY).next
      s2 = scheduleReview(s2, r, T0 + i * DAY).next
    }
    expect(s1).toEqual(s2)
  })
})

describe('createInitialCard', () => {
  it('crée une carte neuve due maintenant', () => {
    const card = createInitialCard({
      itemType: 'word',
      itemId: 'w-0001',
      cardType: 'hanzi_to_sense',
      now: T0,
    })
    expect(card.id).toBe('word:w-0001:hanzi_to_sense')
    expect(card.state).toBe('new')
    expect(card.due).toBe(T0)
    expect(card.reps).toBe(0)
    expect(card.suspended).toBe(false)
  })
})

describe('makeReviewOutcome', () => {
  it('produit une carte mise à jour et un brouillon cohérent', () => {
    const card = createInitialCard({
      itemType: 'word',
      itemId: 'w-0001',
      cardType: 'hanzi_to_sense',
      now: T0,
    })
    const sid = newSessionId()
    const { updatedCard, draft } = makeReviewOutcome({
      card,
      rating: 'good',
      now: T0 + 1000,
      sessionId: sid,
      elapsedMs: 2500,
    })
    expect(draft.kind).toBe('card_reviewed')
    expect(draft.cardId).toBe(card.id)
    expect(draft.stateBefore.reps).toBe(0)
    expect(draft.stateAfter.reps).toBe(1)
    expect(updatedCard.reps).toBe(1)
    expect(updatedCard.id).toBe(card.id)
    expect(draft.elapsedMs).toBe(2500)
  })
})

describe('replayCardFromReviews', () => {
  it('le rejeu fort reproduit le calcul en avant', () => {
    const card = createInitialCard({
      itemType: 'word',
      itemId: 'w-0001',
      cardType: 'hanzi_to_sense',
      now: T0,
    })
    const sid = newSessionId()
    const events: ReviewEvent[] = []
    let current = card
    let seq = 0
    for (const [i, rating] of (
      ['good', 'good', 'again', 'good', 'easy', 'good'] as const
    ).entries()) {
      const at = T0 + i * DAY
      const { updatedCard, draft } = makeReviewOutcome({
        card: current,
        rating,
        now: at,
        sessionId: sid,
        elapsedMs: 1000,
      })
      seq += 1
      events.push({ ...draft, id: `e${seq}` as ReviewEvent['id'], seq })
      current = updatedCard
    }

    const replayed = replayCardFromReviews(events)
    const lastAfter = events[events.length - 1]!.stateAfter
    expect(replayed).toEqual(lastAfter)
  })

  it('renvoie l’état initial pour un journal vide', () => {
    expect(replayCardFromReviews([]).state).toBe('new')
  })
})
