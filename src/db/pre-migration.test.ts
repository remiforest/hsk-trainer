import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { snapshotBeforeMigration } from './pre-migration'
import { type Snapshot } from '../types/backup'
// `fake-indexeddb` est injecté par les setupFiles de Vitest (avant tout import de dexie).

const T0 = Date.UTC(2026, 6, 1, 12, 0, 0)

const V1_STORES = {
  cards: '&id, state, due, [state+due], itemType',
  events: '&id, seq, at, kind, cardId, [cardId+seq]',
  snapshots: '&id, createdAt, reason',
  userProgress: '&id',
  settings: '&id',
  meta: '&key',
}

function openV1(name: string): Dexie {
  const d = new Dexie(name)
  d.version(1).stores(V1_STORES)
  return d
}

function openV2(name: string): Dexie {
  const d = new Dexie(name)
  d.version(1).stores(V1_STORES)
  d.version(2)
    .stores({ cards: '&id, state, due, [state+due], itemType, cardType' })
    .upgrade(async (tx) => {
      await tx
        .table('cards')
        .toCollection()
        .modify((c: Record<string, unknown>) => {
          c['migratedTo'] = 'v2'
        })
    })
  return d
}

const openDbs: Dexie[] = []
afterEach(async () => {
  for (const d of openDbs.splice(0)) {
    d.close()
    await d.delete().catch(() => undefined)
  }
})

describe('snapshotBeforeMigration', () => {
  it('sauvegarde les données avant une migration puis la migration s’applique', async () => {
    const name = `premig-${Date.now()}-${Math.random().toString(36).slice(2)}`

    const d1 = openV1(name)
    openDbs.push(d1)
    await d1.open()
    await d1.table('cards').bulkPut([
      { id: 'word:w-0001:hanzi_to_sense', state: 'new', due: T0, itemType: 'word' },
      { id: 'word:w-0002:hanzi_to_sense', state: 'new', due: T0, itemType: 'word' },
    ])
    await d1.table('events').put({
      id: 'e1',
      seq: 1,
      at: T0,
      kind: 'lesson_completed',
      lessonId: 'l-1',
    })
    d1.close()

    const meta = await snapshotBeforeMigration(name, { targetVersion: 2, now: T0 + 1000 })
    expect(meta).not.toBeNull()
    expect(meta?.reason).toBe('pre-migration')
    expect(meta?.schemaVersion).toBe(1)
    expect(meta?.counts.cards).toBe(2)
    expect(meta?.counts.events).toBe(1)

    // le snapshot est bien écrit dans la base encore en v1
    const d2 = openV2(name)
    openDbs.push(d2)
    await d2.open()
    expect(d2.verno).toBe(2)
    const snaps = (await d2.table('snapshots').toArray()) as Snapshot[]
    expect(snaps).toHaveLength(1)
    expect(snaps[0]!.payload.cards).toHaveLength(2)
    // la migration a bien tourné
    const cards = (await d2.table('cards').toArray()) as Array<Record<string, unknown>>
    expect(cards.every((c) => c['migratedTo'] === 'v2')).toBe(true)
  })

  it('ne fait rien si le schéma est déjà à la version cible', async () => {
    const name = `premig-noop-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const d = openV1(name)
    openDbs.push(d)
    await d.open()
    d.close()

    const meta = await snapshotBeforeMigration(name, { targetVersion: 1, now: T0 })
    expect(meta).toBeNull()
  })

  it('ne fait rien pour une base inexistante', async () => {
    const meta = await snapshotBeforeMigration(`absente-${Math.random()}`, {
      targetVersion: 2,
      now: T0,
    })
    expect(meta).toBeNull()
  })
})
