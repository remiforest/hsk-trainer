import { makeCard } from '../../test/factories'
import { newSessionId } from '../../types/ids'
import { type Card } from '../../types/srs'
import {
  answer,
  currentCard,
  sessionProgress,
  sessionSummary,
  startSession,
  stopSession,
  type SessionConfig,
  type SessionState,
} from './session'

const MIN = 60_000
const T0 = Date.UTC(2026, 3, 1, 18, 0, 0)

const cfg = (over: Partial<SessionConfig> = {}): SessionConfig => ({
  targetReviews: 40,
  targetMs: 10 * MIN,
  sessionHorizonMs: 20 * MIN,
  leechThreshold: 6,
  ...over,
})

function reviewCard(id: string, over: Partial<Card> = {}): Card {
  return makeCard({
    itemId: id,
    state: 'review',
    due: T0 - 60 * MIN,
    stability: 10,
    difficulty: 5,
    reps: 4,
    ...over,
  })
}

function start(due: Card[], fresh: Card[], config = cfg()): SessionState {
  return startSession({ sessionId: newSessionId(), now: T0, config, due, fresh })
}

describe('startSession', () => {
  it('se termine immédiatement si rien à faire', () => {
    const s = start([], [])
    expect(s.status).toBe('finished')
    expect(s.endReason).toBe('queue-empty')
  })

  it('présente la première carte', () => {
    const s = start([reviewCard('w-1'), reviewCard('w-2')], [])
    expect(s.status).toBe('active')
    expect(currentCard(s)?.itemId).toBe('w-1')
  })
})

describe('answer — invariants', () => {
  it('une carte ratée revient dans la même session', () => {
    let s = start([reviewCard('w-1')], [], cfg({ targetReviews: 0, targetMs: 0 }))
    const r1 = answer(s, { rating: 'again', now: T0, elapsedMs: 3000 })
    s = r1.state
    expect(s.status).toBe('active')
    expect(currentCard(s)?.itemId).toBe('w-1') // re-présentée
    expect(r1.outcome.updatedCard.lapses).toBe(1)
  })

  it('ne se termine pas sur objectif tant qu’un échec n’est pas repris', () => {
    let s = start(
      [reviewCard('a'), reviewCard('b'), reviewCard('c')],
      [],
      cfg({ targetReviews: 2, targetMs: 0 }),
    )
    s = answer(s, { rating: 'good', now: T0, elapsedMs: 1000 }).state // a
    s = answer(s, { rating: 'again', now: T0 + MIN, elapsedMs: 1000 }).state // b -> pending
    expect(s.tally.reviews).toBe(2) // objectif atteint...
    expect(s.status).toBe('active') // ...mais b non repris
    s = answer(s, { rating: 'good', now: T0 + 2 * MIN, elapsedMs: 1000 }).state // c
    expect(s.status).toBe('active') // b toujours en attente
    expect(currentCard(s)?.itemId).toBe('b')
    s = answer(s, { rating: 'good', now: T0 + 3 * MIN, elapsedMs: 1000 }).state // b repris
    expect(s.status).toBe('finished')
    expect(s.endReason).toBe('objective-reached')
  })

  it('se termine quand la file est vide (sans objectif)', () => {
    let s = start([reviewCard('a'), reviewCard('b')], [], cfg({ targetReviews: 0, targetMs: 0 }))
    s = answer(s, { rating: 'easy', now: T0, elapsedMs: 1000 }).state
    s = answer(s, { rating: 'easy', now: T0 + MIN, elapsedMs: 1000 }).state
    expect(s.status).toBe('finished')
    expect(s.endReason).toBe('queue-empty')
    expect(s.tally.reviews).toBe(2)
  })

  it('se termine sur objectif de temps', () => {
    let s = start(
      [reviewCard('a'), reviewCard('b'), reviewCard('c')],
      [],
      cfg({ targetReviews: 0, targetMs: 5 * MIN }),
    )
    s = answer(s, { rating: 'good', now: T0, elapsedMs: 3 * MIN }).state
    expect(s.status).toBe('active')
    s = answer(s, { rating: 'good', now: T0 + 3 * MIN, elapsedMs: 3 * MIN }).state
    expect(s.tally.timeMs).toBe(6 * MIN)
    expect(s.status).toBe('finished')
    expect(s.endReason).toBe('objective-reached')
  })

  it('compte les nouvelles cartes introduites et les graduations', () => {
    let s = start(
      [],
      [makeCard({ itemId: 'n-1', state: 'new', due: T0 })],
      cfg({ targetReviews: 0, targetMs: 0 }),
    )
    const r = answer(s, { rating: 'easy', now: T0, elapsedMs: 1000 })
    s = r.state
    expect(s.tally.newIntroduced).toBe(1)
    expect(s.tally.graduated).toBe(1)
    expect(r.outcome.updatedCard.state).toBe('review')
    expect(s.status).toBe('finished')
  })

  it('recovre une nouvelle carte ratée puis se termine sur objectif', () => {
    let s = start(
      [],
      [makeCard({ itemId: 'n-1', state: 'new', due: T0 })],
      cfg({ targetReviews: 1, targetMs: 0 }),
    )
    s = answer(s, { rating: 'again', now: T0, elapsedMs: 1000 }).state
    expect(s.status).toBe('active')
    s = answer(s, { rating: 'good', now: T0 + 2 * MIN, elapsedMs: 1000 }).state
    expect(s.status).toBe('finished')
    expect(s.tally).toMatchObject({ reviews: 2, again: 1, good: 1, newIntroduced: 1 })
  })

  it('une carte devenue leech quitte la session sans rabâchage', () => {
    let s = start(
      [reviewCard('leechy', { lapses: 5 })],
      [],
      cfg({ targetReviews: 0, targetMs: 0, leechThreshold: 6 }),
    )
    const r = answer(s, { rating: 'again', now: T0, elapsedMs: 1000 })
    s = r.state
    expect(r.leech.becameLeech).toBe(true)
    expect(r.leech.shouldSuspend).toBe(true)
    expect(s.tally.leeches).toBe(1)
    expect(s.status).toBe('finished') // file vidée, carte non re-présentée
    expect(s.endReason).toBe('queue-empty')
  })

  it('refuse une réponse sur une session terminée', () => {
    const s = start([], [])
    expect(() => answer(s, { rating: 'good', now: T0, elapsedMs: 1 })).toThrow()
  })
})

describe('stopSession', () => {
  it('force la fin avec la raison "stopped"', () => {
    let s = start([reviewCard('a'), reviewCard('b')], [])
    s = answer(s, { rating: 'again', now: T0, elapsedMs: 1000 }).state
    s = stopSession(s, T0 + MIN)
    expect(s.status).toBe('finished')
    expect(s.endReason).toBe('stopped')
  })
})

describe('résumé et progression', () => {
  it('sessionSummary agrège le décompte', () => {
    let s = start([reviewCard('a'), reviewCard('b')], [], cfg({ targetReviews: 0, targetMs: 0 }))
    s = answer(s, { rating: 'good', now: T0, elapsedMs: 2000 }).state
    s = answer(s, { rating: 'easy', now: T0 + MIN, elapsedMs: 4000 }).state
    const sum = sessionSummary(s, T0 + 2 * MIN)
    expect(sum).toMatchObject({ reviews: 2, good: 1, easy: 1, endReason: 'queue-empty' })
    expect(sum.durationMs).toBe(2 * MIN)
    expect(sum.timeMs).toBe(6000)
  })

  it('sessionProgress avance quand des cartes sont terminées', () => {
    let s = start(
      [reviewCard('a'), reviewCard('b'), reviewCard('c')],
      [],
      cfg({ targetReviews: 0, targetMs: 0 }),
    )
    expect(sessionProgress(s)).toEqual({ done: 0, total: 3 })
    s = answer(s, { rating: 'easy', now: T0, elapsedMs: 1000 }).state
    expect(sessionProgress(s).done).toBe(1)
  })
})
