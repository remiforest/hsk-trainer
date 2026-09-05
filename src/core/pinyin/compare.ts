/**
 * Comparaison d'une réponse pinyin à la référence, tolérante sur la forme
 * (espaces, casse, `v`/`ü`, apostrophes) mais **stricte sur les tons**.
 *
 * Conformément à l'ADR 0004 : une réponse sans aucun chiffre/diacritique de ton
 * est considérée incorrecte et signalée « ton manquant ».
 */

import { parseSyllable, PinyinParseError, splitSyllables, type Syllable } from './normalize'

export interface SyllableComparison {
  expected: Syllable
  got: Syllable | null
  baseOk: boolean
  toneOk: boolean
}

export interface PinyinComparison {
  correct: boolean
  /** la base (syllabe sans ton) est bonne partout */
  basesOk: boolean
  /** nombre de syllabes dont la base est correcte mais le ton faux */
  toneErrors: number
  /** nombre de syllabes dont la base est fausse */
  baseErrors: number
  /** l'utilisateur n'a marqué aucun ton alors que la référence en a */
  missingTone: boolean
  /** le nombre de syllabes ne correspond pas */
  lengthMismatch: boolean
  detail: SyllableComparison[]
}

function hasAnyToneMark(input: string): boolean {
  return /[0-9]/.test(input) || /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/i.test(input.normalize('NFC'))
}

function safeParse(token: string): Syllable | null {
  try {
    return parseSyllable(token)
  } catch (err) {
    if (err instanceof PinyinParseError) return null
    throw err
  }
}

export function comparePinyin(userInput: string, reference: string): PinyinComparison {
  const expected = splitSyllables(reference).map((t) => {
    const s = safeParse(t)
    if (!s) throw new PinyinParseError(`référence pinyin invalide : « ${reference} »`)
    return s
  })
  const gotTokens = splitSyllables(userInput)
  const got = gotTokens.map(safeParse)

  const referenceHasTones = expected.some((s) => s.tone !== 0)
  const missingTone = referenceHasTones && !hasAnyToneMark(userInput)

  const detail: SyllableComparison[] = expected.map((exp, i) => {
    const g = got[i] ?? null
    const baseOk = g !== null && g.base === exp.base
    const toneOk = g !== null && g.tone === exp.tone
    return { expected: exp, got: g, baseOk, toneOk }
  })

  const lengthMismatch = got.length !== expected.length
  const baseErrors = detail.filter((d) => !d.baseOk).length
  const toneErrors = detail.filter((d) => d.baseOk && !d.toneOk).length
  const basesOk = baseErrors === 0 && !lengthMismatch

  const correct =
    !lengthMismatch &&
    !missingTone &&
    detail.every((d) => d.baseOk && d.toneOk) &&
    got.every((g) => g !== null)

  return {
    correct,
    basesOk,
    toneErrors,
    baseErrors,
    missingTone,
    lengthMismatch,
    detail,
  }
}
