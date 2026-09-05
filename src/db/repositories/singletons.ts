import { type HskDatabase } from '../db'
import {
  DEFAULT_SETTINGS,
  INITIAL_PROGRESS,
  type Settings,
  type UserProgress,
} from '../../types/progress'

export async function getSettings(db: HskDatabase): Promise<Settings | null> {
  return (await db.settings.get('settings')) ?? null
}

export async function putSettings(db: HskDatabase, settings: Settings): Promise<void> {
  await db.settings.put({ ...settings, id: 'settings' })
}

/** Lit les réglages, en les initialisant aux valeurs par défaut s'ils sont absents. */
export async function ensureSettings(db: HskDatabase): Promise<Settings> {
  const existing = await getSettings(db)
  if (existing) {
    return existing
  }
  await putSettings(db, DEFAULT_SETTINGS)
  return DEFAULT_SETTINGS
}

export async function getProgress(db: HskDatabase): Promise<UserProgress | null> {
  return (await db.userProgress.get('progress')) ?? null
}

export async function putProgress(db: HskDatabase, progress: UserProgress): Promise<void> {
  await db.userProgress.put({ ...progress, id: 'progress' })
}

export async function ensureProgress(db: HskDatabase): Promise<UserProgress> {
  const existing = await getProgress(db)
  if (existing) {
    return existing
  }
  await putProgress(db, INITIAL_PROGRESS)
  return INITIAL_PROGRESS
}

export async function getAllMeta(db: HskDatabase): Promise<Record<string, string>> {
  const rows = await db.meta.toArray()
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

export async function getMeta(db: HskDatabase, key: string): Promise<string | null> {
  return (await db.meta.get(key))?.value ?? null
}

export async function setMeta(db: HskDatabase, key: string, value: string): Promise<void> {
  await db.meta.put({ key, value })
}

export async function replaceAllMeta(db: HskDatabase, meta: Record<string, string>): Promise<void> {
  await db.transaction('rw', db.meta, async () => {
    await db.meta.clear()
    await db.meta.bulkPut(Object.entries(meta).map(([key, value]) => ({ key, value })))
  })
}
