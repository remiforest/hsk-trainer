import { describe, expect, it } from 'vitest'
import { makeCard, makeCatalog, makeGrammarPoint, makeWord } from '../../test/factories'
import { buildExercise, buildRevealPrompt } from './exercise'

const rng = (): number => 0

const catalog = makeCatalog({
  words: [
    makeWord({ id: 'w-0001', hanzi: '好', pinyin: 'hǎo', fr: 'bien' }),
    makeWord({ id: 'w-0002' }),
    makeWord({ id: 'w-0003' }),
    makeWord({ id: 'w-0004' }),
    makeWord({ id: 'w-0005' }),
  ],
  grammarPoints: [
    makeGrammarPoint({ id: 'g-0001', titre: 'La particule 的', structure: 'A + 的 + N' }),
  ],
})

describe('buildExercise', () => {
  it('sense_to_hanzi → QCM', () => {
    const ex = buildExercise(
      makeCard({ itemId: 'w-0001', cardType: 'sense_to_hanzi' }),
      catalog,
      rng,
    )
    expect(ex.kind).toBe('choice')
  })

  it('hanzi_to_pinyin → saisie', () => {
    const ex = buildExercise(
      makeCard({ itemId: 'w-0001', cardType: 'hanzi_to_pinyin' }),
      catalog,
      rng,
    )
    expect(ex.kind).toBe('pinyin')
  })

  it('hanzi_to_sense et audio_to_sense → révélation', () => {
    expect(
      buildExercise(makeCard({ itemId: 'w-0001', cardType: 'hanzi_to_sense' }), catalog, rng).kind,
    ).toBe('reveal')
    expect(
      buildExercise(makeCard({ itemId: 'w-0001', cardType: 'audio_to_sense' }), catalog, rng).kind,
    ).toBe('reveal')
  })

  it('carte de grammaire → révélation « grammar »', () => {
    const ex = buildExercise(
      makeCard({ itemType: 'grammar', itemId: 'g-0001', cardType: 'grammar_fill' }),
      catalog,
      rng,
    )
    expect(ex.kind).toBe('reveal')
    if (ex.kind === 'reveal') {
      expect(ex.prompt.kind).toBe('grammar')
    }
  })
})

describe('buildRevealPrompt', () => {
  it('mot : promptKind selon le type de carte', () => {
    const audio = buildRevealPrompt(
      makeCard({ itemId: 'w-0001', cardType: 'audio_to_sense' }),
      catalog,
    )
    expect(audio).toMatchObject({ kind: 'word', promptKind: 'audio', hanzi: '好', sense: 'bien' })

    const hanzi = buildRevealPrompt(
      makeCard({ itemId: 'w-0001', cardType: 'hanzi_to_sense' }),
      catalog,
    )
    expect(hanzi).toMatchObject({ kind: 'word', promptKind: 'hanzi' })
  })

  it('grammaire : titre, structure, explication et exemples', () => {
    const p = buildRevealPrompt(
      makeCard({ itemType: 'grammar', itemId: 'g-0001', cardType: 'grammar_order' }),
      catalog,
    )
    expect(p).toMatchObject({ kind: 'grammar', titre: 'La particule 的', structure: 'A + 的 + N' })
    if (p.kind === 'grammar') {
      expect(Array.isArray(p.examples)).toBe(true)
    }
  })
})
