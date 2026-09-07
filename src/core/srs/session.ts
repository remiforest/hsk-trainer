/**
 * Machine à états d'une session de révision. Pure : chaque transition renvoie un
 * nouvel état. Le rendu et la persistance sont ailleurs.
 *
 * Invariants voulus (cahier des charges §5) :
 *  - une carte ratée (« Encore ») **revient dans la même session** tant qu'elle
 *    n'a pas été réussie (Bien/Facile) au moins une fois ;
 *  - la session ne se termine **jamais** automatiquement sur un échec non repris ;
 *  - la session a une fin claire : file vide, ou objectif (temps/nombre) atteint ;
 *  - une carte devenue leech quitte la session (leçon de reprise, pas de rabâchage).
 */

import { type CardId, type SessionId } from '../../types/ids'
import { type Card, type Rating } from '../../types/srs'
import { evaluateLeech, type LeechDecision } from './leech'
import { makeReviewOutcome, type ReviewOutcome } from './scheduler'

export interface SessionConfig {
  /** objectif en nombre de révisions (0 = pas d'objectif de nombre) */
  targetReviews: number
  /** objectif en millisecondes (0 = pas d'objectif de temps) */
  targetMs: number
  /** au-delà de cet horizon, une carte d'apprentissage ne revient pas dans cette session */
  sessionHorizonMs: number
  /** seuil de lapses au-delà duquel une carte devient leech */
  leechThreshold: number
}

export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  targetReviews: 40,
  targetMs: 10 * 60_000,
  sessionHorizonMs: 20 * 60_000,
  leechThreshold: 6,
}

export type SessionEndReason = 'queue-empty' | 'objective-reached' | 'stopped'

interface QueueEntry {
  card: Card
  origin: 'review' | 'new'
  /** instant à partir duquel la carte peut réapparaître dans la session */
  showAt: number
  seen: number
  everFailed: boolean
  /** a été ratée et pas encore réussie depuis */
  pendingRecovery: boolean
}

export interface SessionTally {
  reviews: number
  again: number
  hard: number
  good: number
  easy: number
  newIntroduced: number
  graduated: number
  leeches: number
  timeMs: number
}

export interface SessionState {
  sessionId: SessionId
  startedAt: number
  config: SessionConfig
  status: 'active' | 'finished'
  current: QueueEntry | null
  queue: QueueEntry[]
  finishedCardIds: CardId[]
  tally: SessionTally
  endReason: SessionEndReason | null
}

export interface StartInput {
  sessionId: SessionId
  now: number
  config: SessionConfig
  due: readonly Card[]
  fresh: readonly Card[]
}

function entry(card: Card, origin: 'review' | 'new', now: number): QueueEntry {
  return { card, origin, showAt: now, seen: 0, everFailed: false, pendingRecovery: false }
}

function emptyTally(): SessionTally {
  return {
    reviews: 0,
    again: 0,
    hard: 0,
    good: 0,
    easy: 0,
    newIntroduced: 0,
    graduated: 0,
    leeches: 0,
    timeMs: 0,
  }
}

function pickNext(
  queue: QueueEntry[],
  now: number,
): { next: QueueEntry | null; rest: QueueEntry[] } {
  if (queue.length === 0) {
    return { next: null, rest: [] }
  }
  let idx = queue.findIndex((e) => e.showAt <= now)
  if (idx === -1) {
    idx = queue.reduce((best, e, i, arr) => (e.showAt < arr[best]!.showAt ? i : best), 0)
  }
  const next = queue[idx]!
  return { next, rest: [...queue.slice(0, idx), ...queue.slice(idx + 1)] }
}

function objectiveReached(tally: SessionTally, config: SessionConfig): boolean {
  return (
    (config.targetReviews > 0 && tally.reviews >= config.targetReviews) ||
    (config.targetMs > 0 && tally.timeMs >= config.targetMs)
  )
}

function hasPending(entries: readonly (QueueEntry | null)[]): boolean {
  return entries.some((e) => e !== null && e.pendingRecovery)
}

function settle(state: SessionState): SessionState {
  // 1. file entièrement vide -> fin (l'objectif prime comme motif s'il est atteint)
  if (state.current === null && state.queue.length === 0) {
    const reason: SessionEndReason = objectiveReached(state.tally, state.config)
      ? 'objective-reached'
      : 'queue-empty'
    return { ...state, status: 'finished', endReason: state.endReason ?? reason }
  }
  // 2. objectif atteint et aucun échec en attente de reprise -> fin
  if (objectiveReached(state.tally, state.config) && !hasPending([state.current, ...state.queue])) {
    return {
      ...state,
      status: 'finished',
      endReason: 'objective-reached',
      current: null,
      queue: [],
      finishedCardIds: [
        ...state.finishedCardIds,
        ...(state.current ? [state.current.card.id] : []),
        ...state.queue.map((e) => e.card.id),
      ],
    }
  }
  return state
}

export function startSession(input: StartInput): SessionState {
  const initialQueue = [
    ...input.due.map((c) => entry(c, 'review', input.now)),
    ...input.fresh.map((c) => entry(c, 'new', input.now)),
  ]
  const { next, rest } = pickNext(initialQueue, input.now)
  const base: SessionState = {
    sessionId: input.sessionId,
    startedAt: input.now,
    config: input.config,
    status: 'active',
    current: next,
    queue: rest,
    finishedCardIds: [],
    tally: emptyTally(),
    endReason: null,
  }
  return settle(base)
}

export interface AnswerInput {
  rating: Rating
  now: number
  elapsedMs: number
}

export interface AnswerResult {
  state: SessionState
  outcome: ReviewOutcome
  leech: LeechDecision
}

export function answer(state: SessionState, input: AnswerInput): AnswerResult {
  if (state.status !== 'active' || state.current === null) {
    throw new Error('answer() appelé sur une session sans carte courante')
  }
  const cur = state.current
  const outcome = makeReviewOutcome({
    card: cur.card,
    rating: input.rating,
    now: input.now,
    sessionId: state.sessionId,
    elapsedMs: input.elapsedMs,
  })
  const leech = evaluateLeech(
    outcome.draft.stateBefore,
    outcome.draft.stateAfter,
    cur.card,
    state.config.leechThreshold,
  )

  const wasNew = cur.card.state === 'new'
  const graduatedNow = cur.card.state !== 'review' && outcome.updatedCard.state === 'review'
  const succeeded = input.rating === 'good' || input.rating === 'easy'
  const everFailed = cur.everFailed || input.rating === 'again'
  const pendingRecovery = input.rating === 'again' ? true : succeeded ? false : cur.pendingRecovery

  const tally: SessionTally = {
    ...state.tally,
    reviews: state.tally.reviews + 1,
    again: state.tally.again + (input.rating === 'again' ? 1 : 0),
    hard: state.tally.hard + (input.rating === 'hard' ? 1 : 0),
    good: state.tally.good + (input.rating === 'good' ? 1 : 0),
    easy: state.tally.easy + (input.rating === 'easy' ? 1 : 0),
    newIntroduced: state.tally.newIntroduced + (wasNew ? 1 : 0),
    graduated: state.tally.graduated + (graduatedNow ? 1 : 0),
    leeches: state.tally.leeches + (leech.becameLeech ? 1 : 0),
    timeMs: state.tally.timeMs + Math.max(0, input.elapsedMs),
  }

  const updatedEntry: QueueEntry = {
    ...cur,
    card: outcome.updatedCard,
    seen: cur.seen + 1,
    everFailed,
    pendingRecovery,
  }

  // Disposition de la carte qu'on vient de noter
  const leavesSession =
    leech.shouldSuspend ||
    (!pendingRecovery &&
      (outcome.updatedCard.state === 'review' ||
        outcome.updatedCard.due - input.now > state.config.sessionHorizonMs))

  let nextQueue = state.queue
  const finishedCardIds = [...state.finishedCardIds]
  if (leavesSession) {
    finishedCardIds.push(cur.card.id)
  } else {
    const delay = pendingRecovery
      ? Math.min(Math.max(outcome.updatedCard.due - input.now, 30_000), 90_000)
      : Math.max(outcome.updatedCard.due - input.now, 30_000)
    nextQueue = [...state.queue, { ...updatedEntry, showAt: input.now + delay }]
  }

  const { next, rest } = pickNext(nextQueue, input.now)
  const advanced: SessionState = {
    ...state,
    current: next,
    queue: rest,
    finishedCardIds,
    tally,
  }
  return { state: settle(advanced), outcome, leech }
}

/** Arrêt manuel par l'utilisateur. */
export function stopSession(state: SessionState, _now: number): SessionState {
  if (state.status === 'finished') {
    return state
  }
  return {
    ...state,
    status: 'finished',
    endReason: 'stopped',
    finishedCardIds: [
      ...state.finishedCardIds,
      ...(state.current ? [state.current.card.id] : []),
      ...state.queue.map((e) => e.card.id),
    ],
    current: null,
    queue: [],
  }
}

export interface SessionSummary {
  endReason: SessionEndReason
  durationMs: number
  reviews: number
  newIntroduced: number
  graduated: number
  leeches: number
  again: number
  hard: number
  good: number
  easy: number
  timeMs: number
  /** cartes encore en file (non vues / non terminées) au moment de la fin */
  remaining: number
}

export function sessionSummary(state: SessionState, now: number): SessionSummary {
  return {
    endReason: state.endReason ?? 'stopped',
    durationMs: Math.max(0, now - state.startedAt),
    reviews: state.tally.reviews,
    newIntroduced: state.tally.newIntroduced,
    graduated: state.tally.graduated,
    leeches: state.tally.leeches,
    again: state.tally.again,
    hard: state.tally.hard,
    good: state.tally.good,
    easy: state.tally.easy,
    timeMs: state.tally.timeMs,
    remaining: state.queue.length + (state.current ? 1 : 0),
  }
}

export function currentCard(state: SessionState): Card | null {
  return state.current?.card ?? null
}

export interface SessionProgress {
  /** cartes vues au moins une fois dans la session (y compris celles encore en apprentissage) */
  done: number
  /** estimation du total pour la barre de progression */
  total: number
}

export function sessionProgress(state: SessionState): SessionProgress {
  // Une carte compte comme « faite » dès qu'elle a reçu une note. Les cartes en
  // apprentissage restent dans la file pour leurs paliers suivants : ne compter
  // que celles qui ont quitté la session laisserait le compteur bloqué à 0
  // pendant toute une session de découverte.
  const seenInQueue = state.queue.filter((e) => e.seen > 0).length
  const seenCurrent = state.current && state.current.seen > 0 ? 1 : 0
  const done = state.finishedCardIds.length + seenInQueue + seenCurrent
  const pending =
    state.queue.filter((e) => e.seen === 0).length +
    (state.current && state.current.seen === 0 ? 1 : 0)
  return { done, total: done + pending }
}
