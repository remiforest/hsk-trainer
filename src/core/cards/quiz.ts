/**
 * Construction des exercices affichés en session, à partir d'une carte et du
 * catalogue. Pur ; l'aléatoire est injecté (`rng`) pour rester testable.
 */

import { type ContentCatalog, type Example, type Word } from '../../types/content'
import { parseCardId, type CardId } from '../../types/ids'
import { type Card } from '../../types/srs'

export type Rng = () => number

export function shuffle<T>(arr: readonly T[], rng: Rng): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = a[i]!
    a[i] = a[j]!
    a[j] = tmp
  }
  return a
}

export function wordOfCard(card: Card, catalog: ContentCatalog): Word | null {
  const { itemType, itemId } = parseCardId(card.id)
  return itemType === 'word' ? (catalog.words.get(itemId) ?? null) : null
}

export interface RevealContent {
  hanzi: string
  pinyin: string
  sense: string
  examples: Example[]
}

export function revealContent(card: Card, catalog: ContentCatalog): RevealContent | null {
  const word = wordOfCard(card, catalog)
  if (!word) {
    return null
  }
  return { hanzi: word.hanzi, pinyin: word.pinyin, sense: word.fr, examples: word.exemples }
}

export type PromptKind = 'hanzi' | 'sense' | 'audio'

export interface ChoiceOption {
  id: string
  label: string
  lang: 'fr' | 'zh'
  /** contenu complet du mot, pour l'écran de correction (audio, pinyin, sens) */
  hanzi: string
  pinyin: string
  sense: string
}

export interface ChoiceQuestion {
  cardId: CardId
  promptKind: PromptKind
  promptHanzi: string
  promptPinyin: string
  promptSense: string
  options: ChoiceOption[]
  correctId: string
}

/** QCM pour hanzi→sens, sens→hanzi, audio→sens. `null` pour les autres types. */
export function buildChoiceQuestion(
  card: Card,
  catalog: ContentCatalog,
  rng: Rng,
  optionCount = 4,
): ChoiceQuestion | null {
  const word = wordOfCard(card, catalog)
  if (!word) {
    return null
  }
  if (
    card.cardType !== 'hanzi_to_sense' &&
    card.cardType !== 'sense_to_hanzi' &&
    card.cardType !== 'audio_to_sense'
  ) {
    return null
  }

  const isSenseToHanzi = card.cardType === 'sense_to_hanzi'
  const label = (w: Word): string => (isSenseToHanzi ? w.hanzi : w.fr)

  const themeSet = new Set(word.themes)
  const pool = [...catalog.words.values()].filter(
    (w) => w.id !== word.id && w.niveauHsk === word.niveauHsk,
  )
  const sameTheme = pool.filter((w) => w.themes.some((t) => themeSet.has(t)))
  const others = pool.filter((w) => !w.themes.some((t) => themeSet.has(t)))
  const ranked = [...shuffle(sameTheme, rng), ...shuffle(others, rng)]

  const seenLabels = new Set([label(word)])
  const distractors: Word[] = []
  for (const w of ranked) {
    const l = label(w)
    if (seenLabels.has(l)) {
      continue
    }
    seenLabels.add(l)
    distractors.push(w)
    if (distractors.length === optionCount - 1) {
      break
    }
  }

  const optionWords = shuffle([word, ...distractors], rng)
  return {
    cardId: card.id,
    promptKind: card.cardType === 'audio_to_sense' ? 'audio' : isSenseToHanzi ? 'sense' : 'hanzi',
    promptHanzi: word.hanzi,
    promptPinyin: word.pinyin,
    promptSense: word.fr,
    options: optionWords.map((w) => ({
      id: w.id,
      label: label(w),
      lang: isSenseToHanzi ? 'zh' : 'fr',
      hanzi: w.hanzi,
      pinyin: w.pinyin,
      sense: w.fr,
    })),
    correctId: word.id,
  }
}

export interface PinyinQuestion {
  cardId: CardId
  hanzi: string
  sense: string
  referencePinyin: string
}

/** Exercice hanzi→pinyin (saisie). `null` pour les autres types. */
export function buildPinyinQuestion(card: Card, catalog: ContentCatalog): PinyinQuestion | null {
  if (card.cardType !== 'hanzi_to_pinyin') {
    return null
  }
  const word = wordOfCard(card, catalog)
  if (!word) {
    return null
  }
  return { cardId: card.id, hanzi: word.hanzi, sense: word.fr, referencePinyin: word.pinyin }
}
