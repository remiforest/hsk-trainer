import { describe, expect, it } from 'vitest'
import { canSpeak, hasChineseVoice, speak } from './speak'

// jsdom ne fournit pas `speechSynthesis` : on vérifie seulement que la couche
// best-effort ne casse jamais une révision.
describe('speak (environnement sans synthèse vocale)', () => {
  it('expose des valeurs sûres et ne lève pas', () => {
    expect(typeof canSpeak()).toBe('boolean')
    expect(typeof hasChineseVoice()).toBe('boolean')
    expect(() => speak('你好')).not.toThrow()
    expect(['spoken', 'no-chinese-voice', 'unsupported', 'error']).toContain(speak('你好'))
  })
})
