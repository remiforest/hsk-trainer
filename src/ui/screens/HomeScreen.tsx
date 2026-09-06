/**
 * Écran d'accueil : point d'entrée quotidien. Résume la journée (série, révisions
 * déjà faites, temps passé), propose la prochaine leçon à acquérir, puis lance
 * la session de révision.
 */

import { useEffect, useState, type JSX } from 'react'
import { type HskDatabase } from '../../db/db'
import { ensureProgress, ensureSettings } from '../../db/repositories/singletons'
import {
  getDayPlan,
  getExtraPlan,
  getTodayStats,
  nextLesson,
  type TodayStats,
} from '../../db/review-session'
import { type DayQueue, type ExtraQueue } from '../../core/srs/queue'
import { type ContentCatalog, type Lesson } from '../../types/content'
import { formatDuration, formatStreak } from '../format'

export interface HomeScreenProps {
  db: HskDatabase
  catalog: ContentCatalog
  now: number
  timeZone?: string
  onStartSession: () => void
  onStartExtra: () => void
  onStartLesson: () => void
  onOpenSettings: () => void
  onOpenBackups: () => void
}

interface HomeData {
  plan: DayQueue
  extra: ExtraQueue
  stats: TodayStats
  streak: number
  lesson: Lesson | null
}

export function HomeScreen({
  db,
  catalog,
  now,
  timeZone,
  onStartSession,
  onStartExtra,
  onStartLesson,
  onOpenSettings,
  onOpenBackups,
}: HomeScreenProps): JSX.Element {
  const [data, setData] = useState<HomeData | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [settings, progress] = await Promise.all([ensureSettings(db), ensureProgress(db)])
      const [plan, extra, stats] = await Promise.all([
        getDayPlan(db, settings, now, timeZone),
        getExtraPlan(db, settings, now, timeZone),
        getTodayStats(db, now, timeZone),
      ])
      if (!cancelled) {
        setData({
          plan,
          extra,
          stats,
          streak: progress.streakDays,
          lesson: nextLesson([...catalog.lessons.values()], progress.completedLessonIds),
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [db, catalog, now, timeZone])

  if (data === null) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <p role="status" className="text-sm opacity-60">
          Chargement…
        </p>
      </main>
    )
  }

  const toReview = data.plan.counts.due
  const fresh = data.plan.fresh.length
  const nothingToDo = toReview + fresh === 0
  const extraCount = data.extra.cards.length

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-8 p-6">
      <header className="flex items-start justify-between gap-2 pt-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">HSK Trainer</h1>
          <p className="text-sm opacity-70">Série : {formatStreak(data.streak)}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onOpenBackups}
            className="rounded-lg border border-current/20 px-3 py-1 text-sm font-medium"
          >
            Sauvegardes
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className="rounded-lg border border-current/20 px-3 py-1 text-sm font-medium"
          >
            Réglages
          </button>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3">
        <Stat label="Révisions aujourd’hui" value={String(data.stats.reviews)} />
        <Stat label="Temps aujourd’hui" value={formatDuration(data.stats.timeMs)} />
        <Stat label="À réviser" value={String(toReview)} />
        <Stat label="Nouvelles cartes" value={String(fresh)} />
      </section>

      {data.lesson !== null && (
        <section className="flex flex-col gap-2 rounded-lg border border-current/15 p-4">
          <span className="text-xs opacity-60">Prochaine leçon · {data.lesson.ordre}</span>
          <span className="font-medium">{data.lesson.titre}</span>
          <button
            type="button"
            onClick={onStartLesson}
            className="mt-1 rounded-lg border border-current/20 px-4 py-2 text-sm font-medium"
          >
            Étudier la leçon
          </button>
        </section>
      )}

      <section className="mt-auto flex flex-col gap-3">
        {nothingToDo ? (
          extraCount > 0 ? (
            <>
              <p className="rounded-lg bg-black/5 p-4 text-center text-sm dark:bg-white/10">
                File du jour terminée. Vous pouvez réviser en avance des cartes déjà vues.
              </p>
              <button
                type="button"
                onClick={onStartExtra}
                className="rounded-lg bg-black px-4 py-3 text-center font-medium text-white dark:bg-white dark:text-black"
              >
                Réviser en plus ({extraCount})
              </button>
            </>
          ) : (
            <p className="rounded-lg bg-black/5 p-4 text-center text-sm dark:bg-white/10">
              {data.extra.counts.doneToday > 0
                ? 'Révisions bonus faites pour aujourd’hui. Revenez plus tard 🎉'
                : 'Rien à réviser pour le moment. Revenez plus tard 🎉'}
            </p>
          )
        ) : (
          <>
            <button
              type="button"
              onClick={onStartSession}
              className="rounded-lg bg-black px-4 py-3 text-center font-medium text-white dark:bg-white dark:text-black"
            >
              Commencer la session ({toReview + fresh})
            </button>
            {extraCount > 0 && (
              <button
                type="button"
                onClick={onStartExtra}
                className="rounded-lg border border-current/20 px-4 py-2 text-center text-sm font-medium"
              >
                Réviser en plus ({extraCount})
              </button>
            )}
          </>
        )}
      </section>
    </main>
  )
}

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-current/15 p-3">
      <span className="text-xs opacity-60">{label}</span>
      <span aria-label={label} className="text-xl font-semibold tabular-nums">
        {value}
      </span>
    </div>
  )
}
