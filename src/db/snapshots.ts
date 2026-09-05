/**
 * Snapshots : sauvegardes JSON complètes stockées dans IndexedDB, avec rotation.
 *
 * Politique de rétention :
 *  - tous les snapshots non automatiques (`manual`, `pre-migration`,
 *    `pre-restore`, `pre-import`) sont conservés ;
 *  - parmi les snapshots `auto` : le plus récent de chacun des 7 derniers jours,
 *    puis le plus récent de chacune des 4 dernières semaines ISO.
 */

import { APP_VERSION, SCHEMA_VERSION, type HskDatabase } from './db'
import { dumpUserData, writeUserData } from './user-data'
import { isoWeekKey, localDayKey } from '../core/time/day'
import {
  type Snapshot,
  type SnapshotMeta,
  type SnapshotReason,
  type UserDataDump,
} from '../types/backup'

const DAILY_KEEP_DAYS = 7
const WEEKLY_KEEP_WEEKS = 4

export interface SnapshotOptions {
  now: number
  contentVersion?: string
  timeZone?: string
}

function metaOf(s: Snapshot): SnapshotMeta {
  const { payload: _payload, ...meta } = s
  return meta
}

function buildSnapshot(
  reason: SnapshotReason,
  payload: UserDataDump,
  opts: SnapshotOptions,
): Snapshot {
  return {
    id: crypto.randomUUID(),
    createdAt: opts.now,
    reason,
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    contentVersion: opts.contentVersion ?? 'unknown',
    counts: {
      cards: payload.cards.length,
      events: payload.events.length,
      completedLessons: payload.userProgress.completedLessonIds.length,
    },
    payload,
  }
}

export async function createSnapshot(
  db: HskDatabase,
  reason: SnapshotReason,
  opts: SnapshotOptions,
): Promise<SnapshotMeta> {
  const payload = await dumpUserData(db)
  const snapshot = buildSnapshot(reason, payload, opts)
  await db.snapshots.put(snapshot)
  return metaOf(snapshot)
}

export async function listSnapshots(db: HskDatabase): Promise<SnapshotMeta[]> {
  const all = await db.snapshots.toArray()
  return all.map(metaOf).sort((a, b) => b.createdAt - a.createdAt)
}

export async function getSnapshot(db: HskDatabase, id: string): Promise<Snapshot | undefined> {
  return db.snapshots.get(id)
}

export async function deleteSnapshot(db: HskDatabase, id: string): Promise<void> {
  await db.snapshots.delete(id)
}

export interface RotationResult {
  kept: string[]
  deleted: string[]
}

/** Applique la politique de rétention. Idempotente. */
export async function rotateSnapshots(
  db: HskDatabase,
  opts: { timeZone?: string },
): Promise<RotationResult> {
  const all = await db.snapshots.toArray()
  const keep = new Set<string>()

  for (const s of all) {
    if (s.reason !== 'auto') {
      keep.add(s.id)
    }
  }

  const autos = all.filter((s) => s.reason === 'auto').sort((a, b) => b.createdAt - a.createdAt)

  // Le plus récent par jour.
  const newestPerDay = new Map<string, Snapshot>()
  for (const s of autos) {
    const key = localDayKey(s.createdAt, opts.timeZone)
    if (!newestPerDay.has(key)) {
      newestPerDay.set(key, s)
    }
  }
  const dayReps = [...newestPerDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))

  dayReps.slice(0, DAILY_KEEP_DAYS).forEach(([, s]) => keep.add(s.id))

  // Parmi les jours plus anciens : le plus récent par semaine ISO.
  const olderDayReps = dayReps.slice(DAILY_KEEP_DAYS)
  const newestPerWeek = new Map<string, Snapshot>()
  for (const [, s] of olderDayReps) {
    const key = isoWeekKey(s.createdAt, opts.timeZone)
    const current = newestPerWeek.get(key)
    if (!current || s.createdAt > current.createdAt) {
      newestPerWeek.set(key, s)
    }
  }
  ;[...newestPerWeek.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, WEEKLY_KEEP_WEEKS)
    .forEach(([, s]) => keep.add(s.id))

  const deleted = all.filter((s) => !keep.has(s.id)).map((s) => s.id)
  if (deleted.length > 0) {
    await db.snapshots.bulkDelete(deleted)
  }
  return { kept: [...keep], deleted }
}

/** Crée le snapshot automatique du jour s'il n'existe pas encore, puis fait la rotation. */
export async function maybeCreateDailySnapshot(
  db: HskDatabase,
  opts: SnapshotOptions,
): Promise<SnapshotMeta | null> {
  const todayKey = localDayKey(opts.now, opts.timeZone)
  const all = await db.snapshots.toArray()
  const hasToday = all.some(
    (s) => s.reason === 'auto' && localDayKey(s.createdAt, opts.timeZone) === todayKey,
  )
  if (hasToday) {
    return null
  }
  const meta = await createSnapshot(db, 'auto', opts)
  await rotateSnapshots(db, { ...(opts.timeZone !== undefined ? { timeZone: opts.timeZone } : {}) })
  return meta
}

/**
 * Restaure un snapshot. Un snapshot `pre-restore` est pris juste avant (filet de
 * sécurité), puis les données utilisateur sont intégralement remplacées.
 */
export async function restoreSnapshot(
  db: HskDatabase,
  id: string,
  opts: SnapshotOptions,
): Promise<void> {
  const snapshot = await getSnapshot(db, id)
  if (!snapshot) {
    throw new Error(`Snapshot introuvable : ${id}`)
  }
  await createSnapshot(db, 'pre-restore', opts)
  await writeUserData(db, snapshot.payload)
}
