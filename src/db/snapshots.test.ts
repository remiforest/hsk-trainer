import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { dropDb, freshDb } from '../test/idb'
import { makeCard, makeProgress, makeSettings } from '../test/factories'
import { type HskDatabase } from './db'
import {
  createSnapshot,
  listSnapshots,
  maybeCreateDailySnapshot,
  restoreSnapshot,
  rotateSnapshots,
} from './snapshots'
import { type Snapshot, type SnapshotReason } from '../types/backup'

const DAY = 86_400_000
const T0 = Date.UTC(2026, 5, 1, 10, 0, 0)

function snapRow(reason: SnapshotReason, createdAt: number): Snapshot {
  return {
    id: `${reason}-${createdAt}`,
    createdAt,
    reason,
    schemaVersion: 1,
    appVersion: '0.1.0',
    contentVersion: 'test',
    counts: { cards: 0, events: 0, completedLessons: 0 },
    payload: {
      cards: [],
      events: [],
      userProgress: makeProgress(),
      settings: makeSettings(),
      meta: {},
    },
  }
}

describe('snapshots', () => {
  let db: HskDatabase

  beforeEach(async () => {
    db = await freshDb()
  })
  afterEach(async () => {
    await dropDb(db)
  })

  it('crée un snapshot avec les bons compteurs et le liste', async () => {
    await db.cards.bulkPut([makeCard({ itemId: 'w-0001' }), makeCard({ itemId: 'w-0002' })])
    await db.settings.put(makeSettings())
    await db.userProgress.put(makeProgress({ completedLessonIds: ['l-1'] }))

    const meta = await createSnapshot(db, 'manual', { now: T0, contentVersion: 'v1' })
    expect(meta.counts).toEqual({ cards: 2, events: 0, completedLessons: 1 })
    expect(meta.contentVersion).toBe('v1')

    const list = await listSnapshots(db)
    expect(list).toHaveLength(1)
    expect(list[0]).not.toHaveProperty('payload')
  })

  it('liste les snapshots du plus récent au plus ancien', async () => {
    await db.snapshots.bulkPut([
      snapRow('manual', T0),
      snapRow('manual', T0 + 5 * DAY),
      snapRow('manual', T0 + 2 * DAY),
    ])
    const list = await listSnapshots(db)
    expect(list.map((s) => s.createdAt)).toEqual([T0 + 5 * DAY, T0 + 2 * DAY, T0])
  })

  describe('rotateSnapshots', () => {
    it('conserve les 7 derniers jours puis 4 semaines de snapshots auto', async () => {
      const rows: Snapshot[] = []
      // 40 jours de snapshots auto quotidiens
      for (let d = 0; d < 40; d += 1) {
        rows.push(snapRow('auto', T0 + d * DAY))
      }
      await db.snapshots.bulkPut(rows)

      const { deleted } = await rotateSnapshots(db, { timeZone: 'UTC' })
      const kept = await listSnapshots(db)

      // 7 jours + 4 semaines = 11 au maximum
      expect(kept.length).toBeLessThanOrEqual(11)
      expect(kept.length).toBeGreaterThanOrEqual(9)
      expect(deleted.length).toBe(40 - kept.length)
      // les 7 plus récents sont forcément là
      const newest7 = rows
        .slice(-7)
        .map((r) => r.id)
        .sort()
      expect(newest7.every((id) => kept.some((k) => k.id === id))).toBe(true)
    })

    it('ne garde qu’un snapshot auto par jour', async () => {
      await db.snapshots.bulkPut([
        snapRow('auto', T0 + 1 * 3_600_000),
        snapRow('auto', T0 + 5 * 3_600_000),
        snapRow('auto', T0 + 9 * 3_600_000),
      ])
      await rotateSnapshots(db, { timeZone: 'UTC' })
      const kept = await listSnapshots(db)
      expect(kept).toHaveLength(1)
      expect(kept[0]?.createdAt).toBe(T0 + 9 * 3_600_000)
    })

    it('ne supprime jamais les snapshots manuels ni pre-migration', async () => {
      await db.snapshots.bulkPut([
        snapRow('manual', T0 - 400 * DAY),
        snapRow('pre-migration', T0 - 300 * DAY),
        snapRow('pre-restore', T0 - 200 * DAY),
        snapRow('pre-import', T0 - 100 * DAY),
        ...Array.from({ length: 20 }, (_, d) => snapRow('auto', T0 + d * DAY)),
      ])
      await rotateSnapshots(db, { timeZone: 'UTC' })
      const kept = await listSnapshots(db)
      for (const reason of ['manual', 'pre-migration', 'pre-restore', 'pre-import'] as const) {
        expect(kept.some((s) => s.reason === reason)).toBe(true)
      }
    })

    it('est idempotente', async () => {
      await db.snapshots.bulkPut(
        Array.from({ length: 30 }, (_, d) => snapRow('auto', T0 + d * DAY)),
      )
      const first = await rotateSnapshots(db, { timeZone: 'UTC' })
      const second = await rotateSnapshots(db, { timeZone: 'UTC' })
      expect(second.deleted).toEqual([])
      expect(second.kept.sort()).toEqual(first.kept.sort())
    })
  })

  describe('maybeCreateDailySnapshot', () => {
    it('crée un snapshot le premier appel du jour, pas le second', async () => {
      const first = await maybeCreateDailySnapshot(db, { now: T0, timeZone: 'UTC' })
      const second = await maybeCreateDailySnapshot(db, {
        now: T0 + 3 * 3_600_000,
        timeZone: 'UTC',
      })
      expect(first).not.toBeNull()
      expect(second).toBeNull()
      expect(await db.snapshots.count()).toBe(1)
    })

    it('crée un nouveau snapshot le lendemain', async () => {
      await maybeCreateDailySnapshot(db, { now: T0, timeZone: 'UTC' })
      const next = await maybeCreateDailySnapshot(db, { now: T0 + DAY, timeZone: 'UTC' })
      expect(next).not.toBeNull()
      expect(await db.snapshots.count()).toBe(2)
    })
  })

  describe('restoreSnapshot', () => {
    it('remplace l’état courant et prend un snapshot pre-restore', async () => {
      await db.cards.bulkPut([makeCard({ itemId: 'w-0001' }), makeCard({ itemId: 'w-0002' })])
      await db.settings.put(makeSettings({ newCardsPerDay: 3 }))
      await db.userProgress.put(makeProgress({ streakDays: 4 }))
      const meta = await createSnapshot(db, 'manual', { now: T0 })

      // on modifie l'état après le snapshot
      await db.cards.bulkPut([makeCard({ itemId: 'w-0003' }), makeCard({ itemId: 'w-0004' })])
      await db.settings.put(makeSettings({ newCardsPerDay: 99 }))

      await restoreSnapshot(db, meta.id, { now: T0 + DAY })

      const cards = await db.cards.toArray()
      expect(cards.map((c) => c.itemId).sort()).toEqual(['w-0001', 'w-0002'])
      expect((await db.settings.get('settings'))?.newCardsPerDay).toBe(3)
      expect((await db.userProgress.get('progress'))?.streakDays).toBe(4)
      expect((await listSnapshots(db)).some((s) => s.reason === 'pre-restore')).toBe(true)
    })

    it('échoue proprement sur un id inconnu', async () => {
      await expect(restoreSnapshot(db, 'nope', { now: T0 })).rejects.toThrow(/introuvable/)
    })
  })
})
