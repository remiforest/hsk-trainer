/**
 * Chargeur du contenu pédagogique. Valide les fichiers JSON avec les schémas Zod
 * au premier accès (mémoïsé), puis expose un `ContentCatalog` prêt pour la
 * logique métier.
 */

import {
  buildCatalog,
  type ContentCatalog,
  type GrammarPoint,
  type Lesson,
  type Word,
} from '../types/content'
import { grammarFileSchema, lessonsFileSchema, wordsFileSchema } from './schema'
import { CONTENT_VERSION } from './version'
import hsk1WordsRaw from './hsk1/words.json'
import hsk1GrammarRaw from './hsk1/grammar.json'
import hsk1LessonsRaw from './hsk1/lessons.json'

export { CONTENT_VERSION }

export interface LoadedContent {
  words: Word[]
  grammarPoints: GrammarPoint[]
  lessons: Lesson[]
  catalog: ContentCatalog
}

let cache: LoadedContent | null = null

export function loadContent(): LoadedContent {
  if (cache) {
    return cache
  }
  const words = wordsFileSchema.parse(hsk1WordsRaw) as Word[]
  const grammarPoints = grammarFileSchema.parse(hsk1GrammarRaw) as GrammarPoint[]
  const lessons = lessonsFileSchema.parse(hsk1LessonsRaw) as Lesson[]
  cache = {
    words,
    grammarPoints,
    lessons,
    catalog: buildCatalog({ words, grammarPoints, lessons }),
  }
  return cache
}

export function getCatalog(): ContentCatalog {
  return loadContent().catalog
}
