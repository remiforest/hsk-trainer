/**
 * Contrôle de cohérence exécuté au démarrage. Pur : reçoit les données et le
 * catalogue, ne touche ni à IndexedDB ni au réseau. `bootstrap.ts` décide quoi
 * faire d'un rapport contenant des erreurs (écran de récupération).
 */

import { catalogHas, type ContentCatalog } from '../../types/content'
import { isReviewEvent, type JournalEvent } from '../../types/events'
import { isCardTypeValidFor, parseCardId, type CardId } from '../../types/ids'
import {
  type IntegrityProblem,
  type IntegrityProblemKind,
  type IntegrityReport,
  type IntegritySeverity,
} from '../../types/integrity'
import { type Settings, type UserProgress } from '../../types/progress'
import { type Card, type SrsState } from '../../types/srs'
import { rebuildCardsFromJournal } from '../journal/rebuild'

export interface IntegrityInput {
  cards: readonly Card[]
  events: readonly JournalEvent[]
  catalog: ContentCatalog
  settings: Settings | null
  userProgress: UserProgress | null
  now: number
}

const MIN_PLAUSIBLE_MS = Date.UTC(2020, 0, 1)
const MAX_SKEW_MS = 3 * 366 * 86_400_000 // ~3 ans dans le futur

function plausibleDate(ms: number, now: number): boolean {
  return Number.isFinite(ms) && ms >= MIN_PLAUSIBLE_MS && ms <= now + MAX_SKEW_MS
}

const SRS_KEYS: readonly (keyof SrsState)[] = [
  'state',
  'due',
  'stability',
  'difficulty',
  'reps',
  'lapses',
  'lastReviewedAt',
  'learningStep',
]

function srsEqual(a: SrsState, b: SrsState): boolean {
  return SRS_KEYS.every((k) => a[k] === b[k])
}

export function checkIntegrity(input: IntegrityInput): IntegrityReport {
  const { cards, events, catalog, settings, userProgress, now } = input
  const problems: IntegrityProblem[] = []
  const add = (
    kind: IntegrityProblemKind,
    severity: IntegritySeverity,
    message: string,
    extra: { cardId?: CardId; eventId?: JournalEvent['id'] } = {},
  ): void => {
    problems.push({ kind, severity, message, ...extra })
  }

  if (settings === null) {
    add('missing_singleton', 'error', 'Réglages (settings) absents.')
  }
  if (userProgress === null) {
    add('missing_singleton', 'error', 'Progression (userProgress) absente.')
  }

  // --- Journal --------------------------------------------------------------
  const seenIds = new Set<string>()
  const seenSeq = new Set<number>()
  let lastSeq = -Infinity
  const reviewCountByCard = new Map<CardId, number>()
  const lapseCountByCard = new Map<CardId, number>()
  const knownCardIds = new Set<CardId>()

  const sorted = [...events].sort((a, b) => a.seq - b.seq)
  for (const e of sorted) {
    if (seenIds.has(e.id)) {
      add('duplicate_event_id', 'error', `Deux événements partagent l'id ${e.id}.`, {
        eventId: e.id,
      })
    }
    seenIds.add(e.id)
    if (seenSeq.has(e.seq) || e.seq <= lastSeq) {
      add('seq_not_monotonic', 'error', `seq non strictement croissant à ${e.seq}.`, {
        eventId: e.id,
      })
    }
    seenSeq.add(e.seq)
    lastSeq = e.seq

    if (!plausibleDate(e.at, now)) {
      add('invalid_date', 'error', `Événement ${e.id} : date « at » implausible (${e.at}).`, {
        eventId: e.id,
      })
    }

    if (e.kind === 'card_created') {
      knownCardIds.add(e.cardId)
    }
    if (isReviewEvent(e)) {
      reviewCountByCard.set(e.cardId, (reviewCountByCard.get(e.cardId) ?? 0) + 1)
      const beforeReviewLike =
        e.stateBefore.state === 'review' || e.stateBefore.state === 'relearning'
      if (e.rating === 'again' && beforeReviewLike) {
        lapseCountByCard.set(e.cardId, (lapseCountByCard.get(e.cardId) ?? 0) + 1)
      }
      if (!plausibleDate(e.stateAfter.due, now)) {
        add('invalid_date', 'error', `Événement ${e.id} : stateAfter.due implausible.`, {
          eventId: e.id,
        })
      }
    }
  }

  const storedIds = new Set(cards.map((c) => c.id))
  for (const e of sorted) {
    if (e.kind === 'lesson_completed') {
      continue
    }
    if (!knownCardIds.has(e.cardId) && !storedIds.has(e.cardId)) {
      add('orphan_event', 'error', `Événement ${e.id} vise une carte inconnue ${e.cardId}.`, {
        eventId: e.id,
        cardId: e.cardId,
      })
    }
  }

  // --- Cartes stockées ----------------------------------------------------
  for (const card of cards) {
    let parsed: ReturnType<typeof parseCardId> | null = null
    try {
      parsed = parseCardId(card.id)
    } catch {
      add('invalid_card_type', 'error', `CardId malformé ${card.id}.`, { cardId: card.id })
    }
    if (parsed) {
      if (
        parsed.itemType !== card.itemType ||
        parsed.itemId !== card.itemId ||
        parsed.cardType !== card.cardType ||
        !isCardTypeValidFor(card.itemType, card.cardType)
      ) {
        add('invalid_card_type', 'error', `Champs incohérents avec le CardId ${card.id}.`, {
          cardId: card.id,
        })
      }
      if (!catalogHas(catalog, card.itemType, card.itemId)) {
        add('orphan_card', 'error', `Carte ${card.id} : item absent du catalogue.`, {
          cardId: card.id,
        })
      }
    }

    if (!plausibleDate(card.due, now)) {
      add('invalid_date', 'error', `Carte ${card.id} : due implausible (${card.due}).`, {
        cardId: card.id,
      })
    }
    if (card.lastReviewedAt !== null && !plausibleDate(card.lastReviewedAt, now)) {
      add('invalid_date', 'error', `Carte ${card.id} : lastReviewedAt implausible.`, {
        cardId: card.id,
      })
    }

    const expectedReps = reviewCountByCard.get(card.id) ?? 0
    if (card.reps !== expectedReps) {
      add(
        'reps_mismatch',
        'error',
        `Carte ${card.id} : reps=${card.reps} mais ${expectedReps} révision(s) au journal.`,
        { cardId: card.id },
      )
    }
    const expectedLapses = lapseCountByCard.get(card.id) ?? 0
    if (card.lapses !== expectedLapses) {
      add(
        'lapses_mismatch',
        'error',
        `Carte ${card.id} : lapses=${card.lapses} mais ${expectedLapses} échec(s) en révision au journal.`,
        { cardId: card.id },
      )
    }
  }

  // --- Recoupement avec le rejeu du journal ------------------------------
  const { cards: rebuilt } = rebuildCardsFromJournal(events)
  for (const [id, rebuiltCard] of rebuilt) {
    const stored = cards.find((c) => c.id === id)
    if (!stored) {
      add('state_mismatch', 'error', `Carte ${id} présente au journal mais absente de la table.`, {
        cardId: id,
      })
      continue
    }
    if (!srsEqual(stored, rebuiltCard)) {
      add(
        'state_mismatch',
        'error',
        `Carte ${id} : état stocké différent de l'état reconstruit depuis le journal.`,
        { cardId: id },
      )
    }
  }

  const hasErrors = problems.some((p) => p.severity === 'error')
  return {
    ok: problems.length === 0,
    checkedAt: now,
    cardsChecked: cards.length,
    eventsChecked: events.length,
    problems,
    hasErrors,
  }
}
