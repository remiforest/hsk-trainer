/**
 * Génération des cartes de révision à partir du contenu. Pur : renvoie des
 * `Card` neuves (état initial via le scheduler), sans persistance.
 *
 * Un mot produit jusqu'à 4 cartes (hanzi→sens, sens→hanzi, hanzi→pinyin,
 * audio→sens). Un point de grammaire produit 2 cartes (compléter, remettre en
 * ordre).
 */

import { type ContentCatalog, type GrammarPoint, type Word } from '../../types/content'
import { cardTypesFor, type CardType, type ItemType } from '../../types/ids'
import { type Card } from '../../types/srs'
import { createInitialCard } from '../srs/scheduler'

export interface GenerateOptions {
  /** restreindre aux types de cartes indiqués (défaut : tous ceux du type d'item) */
  cardTypes?: readonly CardType[]
}

function typesFor(itemType: ItemType, opts?: GenerateOptions): CardType[] {
  const all = cardTypesFor(itemType)
  if (!opts?.cardTypes) {
    return [...all]
  }
  const wanted = new Set(opts.cardTypes)
  return all.filter((t) => wanted.has(t))
}

export function generateCardsForWord(word: Word, now: number, opts?: GenerateOptions): Card[] {
  return typesFor('word', opts).map((cardType) =>
    createInitialCard({ itemType: 'word', itemId: word.id, cardType, now }),
  )
}

export function generateCardsForGrammar(
  point: GrammarPoint,
  now: number,
  opts?: GenerateOptions,
): Card[] {
  return typesFor('grammar', opts).map((cardType) =>
    createInitialCard({ itemType: 'grammar', itemId: point.id, cardType, now }),
  )
}

export function generateCardsForLesson(
  input: { wordIds: readonly string[]; grammarPointIds: readonly string[] },
  catalog: ContentCatalog,
  now: number,
  opts?: GenerateOptions,
): Card[] {
  const cards: Card[] = []
  for (const id of input.wordIds) {
    const word = catalog.words.get(id)
    if (word) {
      cards.push(...generateCardsForWord(word, now, opts))
    }
  }
  for (const id of input.grammarPointIds) {
    const point = catalog.grammarPoints.get(id)
    if (point) {
      cards.push(...generateCardsForGrammar(point, now, opts))
    }
  }
  return cards
}
