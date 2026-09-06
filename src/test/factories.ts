/**
 * Fabriques d'objets pour les tests. Pas de dépendance au scheduler réel : les
 * transitions d'état sont simplifiées mais cohérentes (reps croissant, lapses
 * incrémenté sur « again » en review). Suffisant pour tester le rejeu du
 * journal, le contrôle d'intégrité, les snapshots et l'export/import.
 */

import { type CardCreatedEvent, type JournalEvent, type ReviewEvent } from '../types/events'
import { makeCardId, newEventId, newSessionId, type CardId } from '../types/ids'
import { type Card, type Rating, type SrsState } from '../types/srs'
import {
  DEFAULT_SETTINGS,
  INITIAL_PROGRESS,
  type Settings,
  type UserProgress,
} from '../types/progress'
import { type UserDataDump } from '../types/backup'
import {
  buildCatalog,
  type ContentCatalog,
  type GrammarPoint,
  type Lesson,
  type Word,
} from '../types/content'

const DAY_MS = 86_400_000

export function makeCard(overrides: Partial<Card> = {}): Card {
  const itemType = overrides.itemType ?? 'word'
  const itemId = overrides.itemId ?? 'w-0001'
  const cardType = overrides.cardType ?? 'hanzi_to_sense'
  const id = overrides.id ?? makeCardId(itemType, itemId, cardType)
  const base: Card = {
    id,
    itemType,
    itemId,
    cardType,
    state: 'new',
    due: 0,
    stability: 0,
    difficulty: 0,
    reps: 0,
    lapses: 0,
    lastReviewedAt: null,
    learningStep: -1,
    leech: false,
    suspended: false,
    createdAt: 0,
  }
  return { ...base, ...overrides, id }
}

export function srsOf(card: Card): SrsState {
  return {
    state: card.state,
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    reps: card.reps,
    lapses: card.lapses,
    lastReviewedAt: card.lastReviewedAt,
    learningStep: card.learningStep,
  }
}

/** Transition d'état simplifiée mais monotone, pour les tests. */
export function fakeNextState(prev: SrsState, rating: Rating, at: number): SrsState {
  const wasReviewLike = prev.state === 'review' || prev.state === 'relearning'
  const intervalDays = rating === 'again' ? 0 : rating === 'hard' ? 1 : rating === 'good' ? 3 : 7
  const nextState: SrsState['state'] =
    rating === 'again' ? (wasReviewLike ? 'relearning' : 'learning') : 'review'
  return {
    state: nextState,
    due: at + intervalDays * DAY_MS,
    stability: Math.max(prev.stability, intervalDays),
    difficulty: Math.min(10, Math.max(1, prev.difficulty || 5)),
    reps: prev.reps + 1,
    lapses: prev.lapses + (rating === 'again' && wasReviewLike ? 1 : 0),
    lastReviewedAt: at,
    learningStep: nextState === 'review' ? -1 : 0,
  }
}

interface JournalBuilderState {
  seq: number
  events: JournalEvent[]
  cards: Map<CardId, Card>
}

export class JournalBuilder {
  private state: JournalBuilderState = { seq: 0, events: [], cards: new Map() }

  create(card: Card, at: number): this {
    // Une carte neuve est due à sa création.
    const pristine = card.reps === 0 && card.state === 'new'
    const seeded: Card = { ...card, createdAt: at, due: pristine ? at : card.due }
    this.state.seq += 1
    const event: CardCreatedEvent = {
      kind: 'card_created',
      id: newEventId(),
      seq: this.state.seq,
      at,
      cardId: seeded.id,
      card: { ...seeded },
    }
    this.state.events.push(event)
    this.state.cards.set(seeded.id, { ...seeded })
    return this
  }

  review(cardId: CardId, rating: Rating, at: number): this {
    const card = this.state.cards.get(cardId)
    if (!card) {
      throw new Error(`review() sur une carte inconnue : ${cardId}`)
    }
    const before = srsOf(card)
    const after = fakeNextState(before, rating, at)
    this.state.seq += 1
    const event: ReviewEvent = {
      kind: 'card_reviewed',
      id: newEventId(),
      seq: this.state.seq,
      at,
      cardId,
      sessionId: newSessionId(),
      rating,
      stateBefore: before,
      stateAfter: after,
      intervalBeforeDays: 0,
      intervalAfterDays: (after.due - at) / DAY_MS,
      elapsedMs: 2_000,
    }
    this.state.events.push(event)
    this.state.cards.set(cardId, { ...card, ...after })
    return this
  }

  get events(): JournalEvent[] {
    return this.state.events.map((e) => structuredClone(e))
  }

  /** État attendu des cartes après rejeu du journal. */
  get expectedCards(): Card[] {
    return [...this.state.cards.values()].map((c) => structuredClone(c))
  }
}

export function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, ...overrides, id: 'settings' }
}

export function makeProgress(overrides: Partial<UserProgress> = {}): UserProgress {
  return { ...INITIAL_PROGRESS, ...overrides, id: 'progress' }
}

export function makeWord(overrides: Partial<Word> = {}): Word {
  return {
    id: 'w-0001',
    hanzi: '好',
    pinyin: 'hǎo',
    fr: 'bien',
    niveauHsk: 1,
    categorieGrammaticale: 'adjectif',
    themes: ['base'],
    exemples: [{ hanzi: '你好', pinyin: 'nǐ hǎo', fr: 'bonjour' }],
    ...overrides,
  }
}

export function makeGrammarPoint(overrides: Partial<GrammarPoint> = {}): GrammarPoint {
  return {
    id: 'g-0001',
    titre: 'La particule 的',
    explicationFr: 'Marque la possession ou la détermination.',
    structure: 'A + 的 + N',
    exemples: [{ hanzi: '我的书', pinyin: 'wǒ de shū', fr: 'mon livre' }],
    niveauHsk: 1,
    ...overrides,
  }
}

export function makeLesson(overrides: Partial<Lesson> = {}): Lesson {
  return {
    id: 'lesson-0001',
    titre: 'Se présenter',
    ordre: 1,
    objectif: 'Saluer et dire son nom.',
    niveauHsk: 1,
    wordIds: [],
    grammarPointIds: [],
    prerequisites: [],
    ...overrides,
  }
}

/** Catalogue couvrant, par défaut, tous les items référencés par les cartes fournies. */
export function makeCatalog(
  input: {
    words?: readonly Word[]
    grammarPoints?: readonly GrammarPoint[]
    cards?: readonly Card[]
  } = {},
): ContentCatalog {
  const words = new Map((input.words ?? []).map((w) => [w.id, w]))
  const grammarPoints = new Map((input.grammarPoints ?? []).map((g) => [g.id, g]))
  for (const card of input.cards ?? []) {
    if (card.itemType === 'word' && !words.has(card.itemId)) {
      words.set(card.itemId, makeWord({ id: card.itemId }))
    }
    if (card.itemType === 'grammar' && !grammarPoints.has(card.itemId)) {
      grammarPoints.set(card.itemId, makeGrammarPoint({ id: card.itemId }))
    }
  }
  return buildCatalog({
    words: [...words.values()],
    grammarPoints: [...grammarPoints.values()],
    lessons: [],
  })
}

export function makeDump(overrides: Partial<UserDataDump> = {}): UserDataDump {
  return {
    cards: [],
    events: [],
    userProgress: makeProgress(),
    settings: makeSettings(),
    meta: {},
    ...overrides,
  }
}
