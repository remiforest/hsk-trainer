/**
 * Choix du type d'exercice à présenter pour une carte, et assemblage du contenu
 * de révélation. Pur — l'aléatoire (distracteurs) est injecté. Le rendu est un
 * `switch` sur `Exercise['kind']` dans `SessionScreen` (ADR 0004).
 */

import {
  buildChoiceQuestion,
  buildPinyinQuestion,
  revealContent,
  type ChoiceQuestion,
  type PinyinQuestion,
  type Rng,
} from '../../core/cards/quiz'
import { type ContentCatalog, type Example } from '../../types/content'
import { type Card } from '../../types/srs'

export interface WordReveal {
  kind: 'word'
  /** ce qui est affiché avant la révélation */
  promptKind: 'hanzi' | 'audio' | 'sense'
  hanzi: string
  pinyin: string
  sense: string
  examples: Example[]
}

export interface GrammarReveal {
  kind: 'grammar'
  titre: string
  structure: string
  explicationFr: string
  examples: Example[]
}

export type RevealPrompt = WordReveal | GrammarReveal

export type Exercise =
  | { kind: 'choice'; question: ChoiceQuestion }
  | { kind: 'pinyin'; question: PinyinQuestion }
  | { kind: 'reveal'; prompt: RevealPrompt }

export function buildRevealPrompt(card: Card, catalog: ContentCatalog): RevealPrompt {
  if (card.itemType === 'grammar') {
    const g = catalog.grammarPoints.get(card.itemId)
    return {
      kind: 'grammar',
      titre: g?.titre ?? card.itemId,
      structure: g?.structure ?? '',
      explicationFr: g?.explicationFr ?? '',
      examples: g?.exemples ?? [],
    }
  }
  const content = revealContent(card, catalog)
  const promptKind: WordReveal['promptKind'] =
    card.cardType === 'audio_to_sense'
      ? 'audio'
      : card.cardType === 'sense_to_hanzi'
        ? 'sense'
        : 'hanzi'
  return {
    kind: 'word',
    promptKind,
    hanzi: content?.hanzi ?? card.itemId,
    pinyin: content?.pinyin ?? '',
    sense: content?.sense ?? '',
    examples: content?.examples ?? [],
  }
}

/**
 * - `sense_to_hanzi` → QCM (options en hanzi) ;
 * - `hanzi_to_pinyin` → saisie clavier ;
 * - `hanzi_to_sense` / `audio_to_sense` / cartes de grammaire → révélation + auto-notation.
 *
 * Repli sur la révélation si le QCM ne peut pas être construit (catalogue trop
 * petit pour tirer des distracteurs).
 */
export function buildExercise(card: Card, catalog: ContentCatalog, rng: Rng): Exercise {
  if (card.cardType === 'sense_to_hanzi') {
    const question = buildChoiceQuestion(card, catalog, rng)
    if (question) {
      return { kind: 'choice', question }
    }
  }
  if (card.cardType === 'hanzi_to_pinyin') {
    const question = buildPinyinQuestion(card, catalog)
    if (question) {
      return { kind: 'pinyin', question }
    }
  }
  return { kind: 'reveal', prompt: buildRevealPrompt(card, catalog) }
}
