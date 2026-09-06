/**
 * Écran d'accueil : point d'entrée quotidien. Résume la journée (série, révisions
 * déjà faites, temps passé) et ce qu'il reste à faire, puis lance la session.
 */

import { useEffect, useState, type JSX } from 'react'
import { type HskDatabase } from '../../db/db'
import { ensureProgress, ensureSettings } from '../../db/repositories/singletons'
import { getDayPlan, getTodayStats, type TodayStats } from '../../db/review-session'
import { type DayQueue } from '../../core/srs/queue'
import { formatDuration, formatStreak } from '../format'

export interface HomeScreenProps {
  db: HskDatabase
  now: number
  timeZone?: string
  onStartSession: () => void
}

interface HomeData {
  plan: DayQueue
  stats: TodayStats
  streak: number
}

export function HomeScreen({ db, now, timeZone, onStartSession }: HomeScreenProps): JSX.Element {
  const [data, setData] = useState<HomeData | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [settings, progress] = await Promise.all([ensureSettings(db), ensureProgress(db)])
      const [plan, stats] = await Promise.all([
        getDayPlan(db, settings, now, timeZone),
        getTodayStats(db, now, timeZone),
      ])
      if (!cancelled) {
        setData({ plan, stats, streak: progress.streakDays })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [db, now, timeZone])

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

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-8 p-6">
      <header className="flex flex-col gap-1 pt-4">
        <h1 className="text-2xl font-semibold">HSK Trainer</h1>
        <p className="text-sm opacity-70">Série : {formatStreak(data.streak)}</p>
      </header>

      <section className="grid grid-cols-2 gap-3">
        <Stat label="Révisions aujourd’hui" value={String(data.stats.reviews)} />
        <Stat label="Temps aujourd’hui" value={formatDuration(data.stats.timeMs)} />
        <Stat label="À réviser" value={String(toReview)} />
        <Stat label="Nouvelles cartes" value={String(fresh)} />
      </section>

      <section className="mt-auto flex flex-col gap-3">
        {nothingToDo ? (
          <p className="rounded-lg bg-black/5 p-4 text-center text-sm dark:bg-white/10">
            Rien à réviser pour le moment. Revenez plus tard 🎉
          </p>
        ) : (
          <button
            type="button"
            onClick={onStartSession}
            className="rounded-lg bg-black px-4 py-3 text-center font-medium text-white dark:bg-white dark:text-black"
          >
            Commencer la session ({toReview + fresh})
          </button>
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
