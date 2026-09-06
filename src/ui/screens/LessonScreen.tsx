/**
 * Écran de leçon : présente le vocabulaire et les points de grammaire de la
 * prochaine leçon à acquérir, puis crée les cartes correspondantes
 * (`addLessonCards`, idempotent) et marque la leçon terminée.
 */

import { useEffect, useState, type JSX, type ReactNode } from 'react'
import { ensureProgress, ensureSettings } from '../../db/repositories/singletons'
import { addLessonCards, nextLesson } from '../../db/review-session'
import { type HskDatabase } from '../../db/db'
import {
  type ContentCatalog,
  type Example,
  type GrammarPoint,
  type Lesson,
  type Word,
} from '../../types/content'
import { speak } from '../speak'

export interface LessonScreenProps {
  db: HskDatabase
  catalog: ContentCatalog
  now: number
  onDone: () => void
}

function Centered({ children }: { children: ReactNode }): JSX.Element {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      {children}
    </main>
  )
}

export function LessonScreen({ db, catalog, now, onDone }: LessonScreenProps): JSX.Element {
  const [status, setStatus] = useState<'loading' | 'ready' | 'none'>('loading')
  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [audioHint, setAudioHint] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [progress, settings] = await Promise.all([ensureProgress(db), ensureSettings(db)])
      if (cancelled) {
        return
      }
      setAudioEnabled(settings.audioEnabled)
      const next = nextLesson([...catalog.lessons.values()], progress.completedLessonIds)
      setLesson(next)
      setStatus(next ? 'ready' : 'none')
    })()
    return () => {
      cancelled = true
    }
  }, [db, catalog])

  const play = (hanzi: string): void => {
    const outcome = speak(hanzi)
    setAudioHint(
      outcome === 'unsupported'
        ? 'Synthèse vocale indisponible dans ce navigateur.'
        : outcome === 'no-chinese-voice'
          ? 'Aucune voix chinoise installée sur le système.'
          : outcome === 'error'
            ? 'Lecture audio impossible.'
            : null,
    )
  }

  if (status === 'loading') {
    return (
      <Centered>
        <p role="status" className="text-sm opacity-60">
          Chargement…
        </p>
      </Centered>
    )
  }

  if (status === 'none' || lesson === null) {
    return (
      <Centered>
        <p>Toutes les leçons sont terminées 🎉</p>
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-current/20 px-4 py-2 text-sm font-medium"
        >
          Retour à l’accueil
        </button>
      </Centered>
    )
  }

  const words = lesson.wordIds
    .map((id) => catalog.words.get(id))
    .filter((w): w is Word => w !== undefined)
  const points = lesson.grammarPointIds
    .map((id) => catalog.grammarPoints.get(id))
    .filter((g): g is GrammarPoint => g !== undefined)

  const study = (): void => {
    setBusy(true)
    setError(null)
    void (async () => {
      try {
        await addLessonCards(db, lesson, catalog, { now })
        onDone()
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        setBusy(false)
      }
    })()
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 p-6">
      <header className="flex flex-col gap-1 pt-4">
        <span className="text-xs opacity-60">Leçon {lesson.ordre}</span>
        <h1 className="text-2xl font-semibold">{lesson.titre}</h1>
        <p className="text-sm opacity-70">{lesson.objectif}</p>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium opacity-70">Vocabulaire ({words.length})</h2>
        {audioHint !== null && <p className="text-xs opacity-70">{audioHint}</p>}
        <ul className="flex flex-col divide-y divide-current/10">
          {words.map((w) => (
            <li key={w.id} className="flex items-center gap-3 py-2">
              {audioEnabled && (
                <button
                  type="button"
                  onClick={() => play(w.hanzi)}
                  aria-label={`Écouter ${w.hanzi}`}
                  className="shrink-0 rounded-full border border-current/20 px-2 py-1 text-sm"
                >
                  🔊
                </button>
              )}
              <span className="text-lg" lang="zh-CN" style={{ fontFamily: 'var(--font-hanzi)' }}>
                {w.hanzi}
              </span>
              <span className="text-sm opacity-60" lang="zh-CN">
                {w.pinyin}
              </span>
              <span className="flex-1 text-right text-sm">{w.fr}</span>
            </li>
          ))}
        </ul>
      </section>

      {points.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium opacity-70">Grammaire ({points.length})</h2>
          {points.map((g) => (
            <GrammarCard key={g.id} point={g} audioEnabled={audioEnabled} onSpeak={play} />
          ))}
        </section>
      )}

      {error !== null && (
        <p
          role="alert"
          className="rounded bg-red-500/10 p-2 text-sm text-red-700 dark:text-red-300"
        >
          {error}
        </p>
      )}

      <div className="mt-auto flex flex-col gap-2">
        <button
          type="button"
          onClick={study}
          disabled={busy}
          className="rounded-lg bg-black px-4 py-3 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {busy ? 'Création des cartes…' : 'J’ai étudié — créer les cartes'}
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={busy}
          className="rounded-lg border border-current/20 px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          Plus tard
        </button>
      </div>
    </main>
  )
}

function GrammarCard({
  point,
  audioEnabled,
  onSpeak,
}: {
  point: GrammarPoint
  audioEnabled: boolean
  onSpeak: (text: string) => void
}): JSX.Element {
  const example: Example | undefined = point.exemples[0]
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-current/15 p-3">
      <span className="font-medium">{point.titre}</span>
      <span className="font-mono text-sm opacity-80" lang="zh-CN">
        {point.structure}
      </span>
      <span className="text-sm opacity-90">{point.explicationFr}</span>
      {example && <ExampleLine example={example} audioEnabled={audioEnabled} onSpeak={onSpeak} />}
    </div>
  )
}

function ExampleLine({
  example,
  audioEnabled,
  onSpeak,
}: {
  example: Example
  audioEnabled: boolean
  onSpeak: (text: string) => void
}): JSX.Element {
  return (
    <span className="flex items-center gap-2 text-sm opacity-70">
      {audioEnabled && (
        <button
          type="button"
          onClick={() => onSpeak(example.hanzi)}
          aria-label={`Écouter ${example.hanzi}`}
          className="shrink-0 rounded-full border border-current/20 px-1.5 text-xs"
        >
          🔊
        </button>
      )}
      <span>
        <span lang="zh-CN">{example.hanzi}</span> — {example.fr}
      </span>
    </span>
  )
}
