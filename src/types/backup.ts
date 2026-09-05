/**
 * Sauvegardes : snapshots internes (IndexedDB) et bundles d'export/import
 * (fichier JSON téléchargé par l'utilisateur).
 */

import { type JournalEvent } from './events'
import { type Settings, type UserProgress } from './progress'
import { type Card } from './srs'

/** Contenu utilisateur d'une sauvegarde, indépendant du contenu pédagogique. */
export interface UserDataDump {
  cards: Card[]
  events: JournalEvent[]
  userProgress: UserProgress
  settings: Settings
  /** paires clé/valeur internes (version des paramètres FSRS, identifiant d'installation…) */
  meta: Record<string, string>
}

export type SnapshotReason =
  | 'auto' // snapshot automatique quotidien
  | 'manual' // déclenché par l'utilisateur
  | 'pre-migration' // avant une migration de schéma
  | 'pre-restore' // avant restauration d'un autre snapshot
  | 'pre-import' // avant application d'un import

export interface SnapshotCounts {
  cards: number
  events: number
  completedLessons: number
}

/** Métadonnées d'un snapshot, sans la charge utile (pour les listes). */
export interface SnapshotMeta {
  id: string
  createdAt: number
  reason: SnapshotReason
  schemaVersion: number
  appVersion: string
  contentVersion: string
  counts: SnapshotCounts
}

export interface Snapshot extends SnapshotMeta {
  payload: UserDataDump
}

export const EXPORT_FORMAT = 'hsk-trainer-export' as const
export const EXPORT_VERSION = 1 as const

export interface ExportBundle {
  format: typeof EXPORT_FORMAT
  version: number
  exportedAt: number
  schemaVersion: number
  appVersion: string
  contentVersion: string
  data: UserDataDump
}

/** Aperçu affiché avant d'appliquer un import. */
export interface ImportPreview {
  cardCount: number
  eventCount: number
  completedLessons: number
  lastActivityAt: number | null
  streakDays: number
  totalReviews: number
  schemaVersion: number
  appVersion: string
  contentVersion: string
  /** le contenu pédagogique du bundle correspond-il à celui de l'app en cours ? */
  contentMatchesCurrent: boolean
}
