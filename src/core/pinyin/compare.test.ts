import { comparePinyin } from './compare'

describe('comparePinyin', () => {
  it('accepte une réponse correcte en chiffres de ton', () => {
    const r = comparePinyin('ni3 hao3', 'nǐ hǎo')
    expect(r.correct).toBe(true)
    expect(r.toneErrors).toBe(0)
    expect(r.baseErrors).toBe(0)
  })

  it('accepte la forme collée (chiffres) et la casse', () => {
    // La saisie utilisateur se fait en chiffres de ton (ADR 0004) ; « ni3hao3 »
    // sans espace est un cas réel, contrairement aux diacritiques collés.
    expect(comparePinyin('NI3HAO3', 'nǐ hǎo').correct).toBe(true)
    expect(comparePinyin(' ni3  hao3 ', 'nǐ hǎo').correct).toBe(true)
  })

  it('accepte v pour ü', () => {
    expect(comparePinyin('lv4 shi1', 'lǜ shī').correct).toBe(true)
  })

  it('rejette un ton faux et le compte', () => {
    const r = comparePinyin('ni2 hao3', 'nǐ hǎo')
    expect(r.correct).toBe(false)
    expect(r.toneErrors).toBe(1)
    expect(r.baseErrors).toBe(0)
    expect(r.basesOk).toBe(true)
  })

  it('signale un ton manquant', () => {
    const r = comparePinyin('ni hao', 'nǐ hǎo')
    expect(r.correct).toBe(false)
    expect(r.missingTone).toBe(true)
  })

  it('détecte une base fausse', () => {
    const r = comparePinyin('ni3 hao3', 'wǒ shì')
    expect(r.baseErrors).toBe(2)
    expect(r.correct).toBe(false)
  })

  it('détecte un nombre de syllabes différent', () => {
    const r = comparePinyin('ni3', 'nǐ hǎo')
    expect(r.lengthMismatch).toBe(true)
    expect(r.correct).toBe(false)
  })

  it('donne le détail par syllabe', () => {
    const r = comparePinyin('peng2 you2', 'péng you')
    expect(r.detail).toHaveLength(2)
    expect(r.detail[0]).toMatchObject({ baseOk: true, toneOk: true })
    expect(r.detail[1]).toMatchObject({ baseOk: true, toneOk: false })
    expect(r.toneErrors).toBe(1)
  })

  it('accepte le ton neutre écrit avec 5 ou sans chiffre quand la référence est neutre', () => {
    expect(comparePinyin('peng2 you5', 'péng you').correct).toBe(true)
    // la référence n'ayant pas QUE des tons neutres, l'absence totale de ton reste refusée
    const r = comparePinyin('peng you', 'péng you')
    expect(r.missingTone).toBe(true)
  })
})
