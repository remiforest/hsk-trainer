import { CONTENT_VERSION, getCatalog, loadContent } from './index'
import { catalogHas } from '../types/content'

describe('chargement du contenu HSK 1', () => {
  it('parse les fichiers JSON sans erreur de schéma', () => {
    expect(() => loadContent()).not.toThrow()
  })

  it('charge un contenu non vide et cohérent', () => {
    const { words, grammarPoints, lessons } = loadContent()
    expect(words.length).toBeGreaterThanOrEqual(150)
    expect(grammarPoints.length).toBeGreaterThan(0)
    expect(lessons.length).toBeGreaterThan(0)
    expect(words.every((w) => w.niveauHsk === 1)).toBe(true)
  })

  it('expose un catalogue indexé résolvant les items des leçons', () => {
    const catalog = getCatalog()
    const { lessons } = loadContent()
    for (const lesson of lessons) {
      for (const wid of lesson.wordIds) {
        expect(catalogHas(catalog, 'word', wid)).toBe(true)
      }
      for (const gid of lesson.grammarPointIds) {
        expect(catalog.grammarPoints.has(gid)).toBe(true)
      }
    }
  })

  it('mémoïse : deux appels renvoient la même instance', () => {
    expect(loadContent()).toBe(loadContent())
  })

  it('a une version de contenu', () => {
    expect(CONTENT_VERSION).toMatch(/hsk1/)
  })
})
