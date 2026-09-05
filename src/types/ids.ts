/**
 * Identifiants typés (branded types). Un `CardId` n'est pas interchangeable avec
 * une `string` quelconque : il faut passer par `makeCardId` / `parseCardId`.
 */

export type ItemType = 'word' | 'grammar'

export type CardType =
  | 'hanzi_to_sense'
  | 'sense_to_hanzi'
  | 'hanzi_to_pinyin'
  | 'audio_to_sense'
  | 'grammar_fill'
  | 'grammar_order'

const WORD_CARD_TYPES: readonly CardType[] = [
  'hanzi_to_sense',
  'sense_to_hanzi',
  'hanzi_to_pinyin',
  'audio_to_sense',
]

const GRAMMAR_CARD_TYPES: readonly CardType[] = ['grammar_fill', 'grammar_order']

export function cardTypesFor(itemType: ItemType): readonly CardType[] {
  return itemType === 'word' ? WORD_CARD_TYPES : GRAMMAR_CARD_TYPES
}

export function isCardTypeValidFor(itemType: ItemType, cardType: CardType): boolean {
  return cardTypesFor(itemType).includes(cardType)
}

declare const brand: unique symbol

/** `` `${itemType}:${itemId}:${cardType}` `` — déterministe, stable à l'import et au rejeu. */
export type CardId = string & { readonly [brand]: 'CardId' }

/** UUID v4 d'un événement du journal. */
export type EventId = string & { readonly [brand]: 'EventId' }

/** UUID v4 d'une session de révision. */
export type SessionId = string & { readonly [brand]: 'SessionId' }

const ITEM_ID_RE = /^[a-z0-9-]+$/

export function makeCardId(itemType: ItemType, itemId: string, cardType: CardType): CardId {
  if (!ITEM_ID_RE.test(itemId)) {
    throw new Error(`itemId invalide « ${itemId} » (attendu : ${ITEM_ID_RE.source})`)
  }
  if (!isCardTypeValidFor(itemType, cardType)) {
    throw new Error(`cardType « ${cardType} » incompatible avec itemType « ${itemType} »`)
  }
  return `${itemType}:${itemId}:${cardType}` as CardId
}

export interface ParsedCardId {
  itemType: ItemType
  itemId: string
  cardType: CardType
}

export function parseCardId(id: string): ParsedCardId {
  const parts = id.split(':')
  if (parts.length !== 3) {
    throw new Error(`CardId malformé « ${id} »`)
  }
  const [itemType, itemId, cardType] = parts as [string, string, string]
  if (itemType !== 'word' && itemType !== 'grammar') {
    throw new Error(`itemType inconnu dans « ${id} »`)
  }
  if (!isCardType(cardType) || !isCardTypeValidFor(itemType, cardType)) {
    throw new Error(`cardType inconnu ou incompatible dans « ${id} »`)
  }
  return { itemType, itemId, cardType }
}

export function isCardId(value: string): value is CardId {
  try {
    parseCardId(value)
    return true
  } catch {
    return false
  }
}

function isCardType(value: string): value is CardType {
  return (
    value === 'hanzi_to_sense' ||
    value === 'sense_to_hanzi' ||
    value === 'hanzi_to_pinyin' ||
    value === 'audio_to_sense' ||
    value === 'grammar_fill' ||
    value === 'grammar_order'
  )
}

export function newEventId(): EventId {
  return crypto.randomUUID() as EventId
}

export function newSessionId(): SessionId {
  return crypto.randomUUID() as SessionId
}
