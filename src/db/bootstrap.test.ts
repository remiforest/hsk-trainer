import { afterEach, describe, expect, it } from 'vitest'
import { HskDatabase } from './db'
import { bootstrap } from './bootstrap'
import { rebuildCardsAndPersist } from './recover'
import { JournalBuilder, makeCard, makeCatalog } from '../test/factories'
import { getAllEvents } from './repositories/events'

const DAY = 86_400_000
const T0 = Date.UTC(2026, 8, 1, 8, 0, 0)

const openDbs: HskDatabase[] = []
function track(db: HskDatabase): HskDatabase {
  openDbs.push(db)
  return db
}
afterEach(async () => {
  for (const d of openDbs.splice(0)) {
    d.close()
    await d.delete().catch(() => undefined)
  }
})

function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

async function seed(name: string): Promise<{ events: JournalBuilder }> {
  const db = track(new HskDatabase(name))
  await db.open()
  const b = new JournalBuilder()
  const c1 = makeCard({ itemId: 'w-0001' })
  const c2 = makeCard({ itemId: 'w-0002' })
  b.create(c1, T0)
    .create(c2, T0)
    .review(c1.id, 'good', T0 + DAY)
  await db.cards.bulkPut(b.expectedCards)
  await db.events.bulkPut(b.events)
  db.close()
  openDbs.pop()
  return { events: b }
}

describe('bootstrap', () => {
  it('démarre proprement sur une base vide et crée le snapshot du jour', async () => {
    const name = uniqueName('boot-empty')
    const res = await bootstrap({ now: T0, catalog: makeCatalog(), dbName: name })
    track(res.db)

    expect(res.status).toBe('ok')
    expect(res.report.ok).toBe(true)
    if (res.status === 'ok') {
      expect(res.dailySnapshot).not.toBeNull()
    }
    expect(await res.db.settings.get('settings')).not.toBeUndefined()
    expect(await res.db.userProgress.get('progress')).not.toBeUndefined()
  })

  it('ne crée pas deux snapshots automatiques le même jour', async () => {
    const name = uniqueName('boot-daily')
    const r1 = await bootstrap({ now: T0, catalog: makeCatalog(), dbName: name })
    r1.db.close()
    const r2 = await bootstrap({ now: T0 + 3_600_000, catalog: makeCatalog(), dbName: name })
    track(r2.db)
    if (r2.status === 'ok') {
      expect(r2.dailySnapshot).toBeNull()
    }
    expect(await r2.db.snapshots.count()).toBe(1)
  })

  it('renvoie needs-recovery quand l’état est corrompu et n’explose pas', async () => {
    const name = uniqueName('boot-corrupt')
    await seed(name)

    // corrompt la table cards : reps incohérent avec le journal
    const db = track(new HskDatabase(name))
    await db.open()
    await db.cards.toCollection().modify((c) => {
      c.reps = 99
    })
    db.close()
    openDbs.pop()

    const catalog = makeCatalog({
      cards: [makeCard({ itemId: 'w-0001' }), makeCard({ itemId: 'w-0002' })],
    })
    const res = await bootstrap({ now: T0 + 2 * DAY, catalog, dbName: name })
    track(res.db)

    expect(res.status).toBe('needs-recovery')
    if (res.status === 'needs-recovery') {
      expect(res.report.hasErrors).toBe(true)
      expect(res.report.problems.some((p) => p.kind === 'reps_mismatch')).toBe(true)
      expect(Array.isArray(res.snapshots)).toBe(true)
    }
  })

  it('rebuildCardsAndPersist répare l’état à partir du journal', async () => {
    const name = uniqueName('boot-rebuild')
    await seed(name)

    const db = track(new HskDatabase(name))
    await db.open()
    // casse tout : vide la table cards
    await db.cards.clear()

    const outcome = await rebuildCardsAndPersist(db)
    expect(outcome.cardsBefore).toBe(0)
    expect(outcome.cardsAfter).toBe(2)

    const repaired = await db.cards.toArray()
    expect(repaired.map((c) => c.itemId).sort()).toEqual(['w-0001', 'w-0002'])
    const c1 = repaired.find((c) => c.itemId === 'w-0001')
    expect(c1?.reps).toBe(1)

    // et maintenant bootstrap doit être ok
    db.close()
    openDbs.pop()
    const catalog = makeCatalog({
      cards: [makeCard({ itemId: 'w-0001' }), makeCard({ itemId: 'w-0002' })],
    })
    const res = await bootstrap({ now: T0 + 3 * DAY, catalog, dbName: name })
    track(res.db)
    expect(res.status).toBe('ok')
    expect(await getAllEvents(res.db)).toHaveLength(3)
  })
})
