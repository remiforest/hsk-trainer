/**
 * Validation du contenu pédagogique (`src/data/**`).
 *
 * Vérifie : conformité au schéma, unicité des identifiants, format du pinyin
 * (diacritiques valides, une syllabe par caractère), cohérence des références
 * entre leçons / mots / grammaire, absence de cycle dans les prérequis,
 * complétude des traductions, couverture des mots et points de grammaire.
 *
 * Sortie : code 1 s'il y a au moins une **erreur** ; les **avertissements**
 * n'échouent pas (sauf `--strict`).
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { grammarFileSchema, lessonsFileSchema, wordsFileSchema } from '../src/data/schema'
import { countSyllables, validatePinyin } from '../src/core/pinyin/normalize'
import type { Example, GrammarPoint, Lesson, Word } from '../src/types/content'

const STRICT = process.argv.includes('--strict')
const DATA_DIR = resolve(import.meta.dirname, '..', 'src', 'data', 'hsk1')
const EXPECTED_HSK1_COUNT = 150

const errors: string[] = []
const warnings: string[] = []
const err = (m: string): void => void errors.push(m)
const warn = (m: string): void => void warnings.push(m)

function readJson(name: string): unknown {
  return JSON.parse(readFileSync(resolve(DATA_DIR, name), 'utf8'))
}

// --- Chargement + schéma ---------------------------------------------------

const wordsParsed = wordsFileSchema.safeParse(readJson('words.json'))
const grammarParsed = grammarFileSchema.safeParse(readJson('grammar.json'))
const lessonsParsed = lessonsFileSchema.safeParse(readJson('lessons.json'))

for (const [label, res] of [
  ['words.json', wordsParsed],
  ['grammar.json', grammarParsed],
  ['lessons.json', lessonsParsed],
] as const) {
  if (!res.success) {
    for (const issue of res.error.issues.slice(0, 40)) {
      err(`${label} : ${issue.path.join('.') || '(racine)'} — ${issue.message}`)
    }
  }
}

if (!wordsParsed.success || !grammarParsed.success || !lessonsParsed.success) {
  report()
}

const words: Word[] = wordsParsed.success ? wordsParsed.data : []
const grammar: GrammarPoint[] = grammarParsed.success ? grammarParsed.data : []
const lessons: Lesson[] = lessonsParsed.success ? lessonsParsed.data : []

// --- Unicité -------------------------------------------------------------

function assertUnique(label: string, ids: string[]): void {
  const seen = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) {
      err(`${label} : identifiant en double « ${id} »`)
    }
    seen.add(id)
  }
}
assertUnique(
  'words',
  words.map((w) => w.id),
)
assertUnique(
  'grammar',
  grammar.map((g) => g.id),
)
assertUnique(
  'lessons',
  lessons.map((l) => l.id),
)

const hanziSeen = new Map<string, string>()
for (const w of words) {
  const prev = hanziSeen.get(w.hanzi)
  if (prev) {
    warn(`words : le hanzi « ${w.hanzi} » apparaît pour ${prev} et ${w.id}`)
  }
  hanziSeen.set(w.hanzi, w.id)
}

// --- Pinyin -------------------------------------------------------------

const CJK = /\p{Script=Han}/u
const ERHUA = '儿'

function countHanzi(s: string): number {
  return [...s].filter((c) => CJK.test(c)).length
}

/** Nombre de syllabes attendu pour un hanzi, en tenant compte de l'érisation (儿). */
function expectedSyllables(hanzi: string): number[] {
  const total = countHanzi(hanzi)
  const erhua = [...hanzi].filter((c) => c === ERHUA).length
  // 儿 érisé ne compte pas comme une syllabe ; 儿 lexical (rare ici) si.
  return erhua > 0 ? [total, total - erhua] : [total]
}

function checkPinyin(context: string, hanzi: string, pinyin: string): void {
  const v = validatePinyin(pinyin)
  if (!v.valid) {
    err(`${context} : pinyin « ${pinyin} » invalide — ${v.errors.join(' ; ')}`)
    return
  }
  const got = countSyllables(pinyin)
  const expected = expectedSyllables(hanzi)
  if (!expected.includes(got)) {
    err(
      `${context} : ${got} syllabe(s) de pinyin pour ${countHanzi(hanzi)} caractère(s) ` +
        `(« ${hanzi} » / « ${pinyin} »)`,
    )
  }
}

function checkExamples(context: string, examples: Example[]): void {
  examples.forEach((ex, i) => {
    const c = `${context} · exemple ${i + 1}`
    if (!ex.fr.trim()) {
      err(`${c} : traduction française vide`)
    }
    const v = validatePinyin(ex.pinyin)
    if (!v.valid) {
      err(`${c} : pinyin « ${ex.pinyin} » invalide — ${v.errors.join(' ; ')}`)
      return
    }
    const got = countSyllables(ex.pinyin)
    const expected = expectedSyllables(ex.hanzi)
    if (!expected.includes(got)) {
      warn(
        `${c} : ${got} syllabe(s) pour ${countHanzi(ex.hanzi)} caractère(s) ` +
          `(« ${ex.hanzi} » / « ${ex.pinyin} »)`,
      )
    }
  })
}

for (const w of words) {
  checkPinyin(`word ${w.id}`, w.hanzi, w.pinyin)
  if (w.exemples.length === 0) {
    warn(`word ${w.id} : aucun exemple`)
  }
  checkExamples(`word ${w.id}`, w.exemples)
}
for (const g of grammar) {
  checkExamples(`grammar ${g.id}`, g.exemples)
}

// --- Références leçons -------------------------------------------------

const wordIds = new Set(words.map((w) => w.id))
const grammarIds = new Set(grammar.map((g) => g.id))
const lessonIds = new Set(lessons.map((l) => l.id))
const wordCoverage = new Set<string>()
const grammarCoverage = new Set<string>()

for (const l of lessons) {
  for (const wid of l.wordIds) {
    if (!wordIds.has(wid)) {
      err(`lesson ${l.id} : wordId inconnu « ${wid} »`)
    } else {
      wordCoverage.add(wid)
    }
  }
  for (const gid of l.grammarPointIds) {
    if (!grammarIds.has(gid)) {
      err(`lesson ${l.id} : grammarPointId inconnu « ${gid} »`)
    } else {
      grammarCoverage.add(gid)
    }
  }
  for (const pid of l.prerequisites) {
    if (!lessonIds.has(pid)) {
      err(`lesson ${l.id} : prérequis inconnu « ${pid} »`)
    }
  }
}

// ordre unique et contigu
const ordres = lessons.map((l) => l.ordre).sort((a, b) => a - b)
assertUnique(
  'lessons.ordre',
  ordres.map((o) => String(o)),
)
ordres.forEach((o, i) => {
  if (o !== i + 1) {
    warn(
      `lessons : la suite des « ordre » n'est pas 1..N contiguë (trouvé ${o} en position ${i + 1})`,
    )
  }
})

// prérequis : pas de cycle, et antériorité de l'ordre
const ordreById = new Map(lessons.map((l) => [l.id, l.ordre]))
for (const l of lessons) {
  for (const pid of l.prerequisites) {
    const po = ordreById.get(pid)
    if (po !== undefined && po >= l.ordre) {
      warn(
        `lesson ${l.id} : le prérequis ${pid} (ordre ${po}) n'est pas antérieur (ordre ${l.ordre})`,
      )
    }
  }
}
detectCycles(lessons)

function detectCycles(all: Lesson[]): void {
  const byId = new Map(all.map((l) => [l.id, l]))
  const state = new Map<string, 'visiting' | 'done'>()
  const walk = (id: string, stack: string[]): void => {
    if (state.get(id) === 'done') return
    if (state.get(id) === 'visiting') {
      err(`lessons : cycle de prérequis ${[...stack, id].join(' -> ')}`)
      return
    }
    state.set(id, 'visiting')
    for (const pid of byId.get(id)?.prerequisites ?? []) {
      if (byId.has(pid)) {
        walk(pid, [...stack, id])
      }
    }
    state.set(id, 'done')
  }
  for (const l of all) {
    walk(l.id, [])
  }
}

// --- Couverture -------------------------------------------------------

for (const w of words) {
  if (!wordCoverage.has(w.id)) {
    warn(`word ${w.id} (« ${w.hanzi} ») n'apparaît dans aucune leçon`)
  }
}
for (const g of grammar) {
  if (!grammarCoverage.has(g.id)) {
    warn(`grammar ${g.id} (« ${g.titre} ») n'apparaît dans aucune leçon`)
  }
}

const hsk1 = words.filter((w) => w.niveauHsk === 1).length
if (hsk1 !== EXPECTED_HSK1_COUNT) {
  warn(
    `nombre de mots HSK 1 = ${hsk1} (attendu ${EXPECTED_HSK1_COUNT}). ` +
      'Liste à réconcilier avec une source officielle HSK 2.0 — voir docs/a-verifier.md.',
  )
}

report()

// --- Rapport ---------------------------------------------------------

function report(): never {
  console.log(
    `validate:data — ${words.length} mots, ${grammar.length} points de grammaire, ${lessons.length} leçons`,
  )
  for (const w of warnings) {
    console.log(`  ⚠ ${w}`)
  }
  for (const e of errors) {
    console.log(`  ✗ ${e}`)
  }
  if (errors.length > 0) {
    console.log(`\n${errors.length} erreur(s), ${warnings.length} avertissement(s). ÉCHEC.`)
    process.exit(1)
  }
  if (warnings.length > 0 && STRICT) {
    console.log(`\n${warnings.length} avertissement(s) en mode --strict. ÉCHEC.`)
    process.exit(1)
  }
  console.log(`\nOK (${warnings.length} avertissement(s)).`)
  process.exit(0)
}
