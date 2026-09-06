import { afterEach, describe, expect, it } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { HskDatabase } from '../db/db'
import { JournalBuilder, makeCard } from '../test/factories'
import { useBootstrap } from './useBootstrap'

const DAY = 86_400_000
const T0 = Date.UTC(2026, 0, 15, 9, 0, 0)

const uniqueName = (p: string): string =>
  `${p}-${Date.now()}-${Math.random().toString(36).slice(2)}`

const openDbs: HskDatabase[] = []
afterEach(async () => {
  for (const d of openDbs.splice(0)) {
    d.close()
    await d.delete().catch(() => undefined)
  }
})

describe('useBootstrap', () => {
  it('passe de « loading » à « ready » sur une base vierge', async () => {
    const { result } = renderHook(() =>
      useBootstrap({ dbName: uniqueName('ub-ok'), now: T0, timeZone: 'UTC' }),
    )
    expect(result.current.state.phase).toBe('loading')

    await waitFor(() => expect(result.current.state.phase).toBe('ready'))
    if (result.current.state.phase === 'ready') {
      openDbs.push(result.current.state.db)
      expect(result.current.state.report.ok).toBe(true)
    }
  })

  it('bascule en « recovery » quand l’état stocké est incohérent, sans planter', async () => {
    const dbName = uniqueName('ub-rec')
    const seed = new HskDatabase(dbName)
    await seed.open()
    const b = new JournalBuilder()
    const c = makeCard({ itemId: 'w-0001' })
    b.create(c, T0).review(c.id, 'good', T0 + DAY)
    await seed.cards.bulkPut(b.expectedCards)
    await seed.events.bulkPut(b.events)
    await seed.cards.toCollection().modify((x) => {
      x.reps = 99
    })
    seed.close()

    const { result } = renderHook(() =>
      useBootstrap({ dbName, now: T0 + 2 * DAY, timeZone: 'UTC' }),
    )

    await waitFor(() => expect(result.current.state.phase).toBe('recovery'))
    if (result.current.state.phase === 'recovery') {
      openDbs.push(result.current.state.db)
      expect(result.current.state.report.hasErrors).toBe(true)
      expect(Array.isArray(result.current.state.snapshots)).toBe(true)
    }
  })
})
