/**
 * Sélection de la file du jour : révisions dues + nouvelles cartes (plafonnées).
 * Pur : reçoit toutes les cartes et le journal, renvoie ce qu'il y a à faire.
 */

import { isReviewEvent, type JournalEvent } from '../../types/events'
import { type Settings } from '../../types/progress'
import { type Card } from '../../types/srs'
import { isSameOrBeforeDay, localDayKey } from '../time/day'

export interface DayQueueInput {
  cards: readonly Card[]
  events: readonly JournalEvent[]
  settings: Pick<Settings, 'newCardsPerDay'>
  now: number
  timeZone?: string
}

export interface DayQueueCounts {
  due: number
  /** nouvelles cartes disponibles au total (non encore introduites) */
  newAvailable: number
  /** nouvelles cartes déjà introduites aujourd'hui */
  newIntroducedToday: number
  /** places restantes pour de nouvelles cartes aujourd'hui */
  newSlotsLeft: number
}

export interface DayQueue {
  /** révisions dues (apprentissage/relearning en tête, puis review par échéance) */
  due: Card[]
  /** nouvelles cartes à introduire aujourd'hui, déjà plafonnées */
  fresh: Card[]
  counts: DayQueueCounts
}

export function countNewIntroducedToday(
  events: readonly JournalEvent[],
  now: number,
  timeZone?: string,
): number {
  const todayKey = localDayKey(now, timeZone)
  const seen = new Set<string>()
  for (const e of events) {
    if (
      isReviewEvent(e) &&
      e.stateBefore.state === 'new' &&
      localDayKey(e.at, timeZone) === todayKey
    ) {
      seen.add(e.cardId)
    }
  }
  return seen.size
}

function isDue(card: Card, now: number, todayKey: string, timeZone?: string): boolean {
  if (card.suspended || card.state === 'new') {
    return false
  }
  if (card.state === 'learning' || card.state === 'relearning') {
    return card.due <= now
  }
  // review : dû aujourd'hui ou en retard
  return isSameOrBeforeDay(localDayKey(card.due, timeZone), todayKey)
}

const LEARNING_FIRST: Record<Card['state'], number> = {
  learning: 0,
  relearning: 0,
  review: 1,
  new: 2,
}

export interface ExtraQueueInput {
  cards: readonly Card[]
  events: readonly JournalEvent[]
  settings: Pick<Settings, 'extraReviewsPerDay'>
  now: number
  timeZone?: string
}

export interface ExtraQueueCounts {
  /** cartes mûres révisables en avance, au total */
  available: number
  /** révisions bonus déjà faites aujourd'hui (cartes distinctes) */
  doneToday: number
  /** places restantes pour des révisions bonus aujourd'hui */
  slotsLeft: number
}

export interface ExtraQueue {
  /** cartes à proposer, déjà plafonnées, triées par échéance croissante */
  cards: Card[]
  counts: ExtraQueueCounts
}

/**
 * Une révision « bonus » : une carte en état `review` révisée aujourd'hui alors
 * que son échéance tombait un jour calendaire ultérieur. Comptée en cartes
 * distinctes, comme les nouvelles cartes introduites.
 */
export function countExtraReviewedToday(
  events: readonly JournalEvent[],
  now: number,
  timeZone?: string,
): number {
  const todayKey = localDayKey(now, timeZone)
  const seen = new Set<string>()
  for (const e of events) {
    if (
      isReviewEvent(e) &&
      localDayKey(e.at, timeZone) === todayKey &&
      e.stateBefore.state === 'review' &&
      !isSameOrBeforeDay(localDayKey(e.stateBefore.due, timeZone), todayKey)
    ) {
      seen.add(e.cardId)
    }
  }
  return seen.size
}

/**
 * File de révision « en plus » : quand la file du jour est vide mais que
 * l'utilisateur veut continuer. On ne pioche que des cartes mûres (`review`,
 * non suspendues) dont l'échéance est un jour calendaire ultérieur — jamais de
 * nouvelle carte, jamais une carte déjà due (celle-là est dans la file normale).
 * Trié par échéance croissante : les cartes les plus proches d'être dues d'abord.
 * Plafonné à `extraReviewsPerDay`, décompté des bonus déjà faits aujourd'hui.
 */
export function buildExtraQueue(input: ExtraQueueInput): ExtraQueue {
  const { cards, events, settings, now, timeZone } = input
  const todayKey = localDayKey(now, timeZone)

  const candidates = cards
    .filter(
      (c) =>
        c.state === 'review' &&
        !c.suspended &&
        !isSameOrBeforeDay(localDayKey(c.due, timeZone), todayKey),
    )
    .sort((a, b) => a.due - b.due || a.id.localeCompare(b.id))

  const doneToday = countExtraReviewedToday(events, now, timeZone)
  const slotsLeft = Math.max(0, settings.extraReviewsPerDay - doneToday)

  return {
    cards: candidates.slice(0, slotsLeft),
    counts: { available: candidates.length, doneToday, slotsLeft },
  }
}

export function buildDayQueue(input: DayQueueInput): DayQueue {
  const { cards, events, settings, now, timeZone } = input
  const todayKey = localDayKey(now, timeZone)

  const due = cards
    .filter((c) => isDue(c, now, todayKey, timeZone))
    .sort((a, b) => LEARNING_FIRST[a.state] - LEARNING_FIRST[b.state] || a.due - b.due)

  const newCards = cards
    .filter((c) => c.state === 'new' && !c.suspended)
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))

  const newIntroducedToday = countNewIntroducedToday(events, now, timeZone)
  const newSlotsLeft = Math.max(0, settings.newCardsPerDay - newIntroducedToday)
  const fresh = newCards.slice(0, newSlotsLeft)

  return {
    due,
    fresh,
    counts: {
      due: due.length,
      newAvailable: newCards.length,
      newIntroducedToday,
      newSlotsLeft,
    },
  }
}
