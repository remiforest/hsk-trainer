import { type HskDatabase } from '../db'
import { type CardId } from '../../types/ids'
import { type Card } from '../../types/srs'

export async function getCard(db: HskDatabase, id: CardId): Promise<Card | undefined> {
  return db.cards.get(id)
}

export async function getAllCards(db: HskDatabase): Promise<Card[]> {
  return db.cards.toArray()
}

export async function countCards(db: HskDatabase): Promise<number> {
  return db.cards.count()
}

export async function putCard(db: HskDatabase, card: Card): Promise<void> {
  await db.cards.put(card)
}

export async function bulkPutCards(db: HskDatabase, cards: readonly Card[]): Promise<void> {
  await db.cards.bulkPut(cards)
}

export async function clearCards(db: HskDatabase): Promise<void> {
  await db.cards.clear()
}
