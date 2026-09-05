/**
 * Lecture/écriture du bloc « données utilisateur » (tout sauf le store des
 * snapshots). Partagé par les snapshots et l'export/import.
 */

import { type HskDatabase } from './db'
import { getAllCards } from './repositories/cards'
import { getAllEvents } from './repositories/events'
import { getAllMeta, getProgress, getSettings } from './repositories/singletons'
import { type UserDataDump } from '../types/backup'
import { DEFAULT_SETTINGS, INITIAL_PROGRESS } from '../types/progress'

export async function dumpUserData(db: HskDatabase): Promise<UserDataDump> {
  const [cards, events, userProgress, settings, meta] = await Promise.all([
    getAllCards(db),
    getAllEvents(db),
    getProgress(db),
    getSettings(db),
    getAllMeta(db),
  ])
  return {
    cards,
    events,
    userProgress: userProgress ?? INITIAL_PROGRESS,
    settings: settings ?? DEFAULT_SETTINGS,
    meta,
  }
}

/**
 * Remplace intégralement les données utilisateur par celles du dump, en une
 * transaction. Le store `snapshots` n'est pas touché (l'historique des
 * sauvegardes est conservé).
 */
export async function writeUserData(db: HskDatabase, dump: UserDataDump): Promise<void> {
  await db.transaction(
    'rw',
    db.cards,
    db.events,
    db.userProgress,
    db.settings,
    db.meta,
    async () => {
      await Promise.all([
        db.cards.clear(),
        db.events.clear(),
        db.userProgress.clear(),
        db.settings.clear(),
        db.meta.clear(),
      ])
      await db.cards.bulkPut(dump.cards)
      await db.events.bulkPut(dump.events)
      await db.userProgress.put({ ...dump.userProgress, id: 'progress' })
      await db.settings.put({ ...dump.settings, id: 'settings' })
      await db.meta.bulkPut(Object.entries(dump.meta).map(([key, value]) => ({ key, value })))
    },
  )
}
