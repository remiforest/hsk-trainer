import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { dropDb, freshDb } from '../test/idb'
import { JournalBuilder, makeCard, makeProgress, makeSettings } from '../test/factories'
import { type HskDatabase } from './db'
import { dumpUserData } from './user-data'
import {
  buildExportBundle,
  exportProgress,
  importBundle,
  parseBundle,
  previewBundle,
  serializeBundle,
} from './export-import'
import { listSnapshots } from './snapshots'
import { type UserDataDump } from '../types/backup'

const DAY = 86_400_000
const T0 = Date.UTC(2026, 2, 1, 9, 0, 0)

async function seedState(db: HskDatabase): Promise<void> {
  const b = new JournalBuilder()
  const c1 = makeCard({ itemId: 'w-0001', cardType: 'hanzi_to_sense' })
  const c2 = makeCard({ itemId: 'w-0002', cardType: 'sense_to_hanzi' })
  const c3 = makeCard({ itemId: 'g-0001', itemType: 'grammar', cardType: 'grammar_fill' })
  b.create(c1, T0)
    .create(c2, T0)
    .create(c3, T0)
    .review(c1.id, 'good', T0 + DAY)
    .review(c1.id, 'again', T0 + 2 * DAY)
    .review(c2.id, 'easy', T0 + 2 * DAY)

  await db.cards.bulkPut(b.expectedCards)
  await db.events.bulkPut(b.events)
  await db.settings.put(makeSettings({ newCardsPerDay: 5, theme: 'dark' }))
  await db.userProgress.put(
    makeProgress({
      completedLessonIds: ['l-1'],
      streakDays: 3,
      totalReviews: 3,
      totalTimeMs: 6000,
    }),
  )
  await db.meta.bulkPut([
    { key: 'fsrsParamsVersion', value: '1' },
    { key: 'installId', value: 'abc-123' },
  ])
}

function normalize(dump: UserDataDump): UserDataDump {
  return {
    ...dump,
    cards: [...dump.cards].sort((a, b) => a.id.localeCompare(b.id)),
    events: [...dump.events].sort((a, b) => a.seq - b.seq),
  }
}

describe('export / import', () => {
  let db: HskDatabase

  beforeEach(async () => {
    db = await freshDb()
  })
  afterEach(async () => {
    await dropDb(db)
  })

  it('round-trip : export -> effacement -> import restaure exactement le même état', async () => {
    await seedState(db)
    const before = normalize(await dumpUserData(db))

    const bundle = await exportProgress(db, { now: T0 + 3 * DAY, contentVersion: 'hsk1-v1' })
    const json = serializeBundle(bundle)

    // nouvelle base, comme après effacement des données du navigateur
    const db2 = await freshDb()
    try {
      const parsed = parseBundle(json)
      expect(parsed.ok).toBe(true)
      if (!parsed.ok) return
      await importBundle(db2, parsed.bundle, { now: T0 + 4 * DAY })

      const after = normalize(await dumpUserData(db2))
      expect(after).toEqual(before)
    } finally {
      await dropDb(db2)
    }
  })

  it('serialize -> parseBundle est stable', () => {
    const bundle = buildExportBundle(
      { cards: [], events: [], userProgress: makeProgress(), settings: makeSettings(), meta: {} },
      { now: T0, contentVersion: 'x' },
    )
    const parsed = parseBundle(serializeBundle(bundle))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.bundle).toEqual(bundle)
  })

  describe('parseBundle rejette', () => {
    it('un JSON illisible', () => {
      const r = parseBundle('{ pas du json')
      expect(r.ok).toBe(false)
    })
    it('un mauvais format', () => {
      const r = parseBundle(JSON.stringify({ format: 'autre-chose', version: 1 }))
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.errors.join(' ')).toContain('Format')
    })
    it('une version inconnue', () => {
      const r = parseBundle(JSON.stringify({ format: 'hsk-trainer-export', version: 999 }))
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.errors[0]).toContain('Version')
    })
    it('un schéma invalide (date non finie)', async () => {
      await seedState(db)
      const bundle = await exportProgress(db, { now: T0, contentVersion: 'x' })
      const broken = structuredClone(bundle)
      broken.data.cards[0]!.due = Number.POSITIVE_INFINITY
      const r = parseBundle(broken)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.errors.join(' ')).toContain('due')
    })
    it('un champ requis manquant', async () => {
      await seedState(db)
      const bundle = await exportProgress(db, { now: T0, contentVersion: 'x' })
      const broken = structuredClone(bundle) as { data: Partial<typeof bundle.data> }
      delete broken.data.settings
      const r = parseBundle(broken)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.errors.join(' ')).toContain('settings')
    })
  })

  it('previewBundle résume le contenu', async () => {
    await seedState(db)
    const bundle = await exportProgress(db, { now: T0 + 3 * DAY, contentVersion: 'hsk1-v1' })
    const preview = previewBundle(bundle, { currentContentVersion: 'hsk1-v1' })

    expect(preview.cardCount).toBe(3)
    expect(preview.eventCount).toBe(6)
    expect(preview.completedLessons).toBe(1)
    expect(preview.streakDays).toBe(3)
    expect(preview.lastActivityAt).toBe(T0 + 2 * DAY)
    expect(preview.contentMatchesCurrent).toBe(true)
    expect(previewBundle(bundle, { currentContentVersion: 'autre' }).contentMatchesCurrent).toBe(
      false,
    )
  })

  it('importBundle prend un snapshot pre-import avant de remplacer', async () => {
    await seedState(db)
    const bundle = await exportProgress(db, { now: T0, contentVersion: 'x' })

    await db.cards.clear()
    await importBundle(db, bundle, { now: T0 + DAY })

    expect(await db.cards.count()).toBe(3)
    expect((await listSnapshots(db)).some((s) => s.reason === 'pre-import')).toBe(true)
  })

  it('un ré-import est idempotent', async () => {
    await seedState(db)
    const bundle = await exportProgress(db, { now: T0, contentVersion: 'x' })
    await importBundle(db, bundle, { now: T0 + DAY })
    const first = normalize(await dumpUserData(db))
    await importBundle(db, bundle, { now: T0 + 2 * DAY })
    const second = normalize(await dumpUserData(db))
    expect(second).toEqual(first)
  })
})
