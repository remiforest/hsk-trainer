import {
  applyTone,
  countSyllables,
  normalizePinyin,
  parsePinyin,
  parseSyllable,
  PinyinParseError,
  splitSyllables,
  validatePinyin,
} from './normalize'

describe('applyTone', () => {
  it('place le ton selon la règle standard', () => {
    expect(applyTone('hao', 3)).toBe('hǎo') // a prioritaire
    expect(applyTone('hen', 3)).toBe('hěn') // e
    expect(applyTone('gou', 3)).toBe('gǒu') // ou -> o
    expect(applyTone('liu', 2)).toBe('liú') // dernière voyelle
    expect(applyTone('gui', 1)).toBe('guī') // dernière voyelle
    expect(applyTone('nü', 3)).toBe('nǚ')
    expect(applyTone('shi', 4)).toBe('shì')
    expect(applyTone('ma', 0)).toBe('ma') // neutre
  })
})

describe('parseSyllable', () => {
  it('lit les chiffres de ton', () => {
    expect(parseSyllable('hao3')).toEqual({ base: 'hao', tone: 3 })
    expect(parseSyllable('ma5')).toEqual({ base: 'ma', tone: 0 })
    expect(parseSyllable('ma')).toEqual({ base: 'ma', tone: 0 })
    expect(parseSyllable('lv4')).toEqual({ base: 'lü', tone: 4 })
    expect(parseSyllable('NI3')).toEqual({ base: 'ni', tone: 3 })
  })

  it('lit les diacritiques', () => {
    expect(parseSyllable('hǎo')).toEqual({ base: 'hao', tone: 3 })
    expect(parseSyllable('lǜ')).toEqual({ base: 'lü', tone: 4 })
    expect(parseSyllable('má')).toEqual({ base: 'ma', tone: 2 })
  })

  it('rejette les entrées invalides', () => {
    expect(() => parseSyllable('hao9')).toThrow(PinyinParseError)
    expect(() => parseSyllable('h3o3')).toThrow(PinyinParseError)
    expect(() => parseSyllable('bcd')).toThrow(PinyinParseError) // pas de voyelle
    expect(() => parseSyllable('')).toThrow(PinyinParseError)
    expect(() => parseSyllable('háǒ')).toThrow(PinyinParseError) // deux diacritiques
  })
})

describe('splitSyllables', () => {
  it('découpe avec ou sans séparateurs', () => {
    expect(splitSyllables('ni3 hao3')).toEqual(['ni3', 'hao3'])
    expect(splitSyllables('ni3hao3')).toEqual(['ni3', 'hao3'])
    expect(splitSyllables('nǐ hǎo')).toEqual(['nǐ', 'hǎo'])
    expect(splitSyllables("xi'an")).toEqual(['xi', 'an'])
    expect(splitSyllables('  ')).toEqual([])
  })

  it('tolère la ponctuation des phrases d’exemple', () => {
    expect(splitSyllables('lǎo shī, zài jiàn')).toEqual(['lǎo', 'shī', 'zài', 'jiàn'])
    expect(splitSyllables('wǒ hěn hǎo, nǐ ne')).toEqual(['wǒ', 'hěn', 'hǎo', 'nǐ', 'ne'])
    expect(splitSyllables('wéi, nǐ hǎo!')).toEqual(['wéi', 'nǐ', 'hǎo'])
  })
})

describe('normalizePinyin', () => {
  it('convertit les chiffres en diacritiques', () => {
    expect(normalizePinyin('ni3 hao3')).toBe('nǐ hǎo')
    expect(normalizePinyin('ni3hao3')).toBe('nǐ hǎo')
    expect(normalizePinyin('wo3 men5')).toBe('wǒ men')
    expect(normalizePinyin('Zhong1 guo2')).toBe('zhōng guó')
    expect(normalizePinyin('lv4 shi1')).toBe('lǜ shī')
  })

  it('laisse une entrée déjà en diacritiques inchangée', () => {
    expect(normalizePinyin('nǐ hǎo')).toBe('nǐ hǎo')
  })

  it('propage l’erreur sur une entrée invalide', () => {
    expect(() => normalizePinyin('xyz')).toThrow(PinyinParseError)
  })
})

describe('countSyllables', () => {
  it('compte les syllabes', () => {
    expect(countSyllables('nǐ hǎo')).toBe(2)
    expect(countSyllables('ni3hao3')).toBe(2)
    expect(countSyllables('shì')).toBe(1)
  })
})

describe('validatePinyin', () => {
  it('accepte une référence en diacritiques', () => {
    expect(validatePinyin('nǐ hǎo')).toMatchObject({ valid: true, errors: [] })
  })

  it('refuse une référence avec chiffres', () => {
    const r = validatePinyin('ni3 hao3')
    expect(r.valid).toBe(false)
    expect(r.errors.join(' ')).toContain('diacritiques')
  })

  it('refuse une référence illisible', () => {
    expect(validatePinyin('zzz').valid).toBe(false)
  })
})

describe('parsePinyin', () => {
  it('renvoie syllabes + forme normalisée', () => {
    expect(parsePinyin('peng2 you5')).toEqual({
      syllables: [
        { base: 'peng', tone: 2 },
        { base: 'you', tone: 0 },
      ],
      normalized: 'péng you',
    })
  })
})
