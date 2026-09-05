/**
 * Snapshot pris **avant** toute migration de schéma.
 *
 * On ouvre la base existante en schéma dynamique (sans déclarer de version), ce
 * qui n'exécute aucune migration, on lit toutes les données, et on écrit un
 * snapshot `pre-migration` dans le store `snapshots` de cette base. Ensuite
 * seulement l'appelant ouvre `HskDatabase` à la version courante, ce qui
 * déclenche la migration ; le snapshot est déjà persistant et lui survit.
 */

import Dexie from 'dexie'
import { APP_VERSION, type MetaRow } from './db'
import { type Snapshot, type SnapshotMeta, type UserDataDump } from '../types/backup'
import { type JournalEvent } from '../types/events'
import {
  DEFAULT_SETTINGS,
  INITIAL_PROGRESS,
  type Settings,
  type UserProgress,
} from '../types/progress'
import { type Card } from '../types/srs'

export interface PreMigrationOptions {
  /** version de schéma vers laquelle le code veut migrer */
  targetVersion: number
  now: number
  contentVersion?: string
}

async function readDumpGeneric(bare: Dexie): Promise<UserDataDump> {
  const names = new Set(bare.tables.map((t) => t.name))
  const readAll = async <T>(name: string): Promise<T[]> =>
    names.has(name) ? (bare.table(name).toArray() as Promise<T[]>) : Promise.resolve([])

  const [cards, events, progressRows, settingsRows, metaRows] = await Promise.all([
    readAll<Card>('cards'),
    readAll<JournalEvent>('events'),
    readAll<UserProgress>('userProgress'),
    readAll<Settings>('settings'),
    readAll<MetaRow>('meta'),
  ])

  return {
    cards,
    events,
    userProgress: progressRows[0] ?? INITIAL_PROGRESS,
    settings: settingsRows[0] ?? DEFAULT_SETTINGS,
    meta: Object.fromEntries(metaRows.map((r) => [r.key, r.value])),
  }
}

export async function snapshotBeforeMigration(
  dbName: string,
  opts: PreMigrationOptions,
): Promise<SnapshotMeta | null> {
  if (!(await Dexie.exists(dbName))) {
    return null // installation neuve : rien à sauvegarder
  }

  const bare = new Dexie(dbName)
  await bare.open()
  try {
    if (bare.verno >= opts.targetVersion) {
      return null // aucune migration en attente
    }

    const payload = await readDumpGeneric(bare)
    const snapshot: Snapshot = {
      id: crypto.randomUUID(),
      createdAt: opts.now,
      reason: 'pre-migration',
      schemaVersion: bare.verno, // version AVANT migration
      appVersion: APP_VERSION,
      contentVersion: opts.contentVersion ?? 'unknown',
      counts: {
        cards: payload.cards.length,
        events: payload.events.length,
        completedLessons: payload.userProgress.completedLessonIds.length,
      },
      payload,
    }

    if (bare.tables.some((t) => t.name === 'snapshots')) {
      await bare.table('snapshots').put(snapshot)
    }

    const { payload: _payload, ...meta } = snapshot
    return meta
  } finally {
    bare.close()
  }
}
