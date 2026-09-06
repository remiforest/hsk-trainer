/**
 * Pilote d'une session de révision : enveloppe la machine pure
 * `core/srs/session` et branche la persistance atomique (`persistAnswer`).
 *
 * Garantie de sûreté : chaque note est écrite dans sa transaction dès la
 * validation. Fermer l'onglet en pleine session ne perd, au pire, que la carte
 * en cours d'affichage (pas encore notée).
 */

import { useMemo, useState } from 'react'
import { type Rng } from '../../core/cards/quiz'
import {
  DEFAULT_SESSION_CONFIG,
  answer,
  currentCard,
  sessionProgress,
  sessionSummary,
  startSession,
  stopSession,
  type SessionConfig,
  type SessionState,
  type SessionSummary,
  type SessionTally,
} from '../../core/srs/session'
import { type DayQueue } from '../../core/srs/queue'
import { type HskDatabase } from '../../db/db'
import { persistAnswer } from '../../db/review-session'
import { type ContentCatalog } from '../../types/content'
import { newSessionId } from '../../types/ids'
import { type Settings } from '../../types/progress'
import { type Card, type Rating } from '../../types/srs'
import { buildExercise, type Exercise } from './exercise'

export interface UseSessionDeps {
  db: HskDatabase
  catalog: ContentCatalog
  plan: DayQueue
  settings: Settings
  timeZone?: string
  /** horloge murale — injectée pour les tests */
  clock: () => number
  /** aléatoire des distracteurs — injecté pour les tests */
  rng: Rng
}

export type SessionPhase =
  { kind: 'question' } | { kind: 'graded'; correct: boolean | null; picked: string | null }

export interface UseSession {
  status: 'active' | 'finished'
  card: Card | null
  exercise: Exercise | null
  phase: SessionPhase
  progress: { done: number; total: number }
  tally: SessionTally
  summary: SessionSummary | null
  persisting: boolean
  error: string | null
  /** QCM : l'utilisateur choisit une option */
  submitChoice: (optionId: string) => void
  /** saisie pinyin : le composant a comparé et transmet le verdict */
  submitPinyin: (correct: boolean) => void
  /** cartes en reconnaissance : l'utilisateur demande la réponse */
  reveal: () => void
  /** note finale (Encore / Difficile / Bien / Facile) → persistée */
  grade: (rating: Rating) => void
  /** arrêt manuel : clôt la session sur un résumé */
  stop: () => void
}

interface Core {
  state: SessionState
  summary: SessionSummary | null
}

function configFrom(settings: Settings): SessionConfig {
  return {
    targetReviews: Math.max(0, settings.dailyReviewTarget),
    targetMs: Math.max(0, settings.dailyMinutesTarget) * 60_000,
    sessionHorizonMs: DEFAULT_SESSION_CONFIG.sessionHorizonMs,
    leechThreshold: settings.leechThreshold,
  }
}

export function useSession(deps: UseSessionDeps): UseSession {
  const { db, catalog, plan, settings, timeZone, clock, rng } = deps

  // Démarrage une seule fois (initialiseur paresseux). La session peut finir
  // immédiatement si la file est vide : le résumé est alors calculé d'emblée.
  const [core, setCore] = useState<Core>(() => {
    const state0 = startSession({
      sessionId: newSessionId(),
      now: clock(),
      config: configFrom(settings),
      due: plan.due,
      fresh: plan.fresh,
    })
    return {
      state: state0,
      summary: state0.status === 'finished' ? sessionSummary(state0, clock()) : null,
    }
  })
  const { state, summary } = core

  const [phase, setPhase] = useState<SessionPhase>({ kind: 'question' })
  const [cardShownAt, setCardShownAt] = useState<number>(() => clock())
  const [persisting, setPersisting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const card = currentCard(state)
  const exercise = useMemo(
    () => (card ? buildExercise(card, catalog, rng) : null),
    [card, catalog, rng],
  )

  const submitChoice = (optionId: string): void => {
    if (phase.kind !== 'question' || exercise?.kind !== 'choice') {
      return
    }
    setPhase({
      kind: 'graded',
      correct: optionId === exercise.question.correctId,
      picked: optionId,
    })
  }

  const submitPinyin = (correct: boolean): void => {
    if (phase.kind !== 'question') {
      return
    }
    setPhase({ kind: 'graded', correct, picked: null })
  }

  const reveal = (): void => {
    if (phase.kind !== 'question') {
      return
    }
    setPhase({ kind: 'graded', correct: null, picked: null })
  }

  const grade = (rating: Rating): void => {
    if (
      state.status !== 'active' ||
      state.current === null ||
      phase.kind !== 'graded' ||
      persisting
    ) {
      return
    }
    const at = clock()
    const elapsedMs = Math.max(0, at - cardShownAt)
    setPersisting(true)
    setError(null)

    void (async () => {
      try {
        const result = answer(state, { rating, now: at, elapsedMs })
        await persistAnswer(db, {
          outcome: result.outcome,
          leech: result.leech,
          now: at,
          elapsedMs,
          ...(timeZone !== undefined ? { timeZone } : {}),
        })
        const finishedSummary =
          result.state.status === 'finished' ? sessionSummary(result.state, clock()) : null
        setCore((prev) => ({
          state: result.state,
          summary: finishedSummary ?? prev.summary,
        }))
        setPhase({ kind: 'question' })
        setCardShownAt(clock())
      } catch (err) {
        // Rien n'a été persisté : on garde la carte en cours, l'utilisateur peut
        // renoter.
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setPersisting(false)
      }
    })()
  }

  const stop = (): void => {
    if (state.status === 'finished') {
      return
    }
    const at = clock()
    const finished = stopSession(state, at)
    setCore({ state: finished, summary: sessionSummary(finished, at) })
  }

  return {
    status: state.status,
    card,
    exercise,
    phase,
    progress: sessionProgress(state),
    tally: state.tally,
    summary,
    persisting,
    error,
    submitChoice,
    submitPinyin,
    reveal,
    grade,
    stop,
  }
}
