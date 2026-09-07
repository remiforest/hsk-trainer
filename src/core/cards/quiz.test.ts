import { makeCard, makeCatalog, makeWord } from '../../test/factories'
import { buildChoiceQuestion, buildPinyinQuestion, revealContent, shuffle } from './quiz'

/** rng déterministe (LCG) pour des tests reproductibles. */
function seededRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

const words = [
  makeWord({ id: 'w-0001', hanzi: '好', pinyin: 'hǎo', fr: 'bien', themes: ['adjectif'] }),
  makeWord({ id: 'w-0002', hanzi: '大', pinyin: 'dà', fr: 'grand', themes: ['adjectif'] }),
  makeWord({ id: 'w-0003', hanzi: '小', pinyin: 'xiǎo', fr: 'petit', themes: ['adjectif'] }),
  makeWord({ id: 'w-0004', hanzi: '冷', pinyin: 'lěng', fr: 'froid', themes: ['adjectif'] }),
  makeWord({ id: 'w-0005', hanzi: '茶', pinyin: 'chá', fr: 'thé', themes: ['nourriture'] }),
]
const catalog = makeCatalog({ words })

describe('shuffle', () => {
  it('conserve les éléments et est déterministe pour un rng donné', () => {
    const a = shuffle([1, 2, 3, 4, 5], seededRng(1))
    const b = shuffle([1, 2, 3, 4, 5], seededRng(1))
    expect(a.sort()).toEqual([1, 2, 3, 4, 5])
    expect(shuffle([1, 2, 3, 4, 5], seededRng(1))).toEqual(b)
  })
})

describe('buildChoiceQuestion', () => {
  it('hanzi→sens : prompt en hanzi, options en français, la bonne réponse est présente', () => {
    const card = makeCard({ itemId: 'w-0001', cardType: 'hanzi_to_sense' })
    const q = buildChoiceQuestion(card, catalog, seededRng(42))
    expect(q).not.toBeNull()
    expect(q?.promptKind).toBe('hanzi')
    expect(q?.promptHanzi).toBe('好')
    expect(q?.options).toHaveLength(4)
    expect(q?.options.every((o) => o.lang === 'fr')).toBe(true)
    expect(q?.options.some((o) => o.id === q.correctId && o.label === 'bien')).toBe(true)
    expect(new Set(q?.options.map((o) => o.label)).size).toBe(4) // libellés distincts
  })

  it('sens→hanzi : options en hanzi', () => {
    const card = makeCard({ itemId: 'w-0002', cardType: 'sense_to_hanzi' })
    const q = buildChoiceQuestion(card, catalog, seededRng(7))
    expect(q?.promptKind).toBe('sense')
    expect(q?.options.every((o) => o.lang === 'zh')).toBe(true)
    expect(q?.options.find((o) => o.id === q.correctId)?.label).toBe('大')
  })

  it('chaque option porte hanzi / pinyin / sens pour l’écran de correction', () => {
    const card = makeCard({ itemId: 'w-0002', cardType: 'sense_to_hanzi' })
    const q = buildChoiceQuestion(card, catalog, seededRng(7))
    const correct = q?.options.find((o) => o.id === q.correctId)
    expect(correct).toMatchObject({ hanzi: '大', pinyin: 'dà', sense: 'grand' })
    expect(q?.options.every((o) => o.hanzi !== '' && o.pinyin !== '' && o.sense !== '')).toBe(true)
  })

  it('audio→sens : promptKind audio, hanzi disponible pour la synthèse', () => {
    const card = makeCard({ itemId: 'w-0005', cardType: 'audio_to_sense' })
    const q = buildChoiceQuestion(card, catalog, seededRng(3))
    expect(q?.promptKind).toBe('audio')
    expect(q?.promptHanzi).toBe('茶')
  })

  it('privilégie les distracteurs du même thème', () => {
    const card = makeCard({ itemId: 'w-0001', cardType: 'hanzi_to_sense' })
    const q = buildChoiceQuestion(card, catalog, seededRng(99))
    // 4 adjectifs + 1 nourriture : les 3 distracteurs doivent être des adjectifs
    const chosen = q?.options.filter((o) => o.id !== q.correctId).map((o) => o.label) ?? []
    expect(chosen).not.toContain('thé')
  })

  it('renvoie null pour une carte de grammaire', () => {
    const card = makeCard({ itemType: 'grammar', itemId: 'g-1', cardType: 'grammar_fill' })
    expect(buildChoiceQuestion(card, makeCatalog(), seededRng(1))).toBeNull()
  })

  it('est déterministe pour un rng donné', () => {
    const card = makeCard({ itemId: 'w-0003', cardType: 'hanzi_to_sense' })
    const q1 = buildChoiceQuestion(card, catalog, seededRng(5))
    const q2 = buildChoiceQuestion(card, catalog, seededRng(5))
    expect(q1?.options.map((o) => o.id)).toEqual(q2?.options.map((o) => o.id))
  })
})

describe('buildPinyinQuestion', () => {
  it('donne le hanzi, le sens et le pinyin de référence', () => {
    const card = makeCard({ itemId: 'w-0001', cardType: 'hanzi_to_pinyin' })
    expect(buildPinyinQuestion(card, catalog)).toEqual({
      cardId: card.id,
      hanzi: '好',
      sense: 'bien',
      referencePinyin: 'hǎo',
    })
  })
  it('null pour un autre type', () => {
    expect(
      buildPinyinQuestion(makeCard({ itemId: 'w-0001', cardType: 'hanzi_to_sense' }), catalog),
    ).toBeNull()
  })
})

describe('revealContent', () => {
  it('rassemble hanzi, pinyin, sens et exemples', () => {
    const card = makeCard({ itemId: 'w-0005', cardType: 'hanzi_to_sense' })
    const r = revealContent(card, catalog)
    expect(r).toMatchObject({ hanzi: '茶', pinyin: 'chá', sense: 'thé' })
    expect(Array.isArray(r?.examples)).toBe(true)
  })
})
