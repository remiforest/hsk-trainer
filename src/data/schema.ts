/**
 * Schémas Zod du **contenu pédagogique** (`src/data/*.json`). Distincts des
 * schémas de `src/db/schemas.ts` (données utilisateur). Utilisés par
 * `npm run validate:data` et par le chargeur `src/data/index.ts`.
 */

import { z } from 'zod'

/** Catégories grammaticales autorisées (français). */
export const CATEGORIES = [
  'pronom',
  'nom',
  'nom propre',
  'verbe',
  'verbe modal',
  'adjectif',
  'adverbe',
  'numéral',
  'classificateur',
  'préposition',
  'conjonction',
  'particule',
  'interjection',
  'expression',
  'localisateur',
  'déterminant',
] as const

const nonEmpty = z.string().trim().min(1)

export const exampleSchema = z.object({
  hanzi: nonEmpty,
  pinyin: nonEmpty,
  fr: nonEmpty,
})

export const wordSchema = z.object({
  id: z.string().regex(/^w-\d{4}$/, 'id attendu au format w-0001'),
  hanzi: nonEmpty,
  pinyin: nonEmpty,
  fr: nonEmpty,
  niveauHsk: z.union([z.literal(1), z.literal(2)]),
  categorieGrammaticale: z.enum(CATEGORIES),
  themes: z.array(nonEmpty).min(1),
  exemples: z.array(exampleSchema),
})

export const grammarPointSchema = z.object({
  id: z.string().regex(/^g-\d{3}$/, 'id attendu au format g-001'),
  titre: nonEmpty,
  explicationFr: nonEmpty,
  structure: nonEmpty,
  exemples: z.array(exampleSchema).min(1),
  niveauHsk: z.union([z.literal(1), z.literal(2)]),
})

export const lessonSchema = z.object({
  id: z.string().regex(/^l-\d{3}$/, 'id attendu au format l-001'),
  titre: nonEmpty,
  ordre: z.number().int().positive(),
  objectif: nonEmpty,
  niveauHsk: z.union([z.literal(1), z.literal(2)]),
  wordIds: z.array(z.string()),
  grammarPointIds: z.array(z.string()),
  prerequisites: z.array(z.string()),
})

export const wordsFileSchema = z.array(wordSchema)
export const grammarFileSchema = z.array(grammarPointSchema)
export const lessonsFileSchema = z.array(lessonSchema)
