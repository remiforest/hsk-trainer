/**
 * Aide aux tests de la couche `db` : une base IndexedDB neuve et isolée par test,
 * via `fake-indexeddb`.
 */

import 'fake-indexeddb/auto'
import { HskDatabase } from '../db/db'

let counter = 0

export async function freshDb(): Promise<HskDatabase> {
  counter += 1
  const db = new HskDatabase(`test-${Date.now()}-${counter}-${Math.random().toString(36).slice(2)}`)
  await db.open()
  return db
}

export async function dropDb(db: HskDatabase): Promise<void> {
  db.close()
  await db.delete()
}
