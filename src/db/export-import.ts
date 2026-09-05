/**
 * Export / import manuel de la progression.
 *
 * Export : bundle JSON versionné (`hsk-trainer-export`).
 * Import : validation stricte (format + version + schéma Zod), aperçu, puis
 * application qui commence par un snapshot `pre-import`.
 */

import { type ZodError } from 'zod'
import { APP_VERSION, SCHEMA_VERSION, type HskDatabase } from './db'
import { exportBundleSchema } from './schemas'
import { createSnapshot } from './snapshots'
import { dumpUserData, writeUserData } from './user-data'
import {
  EXPORT_FORMAT,
  EXPORT_VERSION,
  type ExportBundle,
  type ImportPreview,
  type UserDataDump,
} from '../types/backup'

export function buildExportBundle(
  data: UserDataDump,
  opts: { now: number; contentVersion?: string },
): ExportBundle {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: opts.now,
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    contentVersion: opts.contentVersion ?? 'unknown',
    data,
  }
}

export async function exportProgress(
  db: HskDatabase,
  opts: { now: number; contentVersion?: string },
): Promise<ExportBundle> {
  return buildExportBundle(await dumpUserData(db), opts)
}

export function serializeBundle(bundle: ExportBundle): string {
  return JSON.stringify(bundle, null, 2)
}

export type ParseResult = { ok: true; bundle: ExportBundle } | { ok: false; errors: string[] }

/** Valide un contenu (chaîne JSON ou objet déjà parsé) comme bundle d'export. */
export function parseBundle(input: unknown): ParseResult {
  let raw: unknown = input
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input)
    } catch {
      return { ok: false, errors: ['Fichier illisible : JSON invalide.'] }
    }
  }

  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, errors: ['Le fichier ne contient pas un objet JSON.'] }
  }

  const format = (raw as Record<string, unknown>)['format']
  if (format !== EXPORT_FORMAT) {
    return {
      ok: false,
      errors: [`Format inattendu : « ${String(format)} » (attendu « ${EXPORT_FORMAT} »).`],
    }
  }

  const version = (raw as Record<string, unknown>)['version']
  if (version !== EXPORT_VERSION) {
    return {
      ok: false,
      errors: [
        `Version de bundle non prise en charge : ${String(version)} (cette app lit la version ${EXPORT_VERSION}).`,
      ],
    }
  }

  const parsed = exportBundleSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, errors: formatZodErrors(parsed.error) }
  }
  return { ok: true, bundle: parsed.data as ExportBundle }
}

function formatZodErrors(error: ZodError): string[] {
  return error.issues.slice(0, 20).map((i) => {
    const path = i.path.join('.') || '(racine)'
    return `${path} : ${i.message}`
  })
}

export function previewBundle(
  bundle: ExportBundle,
  opts: { currentContentVersion?: string } = {},
): ImportPreview {
  const { data } = bundle
  const lastActivityAt = data.events.reduce<number | null>(
    (max, e) => (max === null || e.at > max ? e.at : max),
    null,
  )
  return {
    cardCount: data.cards.length,
    eventCount: data.events.length,
    completedLessons: data.userProgress.completedLessonIds.length,
    lastActivityAt,
    streakDays: data.userProgress.streakDays,
    totalReviews: data.userProgress.totalReviews,
    schemaVersion: bundle.schemaVersion,
    appVersion: bundle.appVersion,
    contentVersion: bundle.contentVersion,
    contentMatchesCurrent:
      opts.currentContentVersion !== undefined &&
      opts.currentContentVersion === bundle.contentVersion,
  }
}

/**
 * Applique un bundle validé : snapshot `pre-import` puis remplacement intégral
 * des données utilisateur.
 */
export async function importBundle(
  db: HskDatabase,
  bundle: ExportBundle,
  opts: { now: number; contentVersion?: string },
): Promise<void> {
  await createSnapshot(db, 'pre-import', opts)
  await writeUserData(db, bundle.data)
}
