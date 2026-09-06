/**
 * Écran de récupération : affiché quand le contrôle d'intégrité au démarrage
 * trouve des erreurs. Objectif — ne jamais perdre la progression : on montre le
 * diagnostic, on propose une sauvegarde de secours, puis deux réparations
 * possibles (recalcul depuis le journal append-only, ou restauration d'un
 * snapshot). Aucune écriture tant que l'utilisateur n'a pas choisi.
 */

import { useState, type JSX } from 'react'
import { type HskDatabase } from '../../db/db'
import { exportProgress, serializeBundle } from '../../db/export-import'
import { rebuildCardsAndPersist } from '../../db/recover'
import { restoreSnapshot } from '../../db/snapshots'
import { CONTENT_VERSION } from '../../data'
import { type SnapshotMeta } from '../../types/backup'
import { type IntegrityReport } from '../../types/integrity'
import { formatDuration } from '../format'

export interface RecoveryScreenProps {
  db: HskDatabase
  report: IntegrityReport
  snapshots: SnapshotMeta[]
  now: number
  timeZone?: string
  /** relance la séquence de démarrage après une réparation réussie */
  onRecovered: () => void
}

function snapshotOpts(
  now: number,
  timeZone: string | undefined,
): Parameters<typeof restoreSnapshot>[2] {
  return {
    now,
    contentVersion: CONTENT_VERSION,
    ...(timeZone !== undefined ? { timeZone } : {}),
  }
}

export function RecoveryScreen({
  db,
  report,
  snapshots,
  now,
  timeZone,
  onRecovered,
}: RecoveryScreenProps): JSX.Element {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const errors = report.problems.filter((p) => p.severity === 'error')

  const run = (label: string, action: () => Promise<void>) => async (): Promise<void> => {
    setError(null)
    setBusy(label)
    try {
      await action()
      onRecovered()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(null)
    }
  }

  const downloadBackup = async (): Promise<void> => {
    setError(null)
    setBusy('backup')
    try {
      const bundle = await exportProgress(db, { now, contentVersion: CONTENT_VERSION })
      const blob = new Blob([serializeBundle(bundle)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `hsk-trainer-secours-${new Date(now).toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Vos données ont besoin d’une réparation</h1>
        <p className="text-sm opacity-80">
          Rien n’a été supprimé. Le journal de vos révisions est intact — l’état des cartes peut
          être recalculé à partir de lui.
        </p>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium opacity-70">Diagnostic</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {errors.map((p, i) => (
            <li key={i} className="rounded bg-black/5 p-2 dark:bg-white/10">
              {p.message}
            </li>
          ))}
        </ul>
      </section>

      {error !== null && (
        <p
          role="alert"
          className="rounded bg-red-500/10 p-2 text-sm text-red-700 dark:text-red-300"
        >
          {error}
        </p>
      )}

      <section className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => void downloadBackup()}
          disabled={busy !== null}
          className="rounded-lg border border-current/20 px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {busy === 'backup' ? 'Préparation…' : 'Télécharger une sauvegarde de secours'}
        </button>

        <button
          type="button"
          onClick={() =>
            void run('rebuild', () => rebuildCardsAndPersist(db).then(() => undefined))()
          }
          disabled={busy !== null}
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {busy === 'rebuild' ? 'Recalcul…' : 'Recalculer l’état des cartes depuis le journal'}
        </button>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium opacity-70">
          Ou restaurer une sauvegarde ({snapshots.length})
        </h2>
        {snapshots.length === 0 ? (
          <p className="text-sm opacity-60">Aucune sauvegarde interne disponible.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {[...snapshots]
              .sort((a, b) => b.createdAt - a.createdAt)
              .map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-2 rounded border border-current/15 p-2 text-sm"
                >
                  <span className="opacity-80">
                    {new Date(s.createdAt).toLocaleString()} · {s.counts.events} événements ·{' '}
                    {formatSnapshotAge(s.createdAt, now)}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      void run(`restore:${s.id}`, () =>
                        restoreSnapshot(db, s.id, snapshotOpts(now, timeZone)),
                      )()
                    }
                    disabled={busy !== null}
                    className="shrink-0 rounded border border-current/20 px-2 py-1 disabled:opacity-50"
                  >
                    {busy === `restore:${s.id}` ? '…' : 'Restaurer'}
                  </button>
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
  if (days >= 1) {
    return `il y a ${days} j`
  }
  return `il y a ${formatDuration(ageMs)}`
}
