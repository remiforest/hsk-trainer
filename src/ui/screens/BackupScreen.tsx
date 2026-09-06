/**
 * Écran des sauvegardes — dernière garantie de sûreté du cahier des charges.
 *
 *  - export : télécharge un bundle JSON de toutes les données utilisateur ;
 *  - import : valide un fichier, montre un aperçu, puis remplace intégralement
 *    les données (un snapshot `pre-import` est pris automatiquement) ;
 *  - snapshots internes : liste, création manuelle, restauration, suppression.
 *
 * Toute opération qui remplace les données appelle `onDataReplaced`, ce qui
 * relance la séquence de démarrage (et donc le contrôle d'intégrité).
 */

import { useEffect, useState, type ChangeEvent, type JSX } from 'react'
import {
  exportProgress,
  importBundle,
  parseBundle,
  previewBundle,
  serializeBundle,
} from '../../db/export-import'
import { createSnapshot, deleteSnapshot, listSnapshots, restoreSnapshot } from '../../db/snapshots'
import { type HskDatabase } from '../../db/db'
import { CONTENT_VERSION } from '../../data'
import {
  type ExportBundle,
  type ImportPreview,
  type SnapshotMeta,
  type SnapshotReason,
} from '../../types/backup'
import { downloadText } from '../download'
import { formatDuration } from '../format'

export interface BackupScreenProps {
  db: HskDatabase
  now: number
  timeZone?: string
  onDone: () => void
  /** appelé quand les données ont été intégralement remplacées (import / restauration) */
  onDataReplaced: () => void
}

const REASON_LABEL: Record<SnapshotReason, string> = {
  auto: 'Automatique',
  manual: 'Manuelle',
  'pre-migration': 'Avant migration',
  'pre-restore': 'Avant restauration',
  'pre-import': 'Avant import',
}

interface PendingImport {
  bundle: ExportBundle
  preview: ImportPreview
}

export function BackupScreen({
  db,
  now,
  timeZone,
  onDone,
  onDataReplaced,
}: BackupScreenProps): JSX.Element {
  const [snapshots, setSnapshots] = useState<SnapshotMeta[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [importErrors, setImportErrors] = useState<string[] | null>(null)
  const [pending, setPending] = useState<PendingImport | null>(null)

  const snapshotOpts = {
    now,
    contentVersion: CONTENT_VERSION,
    ...(timeZone !== undefined ? { timeZone } : {}),
  }

  const refresh = (): void => {
    void listSnapshots(db).then(setSnapshots)
  }

  useEffect(() => {
    let cancelled = false
    void listSnapshots(db).then((s) => {
      if (!cancelled) {
        setSnapshots(s)
      }
    })
    return () => {
      cancelled = true
    }
  }, [db])

  const withBusy = (label: string, action: () => Promise<void>) => (): void => {
    setBusy(label)
    setError(null)
    void action()
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        setBusy(null)
      })
  }

  const exportNow = withBusy('export', async () => {
    const bundle = await exportProgress(db, { now, contentVersion: CONTENT_VERSION })
    const stamp = new Date(now).toISOString().slice(0, 10)
    downloadText(`hsk-trainer-${stamp}.json`, serializeBundle(bundle))
  })

  const snapshotNow = withBusy('snapshot', async () => {
    await createSnapshot(db, 'manual', snapshotOpts)
    refresh()
  })

  const onFileChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) {
      return
    }
    setError(null)
    setImportErrors(null)
    setPending(null)
    setBusy('read')
    void file
      .text()
      .then((text) => {
        const result = parseBundle(text)
        if (!result.ok) {
          setImportErrors(result.errors)
          return
        }
        setPending({
          bundle: result.bundle,
          preview: previewBundle(result.bundle, { currentContentVersion: CONTENT_VERSION }),
        })
      })
      .catch((err: unknown) => {
        setImportErrors([err instanceof Error ? err.message : String(err)])
      })
      .finally(() => {
        setBusy(null)
      })
  }

  const confirmImport = withBusy('import', async () => {
    if (!pending) {
      return
    }
    await importBundle(db, pending.bundle, { now, contentVersion: CONTENT_VERSION })
    setPending(null)
    onDataReplaced()
  })

  const restore = (id: string): (() => void) =>
    withBusy(`restore:${id}`, async () => {
      await restoreSnapshot(db, id, snapshotOpts)
      onDataReplaced()
    })

  const remove = (id: string): (() => void) =>
    withBusy(`delete:${id}`, async () => {
      await deleteSnapshot(db, id)
      refresh()
    })

  const anyBusy = busy !== null

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-8 p-6">
      <header className="flex items-center justify-between gap-2 pt-4">
        <h1 className="text-2xl font-semibold">Sauvegardes</h1>
        <button
          type="button"
          onClick={onDone}
          disabled={anyBusy}
          className="rounded-lg border border-current/20 px-3 py-1 text-sm font-medium disabled:opacity-50"
        >
          Retour
        </button>
      </header>

      {error !== null && (
        <p
          role="alert"
          className="rounded bg-red-500/10 p-2 text-sm text-red-700 dark:text-red-300"
        >
          {error}
        </p>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium opacity-70">Fichier</h2>
        <button
          type="button"
          onClick={exportNow}
          disabled={anyBusy}
          className="rounded-lg bg-black px-4 py-3 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {busy === 'export' ? 'Préparation…' : 'Télécharger une sauvegarde'}
        </button>

        <label className="flex flex-col gap-1 text-sm">
          <span className="opacity-70">Importer une sauvegarde</span>
          <input
            type="file"
            accept="application/json,.json"
            onChange={onFileChange}
            disabled={anyBusy}
            className="text-sm file:mr-3 file:rounded-lg file:border file:border-current/20 file:bg-transparent file:px-3 file:py-1"
          />
        </label>

        {importErrors !== null && (
          <div
            role="alert"
            className="flex flex-col gap-1 rounded bg-red-500/10 p-2 text-sm text-red-700 dark:text-red-300"
          >
            <span className="font-medium">Fichier refusé :</span>
            {importErrors.map((msg, i) => (
              <span key={i}>{msg}</span>
            ))}
          </div>
        )}

        {pending !== null && (
          <div className="flex flex-col gap-2 rounded-lg border border-current/20 p-3 text-sm">
            <span className="font-medium">Confirmer l’import</span>
            <p className="opacity-80">
              {pending.preview.cardCount} cartes · {pending.preview.eventCount} événements ·{' '}
              {pending.preview.completedLessons} leçons · série {pending.preview.streakDays} j
            </p>
            <p className="opacity-70">
              Dernière activité :{' '}
              {pending.preview.lastActivityAt !== null
                ? new Date(pending.preview.lastActivityAt).toLocaleDateString()
                : '—'}
            </p>
            {!pending.preview.contentMatchesCurrent && (
              <p className="text-amber-700 dark:text-amber-400">
                Contenu pédagogique différent ({pending.preview.contentVersion}).
              </p>
            )}
            <p className="text-red-700 dark:text-red-300">
              Cela remplace toutes vos données actuelles. Une sauvegarde « avant import » est créée
              automatiquement.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={confirmImport}
                disabled={anyBusy}
                className="rounded-lg bg-black px-4 py-2 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
              >
                {busy === 'import' ? 'Import…' : 'Importer et remplacer'}
              </button>
              <button
                type="button"
                onClick={() => setPending(null)}
                disabled={anyBusy}
                className="rounded-lg border border-current/20 px-4 py-2 disabled:opacity-50"
              >
                Annuler
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium opacity-70">
            Sauvegardes internes ({snapshots?.length ?? 0})
          </h2>
          <button
            type="button"
            onClick={snapshotNow}
            disabled={anyBusy}
            className="rounded-lg border border-current/20 px-3 py-1 text-sm disabled:opacity-50"
          >
            {busy === 'snapshot' ? '…' : 'Créer maintenant'}
          </button>
        </div>

        {snapshots === null ? (
          <p role="status" className="text-sm opacity-60">
            Chargement…
          </p>
        ) : snapshots.length === 0 ? (
          <p className="text-sm opacity-60">Aucune sauvegarde interne pour le moment.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {snapshots.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-current/15 p-2 text-sm"
              >
                <span className="flex flex-col">
                  <span>{new Date(s.createdAt).toLocaleString()}</span>
                  <span className="opacity-60">
                    {REASON_LABEL[s.reason]} · {s.counts.events} événements ·{' '}
                    {formatSnapshotAge(s.createdAt, now)}
                  </span>
                </span>
                <span className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={restore(s.id)}
                    disabled={anyBusy}
                    className="rounded border border-current/20 px-2 py-1 disabled:opacity-50"
                  >
                    {busy === `restore:${s.id}` ? '…' : 'Restaurer'}
                  </button>
                  <button
                    type="button"
                    onClick={remove(s.id)}
                    disabled={anyBusy}
                    aria-label={`Supprimer la sauvegarde du ${new Date(s.createdAt).toLocaleString()}`}
                    className="rounded border border-current/20 px-2 py-1 opacity-70 disabled:opacity-50"
                  >
                    ✕
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

function formatSnapshotAge(createdAt: number, now: number): string {
  const ageMs = Math.max(0, now - createdAt)
  const days = Math.floor(ageMs / 86_400_000)
  return days >= 1 ? `il y a ${days} j` : `il y a ${formatDuration(ageMs)}`
}
