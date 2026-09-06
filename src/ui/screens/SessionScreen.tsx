/**
 * Boucle de révision. Charge la file du jour, puis déroule les cartes via
 * `useSession` : exercice → (choix / saisie / révélation) → note → carte
 * suivante, jusqu'au résumé.
 */

import { useEffect, useState, type JSX, type ReactNode } from 'react'
import { comparePinyin } from '../../core/pinyin/compare'
import { PinyinParseError } from '../../core/pinyin/normalize'
import { type ChoiceQuestion, type PinyinQuestion } from '../../core/cards/quiz'
import { type SessionEndReason, type SessionSummary } from '../../core/srs/session'
import { type DayQueue } from '../../core/srs/queue'
import { getDayPlan } from '../../db/review-session'
import { ensureSettings } from '../../db/repositories/singletons'
import { type HskDatabase } from '../../db/db'
import { type ContentCatalog } from '../../types/content'
import { type Settings } from '../../types/progress'
import { type Rating } from '../../types/srs'
import { formatDuration } from '../format'
import { speak } from '../speak'
import { type RevealPrompt } from '../session/exercise'
import { useSession, type SessionPhase } from '../session/useSession'

export interface SessionScreenProps {
  db: HskDatabase
  catalog: ContentCatalog
  timeZone?: string
  /** injectés pour les tests */
  clock?: () => number
  rng?: () => number
  onFinish: () => void
}

const RATING_LABEL: Record<Rating, string> = {
  again: 'Encore',
  hard: 'Difficile',
  good: 'Bien',
  easy: 'Facile',
}

const END_REASON_LABEL: Record<SessionEndReason, string> = {
  'queue-empty': 'File terminée',
  'objective-reached': 'Objectif atteint',
  stopped: 'Session interrompue',
}

function Centered({ children }: { children: ReactNode }): JSX.Element {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      {children}
    </main>
  )
}

export function SessionScreen({
  db,
  catalog,
  timeZone,
  clock = Date.now,
  rng = Math.random,
  onFinish,
}: SessionScreenProps): JSX.Element {
  const [loaded, setLoaded] = useState<{ plan: DayQueue; settings: Settings } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const settings = await ensureSettings(db)
        const plan = await getDayPlan(db, settings, clock(), timeZone)
        if (!cancelled) {
          setLoaded({ plan, settings })
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : String(err))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [db, timeZone, clock])

  if (loadError !== null) {
    return (
      <Centered>
        <p role="alert" className="text-sm opacity-80">
          {loadError}
        </p>
        <BackButton onFinish={onFinish} />
      </Centered>
    )
  }
  if (loaded === null) {
    return (
      <Centered>
        <p role="status" className="text-sm opacity-60">
          Préparation de la session…
        </p>
      </Centered>
    )
  }
  return (
    <SessionRunner
      db={db}
      catalog={catalog}
      plan={loaded.plan}
      settings={loaded.settings}
      {...(timeZone !== undefined ? { timeZone } : {})}
      clock={clock}
      rng={rng}
      onFinish={onFinish}
    />
  )
}

interface RunnerProps {
  db: HskDatabase
  catalog: ContentCatalog
  plan: DayQueue
  settings: Settings
  timeZone?: string
  clock: () => number
  rng: () => number
  onFinish: () => void
}

function SessionRunner({
  db,
  catalog,
  plan,
  settings,
  timeZone,
  clock,
  rng,
  onFinish,
}: RunnerProps): JSX.Element {
  const s = useSession({
    db,
    catalog,
    plan,
    settings,
    ...(timeZone !== undefined ? { timeZone } : {}),
    clock,
    rng,
  })

  if (s.summary !== null) {
    return <SummaryView summary={s.summary} onFinish={onFinish} />
  }
  if (s.exercise === null) {
    return (
      <Centered>
        <p role="status">Session terminée.</p>
        <BackButton onFinish={onFinish} />
      </Centered>
    )
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 p-4">
      <ProgressHeader done={s.progress.done} total={s.progress.total} onStop={s.stop} />

      <section className="flex flex-1 flex-col justify-center gap-6">
        {s.exercise.kind === 'choice' && (
          <ChoiceExercise question={s.exercise.question} phase={s.phase} onPick={s.submitChoice} />
        )}
        {s.exercise.kind === 'pinyin' && (
          <PinyinExercise
            question={s.exercise.question}
            phase={s.phase}
            onSubmit={s.submitPinyin}
          />
        )}
        {s.exercise.kind === 'reveal' && (
          <RevealExercise
            prompt={s.exercise.prompt}
            phase={s.phase}
            audioEnabled={settings.audioEnabled}
            onReveal={s.reveal}
          />
        )}
      </section>

      {s.error !== null && (
        <p
          role="alert"
          className="rounded bg-red-500/10 p-2 text-sm text-red-700 dark:text-red-300"
        >
          {s.error} — vous pouvez renoter la carte.
        </p>
      )}

      {s.phase.kind === 'graded' && (
        <RatingBar correct={s.phase.correct} disabled={s.persisting} onGrade={s.grade} />
      )}
    </main>
  )
}

function ProgressHeader({
  done,
  total,
  onStop,
}: {
  done: number
  total: number
  onStop: () => void
}): JSX.Element {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <header className="flex items-center gap-3">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
        <div
          className="h-full bg-black transition-[width] dark:bg-white"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={done}
          aria-valuemin={0}
          aria-valuemax={total}
        />
      </div>
      <span className="text-xs tabular-nums opacity-60">
        {done}/{total}
      </span>
      <button
        type="button"
        onClick={onStop}
        className="text-xs font-medium underline opacity-70 hover:opacity-100"
      >
        Terminer
      </button>
    </header>
  )
}

function Prompt({ children, lang }: { children: ReactNode; lang?: string }): JSX.Element {
  return (
    <p
      className="text-center text-4xl font-semibold"
      {...(lang !== undefined ? { lang } : {})}
      style={lang === 'zh-CN' ? { fontFamily: 'var(--font-hanzi)' } : undefined}
    >
      {children}
    </p>
  )
}

function ChoiceExercise({
  question,
  phase,
  onPick,
}: {
  question: ChoiceQuestion
  phase: SessionPhase
  onPick: (id: string) => void
}): JSX.Element {
  const graded = phase.kind === 'graded'
  const picked = phase.kind === 'graded' ? phase.picked : null
  return (
    <div className="flex flex-col gap-6">
      {question.promptKind === 'hanzi' ? (
        <Prompt lang="zh-CN">{question.promptHanzi}</Prompt>
      ) : (
        <Prompt>{question.promptSense}</Prompt>
      )}
      <div className="grid gap-3">
        {question.options.map((o) => {
          const isCorrect = o.id === question.correctId
          const tone = !graded
            ? 'border-current/20'
            : isCorrect
              ? 'border-green-600 bg-green-500/10'
              : o.id === picked
                ? 'border-red-600 bg-red-500/10'
                : 'border-current/10 opacity-50'
          return (
            <button
              key={o.id}
              type="button"
              disabled={graded}
              onClick={() => onPick(o.id)}
              className={`rounded-lg border px-4 py-3 text-lg ${tone}`}
              {...(o.lang === 'zh' ? { lang: 'zh-CN' } : {})}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function PinyinExercise({
  question,
  phase,
  onSubmit,
}: {
  question: PinyinQuestion
  phase: SessionPhase
  onSubmit: (correct: boolean) => void
}): JSX.Element {
  const [value, setValue] = useState('')
  const [verdict, setVerdict] = useState<'correct' | 'missing-tone' | 'wrong' | null>(null)
  const graded = phase.kind === 'graded'

  const check = (): void => {
    if (graded) {
      return
    }
    try {
      const cmp = comparePinyin(value, question.referencePinyin)
      setVerdict(cmp.correct ? 'correct' : cmp.missingTone ? 'missing-tone' : 'wrong')
      onSubmit(cmp.correct)
    } catch (err) {
      if (err instanceof PinyinParseError) {
        setVerdict('wrong')
        onSubmit(false)
        return
      }
      throw err
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Prompt lang="zh-CN">{question.hanzi}</Prompt>
      <p className="text-center text-sm opacity-60">{question.sense}</p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          check()
        }}
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={graded}
          placeholder="ni3 hao3"
          aria-label="Réponse en pinyin"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          className="flex-1 rounded-lg border border-current/20 px-3 py-2 text-lg"
        />
        {!graded && (
          <button
            type="submit"
            className="rounded-lg bg-black px-4 text-sm font-medium text-white dark:bg-white dark:text-black"
          >
            Vérifier
          </button>
        )}
      </form>
      {graded && (
        <div className="text-center text-sm">
          <p
            className={
              verdict === 'correct'
                ? 'text-green-700 dark:text-green-300'
                : 'text-red-700 dark:text-red-300'
            }
          >
            {verdict === 'correct'
              ? '✓ Correct'
              : verdict === 'missing-tone'
                ? 'Ton manquant'
                : '✗ Incorrect'}
          </p>
          <p className="opacity-70">
            Réponse : <span lang="zh-CN">{question.referencePinyin}</span>
          </p>
        </div>
      )}
    </div>
  )
}

function Examples({
  list,
  audioEnabled,
  onSpeak,
}: {
  list: RevealPrompt['examples']
  audioEnabled: boolean
  onSpeak: (text: string) => void
}): JSX.Element | null {
  if (list.length === 0) {
    return null
  }
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {list.slice(0, 2).map((ex, i) => (
        <li key={i} className="flex items-start gap-2 rounded bg-black/5 p-2 dark:bg-white/10">
          {audioEnabled && (
            <button
              type="button"
              onClick={() => onSpeak(ex.hanzi)}
              aria-label={`Écouter ${ex.hanzi}`}
              className="shrink-0 rounded-full border border-current/20 px-1.5 text-xs"
            >
              🔊
            </button>
          )}
          <span className="flex-1">
            <span lang="zh-CN">{ex.hanzi}</span> <span className="opacity-60">{ex.pinyin}</span>
            <br />
            <span className="opacity-80">{ex.fr}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

function RevealExercise({
  prompt,
  phase,
  audioEnabled,
  onReveal,
}: {
  prompt: RevealPrompt
  phase: SessionPhase
  audioEnabled: boolean
  onReveal: () => void
}): JSX.Element {
  const revealed = phase.kind === 'graded'
  const isAudio = prompt.kind === 'word' && prompt.promptKind === 'audio'
  const [audioHint, setAudioHint] = useState<string | null>(null)

  // Pas de lecture automatique : les navigateurs la bloquent hors geste
  // utilisateur, ce qui peut aussi bloquer les lectures suivantes. L'utilisateur
  // déclenche l'audio explicitement.
  const play = (hanzi: string): void => {
    const outcome = speak(hanzi)
    setAudioHint(
      outcome === 'unsupported'
        ? 'Synthèse vocale indisponible dans ce navigateur.'
        : outcome === 'no-chinese-voice'
          ? 'Aucune voix chinoise installée sur le système — le son peut manquer ou être incorrect.'
          : outcome === 'error'
            ? 'Lecture audio impossible.'
            : null,
    )
  }

  if (prompt.kind === 'grammar') {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-center text-xl font-semibold">{prompt.titre}</p>
        <p className="text-center font-mono opacity-80" lang="zh-CN">
          {prompt.structure}
        </p>
        {!revealed ? (
          <RevealButton onReveal={onReveal} />
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm opacity-90">{prompt.explicationFr}</p>
            <Examples list={prompt.examples} audioEnabled={audioEnabled} onSpeak={play} />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {prompt.promptKind === 'hanzi' && <Prompt lang="zh-CN">{prompt.hanzi}</Prompt>}
      {prompt.promptKind === 'sense' && <Prompt>{prompt.sense}</Prompt>}
      {isAudio &&
        (audioEnabled ? (
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => play(prompt.hanzi)}
              className="rounded-full border border-current/20 px-5 py-3 text-lg"
            >
              🔊 Écouter
            </button>
            {audioHint !== null && (
              <p className="max-w-xs text-center text-xs opacity-70">{audioHint}</p>
            )}
          </div>
        ) : (
          // audio désactivé : on montre le hanzi pour ne pas laisser une carte sans énoncé
          <Prompt lang="zh-CN">{prompt.hanzi}</Prompt>
        ))}
      {!revealed ? (
        <RevealButton onReveal={onReveal} />
      ) : (
        <div className="flex flex-col items-center gap-2">
          <Prompt lang="zh-CN">{prompt.hanzi}</Prompt>
          <p className="text-lg opacity-80" lang="zh-CN">
            {prompt.pinyin}
          </p>
          <p className="text-lg">{prompt.sense}</p>
          <Examples list={prompt.examples} audioEnabled={audioEnabled} onSpeak={play} />
        </div>
      )}
    </div>
  )
}

function RevealButton({ onReveal }: { onReveal: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onReveal}
      className="mx-auto rounded-lg border border-current/20 px-6 py-2 text-sm font-medium"
    >
      Afficher la réponse
    </button>
  )
}

function RatingBar({
  correct,
  disabled,
  onGrade,
}: {
  correct: boolean | null
  disabled: boolean
  onGrade: (rating: Rating) => void
}): JSX.Element {
  const ratings: Rating[] =
    correct === false
      ? ['again']
      : correct === true
        ? ['hard', 'good', 'easy']
        : ['again', 'hard', 'good', 'easy']
  return (
    <div
      role="group"
      aria-label="Noter la carte"
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${ratings.length}, minmax(0, 1fr))` }}
    >
      {ratings.map((r) => (
        <button
          key={r}
          type="button"
          disabled={disabled}
          onClick={() => onGrade(r)}
          className="rounded-lg bg-black px-3 py-3 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {RATING_LABEL[r]}
        </button>
      ))}
    </div>
  )
}

function BackButton({ onFinish }: { onFinish: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onFinish}
      className="rounded-lg border border-current/20 px-4 py-2 text-sm font-medium"
    >
      Retour à l’accueil
    </button>
  )
}

function SummaryView({
  summary,
  onFinish,
}: {
  summary: SessionSummary
  onFinish: () => void
}): JSX.Element {
  const cells: Array<[string, string]> = [
    ['Révisions', String(summary.reviews)],
    ['Temps', formatDuration(summary.timeMs)],
    ['Nouvelles', String(summary.newIntroduced)],
    ['Acquises', String(summary.graduated)],
  ]
  if (summary.leeches > 0) {
    cells.push(['Mises en pause', String(summary.leeches)])
  }
  if (summary.remaining > 0) {
    cells.push(['Restantes', String(summary.remaining)])
  }
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-8 p-6">
      <header className="pt-6">
        <h1 className="text-2xl font-semibold">{END_REASON_LABEL[summary.endReason]}</h1>
      </header>
      <dl className="grid grid-cols-2 gap-3">
        {cells.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-1 rounded-lg border border-current/15 p-3">
            <dt className="text-xs opacity-60">{label}</dt>
            <dd className="text-xl font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-auto flex flex-col gap-1 text-sm opacity-70">
        <span>Encore {summary.again}</span>
        <span>Difficile {summary.hard}</span>
        <span>Bien {summary.good}</span>
        <span>Facile {summary.easy}</span>
      </div>
      <button
        type="button"
        onClick={onFinish}
        className="rounded-lg bg-black px-4 py-3 text-center font-medium text-white dark:bg-white dark:text-black"
      >
        Retour à l’accueil
      </button>
    </main>
  )
}
