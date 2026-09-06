import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { HskDatabase } from '../../db/db'
import { makeCard, makeCatalog, makeSettings, makeWord } from '../../test/factories'
import { buildDayQueue } from '../../core/srs/queue'
import { getAllEvents } from '../../db/repositories/events'
import { type Card } from '../../types/srs'
import { type Settings } from '../../types/progress'
import { useSession, type UseSessionDeps } from './useSession'

const HOUR = 3_600_000
const T0 = Date.UTC(2026, 0, 15, 9, 0, 0)

const uniqueName = (p: string): string =>
  `${p}-${Date.now()}-${Math.random().toString(36).slice(2)}`

const openDbs: HskDatabase[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const d of openDbs.splice(0)) {
    d.close()
    await d.delete().catch(() => undefined)
  }
})

async function freshDb(): Promise<HskDatabase> {
  const db = new HskDatabase(uniqueName('us'))
  await db.open()
  openDbs.push(db)
  return db
}

const words = [
  makeWord({ id: 'w-0001' }),
  makeWord({ id: 'w-0002' }),
  makeWord({ id: 'w-0003' }),
  makeWord({ id: 'w-0004' }),
  makeWord({ id: 'w-0005' }),
]

const due = (id: string, over: Partial<Card> = {}): Card =>
  makeCard({
    itemId: id,
    cardType: 'hanzi_to_sense',
    state: 'review',
    due: T0 - HOUR,
    reps: 3,
    stability: 10,
    difficulty: 5,
    ...over,
  })

async function setup(
  cards: Card[],
  settings: Settings,
): Promise<{
  deps: Omit<UseSessionDeps, 'clock'>
  db: HskDatabase
  tick: (ms: number) => void
  clock: () => number
}> {
  const db = await freshDb()
  await db.cards.bulkPut(cards)
  const plan = buildDayQueue({ cards, events: [], settings, now: T0 })
  let t = T0
  return {
    db,
    clock: () => t,
    tick: (ms) => {
      t += ms
    },
    deps: {
      db,
      catalog: makeCatalog({ words }),
      plan,
      settings,
      timeZone: 'UTC',
      rng: () => 0,
    },
  }
}

describe('useSession', () => {
  it('note une carte en reconnaissance, la persiste et passe à la suivante', async () => {
    const { deps, db, clock, tick } = await setup([due('w-0001'), due('w-0002')], makeSettings())
    const { result } = renderHook(() => useSession({ ...deps, clock }))

    expect(result.current.status).toBe('active')
    expect(result.current.exercise?.kind).toBe('reveal')
    const firstId = result.current.card?.id

    act(() => {
      result.current.reveal()
    })
    expect(result.current.phase).toMatchObject({ kind: 'graded', correct: null })

    tick(4000)
    act(() => {
      result.current.grade('good')
    })

    await waitFor(() => expect(result.current.progress.done).toBe(1))
    expect(result.current.phase.kind).toBe('question')
    expect(result.current.card?.id).not.toBe(firstId)
    expect(await getAllEvents(db)).toHaveLength(1)
  })

  it('QCM raté : la note est « à revoir », l’événement est écrit', async () => {
    const { deps, db, clock, tick } = await setup(
      [due('w-0001', { cardType: 'sense_to_hanzi' })],
      makeSettings(),
    )
    const { result } = renderHook(() => useSession({ ...deps, clock }))

    expect(result.current.exercise?.kind).toBe('choice')
    const ex = result.current.exercise
    const wrongId =
      ex?.kind === 'choice'
        ? (ex.question.options.find((o) => o.id !== ex.question.correctId)?.id ?? '')
        : ''

    act(() => {
      result.current.submitChoice(wrongId)
    })
    expect(result.current.phase).toMatchObject({ kind: 'graded', correct: false, picked: wrongId })

    tick(3000)
    act(() => {
      result.current.grade('again')
    })

    await waitFor(() => expect(result.current.persisting).toBe(false))
    expect(await getAllEvents(db)).toHaveLength(1)
  })

  it('termine la session et produit un résumé quand la file se vide', async () => {
    const settings = makeSettings({ dailyReviewTarget: 0, dailyMinutesTarget: 0 })
    const { deps, db, clock, tick } = await setup([due('w-0001')], settings)
    const { result } = renderHook(() => useSession({ ...deps, clock }))

    act(() => {
      result.current.reveal()
    })
    tick(2000)
    act(() => {
      result.current.grade('easy')
    })

    await waitFor(() => expect(result.current.status).toBe('finished'))
    expect(result.current.summary?.reviews).toBe(1)
    expect(result.current.summary?.endReason).toBe('queue-empty')
    expect(await getAllEvents(db)).toHaveLength(1)
  })

  it('l’arrêt manuel clôt sur un résumé sans écrire d’événement de plus', async () => {
    const { deps, db, clock, tick } = await setup([due('w-0001'), due('w-0002')], makeSettings())
    const { result } = renderHook(() => useSession({ ...deps, clock }))

    act(() => {
      result.current.reveal()
    })
    tick(1000)
    act(() => {
      result.current.grade('good')
    })
    await waitFor(() => expect(result.current.progress.done).toBe(1))
    const eventsBefore = (await getAllEvents(db)).length

    act(() => {
      result.current.stop()
    })
    expect(result.current.status).toBe('finished')
    expect(result.current.summary?.endReason).toBe('stopped')
    expect((await getAllEvents(db)).length).toBe(eventsBefore)
  })

  it('si la persistance échoue, la carte reste et l’erreur est exposée', async () => {
    const { deps, db, clock, tick } = await setup([due('w-0001')], makeSettings())
    vi.spyOn(db.cards, 'put').mockRejectedValueOnce(new Error('quota dépassé'))

    const { result } = renderHook(() => useSession({ ...deps, clock }))
    const id = result.current.card?.id

    act(() => {
      result.current.reveal()
    })
    tick(1000)
    act(() => {
      result.current.grade('good')
    })

    await waitFor(() => expect(result.current.error).toBe('quota dépassé'))
    expect(result.current.card?.id).toBe(id)
    expect(result.current.phase.kind).toBe('graded')
    expect(await getAllEvents(db)).toHaveLength(0)
  })
})
