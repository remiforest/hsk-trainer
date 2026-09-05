/**
 * Base IndexedDB (Dexie). Schéma **versionné** : chaque version est déclarée une
 * fois, avec sa migration, et n'est jamais modifiée rétroactivement. Un snapshot
 * `pre-migration` est pris avant l'ouverture d'une nouvelle version (voir
 * `snapshots.ts` / `bootstrap.ts`).
 *
 * Seul l'état utilisateur est stocké ici ; le contenu pédagogique reste dans
 * `src/data/`.
 */

import Dexie, { type Table } from 'dexie'
import { type Snapshot } from '../types/backup'
import { type JournalEvent } from '../types/events'
import { type Settings, type UserProgress } from '../types/progress'
import { type Card } from '../types/srs'

export const SCHEMA_VERSION = 1
export const APP_VERSION = '0.1.0'
export const DEFAULT_DB_NAME = 'hsk-trainer'

export interface MetaRow {
  key: string
  value: string
}

export class HskDatabase extends Dexie {
  readonly cards!: Table<Card, string>
  readonly events!: Table<JournalEvent, string>
  readonly snapshots!: Table<Snapshot, string>
  readonly userProgress!: Table<UserProgress, string>
  readonly settings!: Table<Settings, string>
  readonly meta!: Table<MetaRow, string>

  constructor(name: string = DEFAULT_DB_NAME) {
    super(name)

    // v1 — schéma initial.
    // Les booléens ne sont pas des clés IndexedDB valides : `suspended` / `leech`
    // ne sont pas indexés, on filtre en mémoire.
    this.version(1).stores({
      cards: '&id, state, due, [state+due], itemType',
      events: '&id, seq, at, kind, cardId, [cardId+seq]',
      snapshots: '&id, createdAt, reason',
      userProgress: '&id',
      settings: '&id',
      meta: '&key',
    })
  }
}

let singleton: HskDatabase | null = null

/** Instance partagée pour l'application. Les tests créent leurs propres instances. */
export function getDb(): HskDatabase {
  singleton ??= new HskDatabase()
  return singleton
}

/** Ferme et oublie l'instance partagée (utile après une restauration/import). */
export function resetDbSingleton(): void {
  singleton?.close()
  singleton = null
}

export const USER_STORES = ['cards', 'events', 'userProgress', 'settings', 'meta'] as const
