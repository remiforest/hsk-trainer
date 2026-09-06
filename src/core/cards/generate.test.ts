import { makeCatalog, makeGrammarPoint, makeWord } from '../../test/factories'
import { generateCardsForLesson, generateCardsForWord } from './generate'

const T0 = Date.UTC(2026, 0, 1, 8, 0, 0)

describe('generateCardsForWord', () => {
  it('produit les 4 types de cartes, toutes neuves et dues maintenant', () => {
    const cards = generateCardsForWord(makeWord({ id: 'w-0001' }), T0)
    expect(cards.map((c) => c.cardType).sort()).toEqual([
      'audio_to_sense',
      'hanzi_to_pinyin',
      'hanzi_to_sense',
      'sense_to_hanzi',
    ])
    expect(cards.every((c) => c.state === 'new' && c.due === T0 && c.reps === 0)).toBe(true)
    expect(new Set(cards.map((c) => c.id)).size).toBe(4)
  })

  it('respecte le filtre de types', () => {
    const cards = generateCardsForWord(makeWord({ id: 'w-0001' }), T0, {
      cardTypes: ['hanzi_to_sense'],
    })
    expect(cards).toHaveLength(1)
    expect(cards[0]?.id).toBe('word:w-0001:hanzi_to_sense')
  })

  it('les identifiants sont déterministes', () => {
    const a = generateCardsForWord(makeWord({ id: 'w-0009' }), T0)
    const b = generateCardsForWord(makeWord({ id: 'w-0009' }), T0 + 999)
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id))
  })
})

describe('generateCardsForLesson', () => {
  it('génère les cartes des mots et des points de grammaire de la leçon', () => {
    const catalog = makeCatalog({
      words: [makeWord({ id: 'w-1' }), makeWord({ id: 'w-2' })],
      grammarPoints: [makeGrammarPoint({ id: 'g-1' })],
    })
    const cards = generateCardsForLesson(
      { wordIds: ['w-1', 'w-2'], grammarPointIds: ['g-1'] },
      catalog,
      T0,
    )
    expect(cards.filter((c) => c.itemType === 'word')).toHaveLength(8)
    expect(cards.filter((c) => c.itemType === 'grammar')).toHaveLength(2)
  })

  it('ignore les références absentes du catalogue', () => {
    const catalog = makeCatalog({ words: [makeWord({ id: 'w-1' })] })
    const cards = generateCardsForLesson(
      { wordIds: ['w-1', 'w-404'], grammarPointIds: [] },
      catalog,
      T0,
    )
    expect(cards).toHaveLength(4)
  })
})
