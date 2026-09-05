/**
 * Contenu pédagogique. Ces objets vivent dans `src/data/*.json` (séparés du code)
 * et sont validés par `npm run validate:data`. Ils ne sont **pas** stockés dans
 * IndexedDB : seul l'état utilisateur l'est. Le catalogue est injecté dans la
 * logique `core/` pour rester pur.
 */

import { type ItemType } from './ids'

export type HskLevel = 1 | 2

export interface Example {
  hanzi: string
  pinyin: string
  fr: string
}

export interface Word {
  id: string
  hanzi: string
  pinyin: string
  fr: string
  niveauHsk: HskLevel
  categorieGrammaticale: string
  themes: string[]
  exemples: Example[]
}

export interface GrammarPoint {
  id: string
  titre: string
  explicationFr: string
  structure: string
  exemples: Example[]
  niveauHsk: HskLevel
}

export interface Lesson {
  id: string
  titre: string
  ordre: number
  objectif: string
  niveauHsk: HskLevel
  wordIds: string[]
  grammarPointIds: string[]
  prerequisites: string[]
}

/** Vue indexée du contenu, passée à la logique métier. */
export interface ContentCatalog {
  words: ReadonlyMap<string, Word>
  grammarPoints: ReadonlyMap<string, GrammarPoint>
  lessons: ReadonlyMap<string, Lesson>
}

export function buildCatalog(input: {
  words: readonly Word[]
  grammarPoints: readonly GrammarPoint[]
  lessons: readonly Lesson[]
}): ContentCatalog {
  return {
    words: new Map(input.words.map((w) => [w.id, w])),
    grammarPoints: new Map(input.grammarPoints.map((g) => [g.id, g])),
    lessons: new Map(input.lessons.map((l) => [l.id, l])),
  }
}

export function catalogHas(catalog: ContentCatalog, itemType: ItemType, itemId: string): boolean {
  return itemType === 'word' ? catalog.words.has(itemId) : catalog.grammarPoints.has(itemId)
}
