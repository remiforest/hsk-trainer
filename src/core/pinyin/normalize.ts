/**
 * Normalisation du pinyin : conversion des chiffres de ton (« ni3 hao3 ») en
 * diacritiques (« nǐ hǎo »), lecture des deux formes, et outils de validation.
 *
 * Règle de placement du ton (norme standard) :
 *  1. s'il y a un `a`, il porte le ton ;
 *  2. sinon s'il y a un `e`, il porte le ton ;
 *  3. sinon dans « ou », c'est le `o` ;
 *  4. sinon c'est la dernière voyelle.
 */

export type Tone = 0 | 1 | 2 | 3 | 4

export interface Syllable {
  /** base sans diacritique ni chiffre, minuscule, `ü` normalisé */
  base: string
  tone: Tone
}

const TONE_VOWELS: Record<string, readonly [string, string, string, string]> = {
  a: ['ā', 'á', 'ǎ', 'à'],
  e: ['ē', 'é', 'ě', 'è'],
  i: ['ī', 'í', 'ǐ', 'ì'],
  o: ['ō', 'ó', 'ǒ', 'ò'],
  u: ['ū', 'ú', 'ǔ', 'ù'],
  ü: ['ǖ', 'ǘ', 'ǚ', 'ǜ'],
}

const ACCENT_TO_PLAIN = new Map<string, { plain: string; tone: Tone }>()
for (const [plain, accents] of Object.entries(TONE_VOWELS)) {
  accents.forEach((ch, idx) => {
    ACCENT_TO_PLAIN.set(ch, { plain, tone: (idx + 1) as Tone })
  })
}

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u', 'ü'])

/** Remplace `v` et `u:` par `ü`, met en minuscules, retire les espaces superflus. */
export function canonicalizeRaw(input: string): string {
  return input.normalize('NFC').toLowerCase().replace(/u:/g, 'ü').replace(/v/g, 'ü').trim()
}

function findToneVowelIndex(base: string): number {
  const chars = [...base]
  const a = chars.indexOf('a')
  if (a !== -1) return a
  const e = chars.indexOf('e')
  if (e !== -1) return e
  const ou = base.indexOf('ou')
  if (ou !== -1) return ou // le `o`
  for (let i = chars.length - 1; i >= 0; i -= 1) {
    if (VOWELS.has(chars[i]!)) return i
  }
  return -1
}

/** Applique un ton à une base sans diacritique. */
export function applyTone(base: string, tone: Tone): string {
  if (tone === 0) return base
  const idx = findToneVowelIndex(base)
  if (idx === -1) return base
  const chars = [...base]
  const vowel = chars[idx]!
  const table = TONE_VOWELS[vowel]
  const marked = table?.[tone - 1]
  if (marked === undefined) return base
  chars[idx] = marked
  return chars.join('')
}

export class PinyinParseError extends Error {}

/** Analyse une syllabe isolée (« hao3 », « hǎo », « hao », « ma5 »). */
export function parseSyllable(token: string): Syllable {
  const raw = canonicalizeRaw(token)
  if (raw === '') {
    throw new PinyinParseError('syllabe vide')
  }

  const digitMatch = /(\d)$/.exec(raw)
  if (digitMatch) {
    const digit = Number(digitMatch[1])
    if (digit < 0 || digit > 5) {
      throw new PinyinParseError(`chiffre de ton invalide dans « ${token} »`)
    }
    const base = raw.slice(0, -1)
    if (/\d/.test(base)) {
      throw new PinyinParseError(`plusieurs chiffres de ton dans « ${token} »`)
    }
    assertPlainBase(base, token)
    return { base, tone: (digit === 5 ? 0 : digit) as Tone }
  }

  // pas de chiffre : cherche un diacritique
  let tone: Tone = 0
  let base = ''
  let accents = 0
  for (const ch of raw) {
    const mapped = ACCENT_TO_PLAIN.get(ch)
    if (mapped) {
      accents += 1
      tone = mapped.tone
      base += mapped.plain
    } else {
      base += ch
    }
  }
  if (accents > 1) {
    throw new PinyinParseError(`plusieurs diacritiques dans « ${token} »`)
  }
  assertPlainBase(base, token)
  return { base, tone }
}

function assertPlainBase(base: string, token: string): void {
  if (base === '' || !/^[a-zü]+$/.test(base)) {
    throw new PinyinParseError(`syllabe non reconnue : « ${token} »`)
  }
  if (![...base].some((c) => VOWELS.has(c))) {
    throw new PinyinParseError(`syllabe sans voyelle : « ${token} »`)
  }
}

/** Découpe une chaîne pinyin en syllabes. Gère « ni3hao3 », « ni3 hao3 », « nǐ hǎo ». */
export function splitSyllables(input: string): string[] {
  const raw = canonicalizeRaw(input)
  if (raw === '') return []
  // séparateurs : espaces, apostrophes, tirets, et ponctuation courante des phrases
  const SEP = /[\s'’,，.。;；:：、!！?？·-]+/
  if (/\d/.test(raw)) {
    // mode chiffres : coupe aussi après chaque chiffre de ton
    return raw
      .split(new RegExp(`(?<=\\d)|${SEP.source}`))
      .map((s) => s.trim())
      .filter((s) => s !== '')
  }
  return raw.split(SEP).filter((s) => s !== '')
}

export interface ParsedPinyin {
  syllables: Syllable[]
  /** forme canonique avec diacritiques, syllabes séparées par une espace */
  normalized: string
}

export function parsePinyin(input: string): ParsedPinyin {
  const syllables = splitSyllables(input).map(parseSyllable)
  return {
    syllables,
    normalized: syllables.map((s) => applyTone(s.base, s.tone)).join(' '),
  }
}

/** Convertit une saisie en pinyin à diacritiques. Lève `PinyinParseError` si invalide. */
export function normalizePinyin(input: string): string {
  return parsePinyin(input).normalized
}

export function countSyllables(input: string): number {
  return splitSyllables(input).length
}

export interface PinyinValidation {
  valid: boolean
  errors: string[]
  syllables: Syllable[]
}

/** Validation tolérante utilisée par `validate:data` (étape 4). */
export function validatePinyin(input: string): PinyinValidation {
  try {
    const { syllables } = parsePinyin(input)
    const errors: string[] = []
    if (syllables.length === 0) {
      errors.push('pinyin vide')
    }
    if (/\d/.test(input)) {
      errors.push('le pinyin de référence doit utiliser des diacritiques, pas des chiffres')
    }
    return { valid: errors.length === 0, errors, syllables }
  } catch (err) {
    const message = err instanceof PinyinParseError ? err.message : 'pinyin illisible'
    return { valid: false, errors: [message], syllables: [] }
  }
}
