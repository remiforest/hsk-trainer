/**
 * Synthèse vocale du chinois (cartes audio → sens). Best-effort : si l'API ou une
 * voix chinoise manque, on n'empêche jamais la révision — on renvoie un
 * `SpeakOutcome` pour que l'UI puisse expliquer un éventuel silence.
 *
 * Choix de conception : on fixe `utterance.lang` et on **laisse le système
 * choisir sa voix par défaut** pour cette langue. Forcer `utterance.voice` sur la
 * première voix `zh-*` de la liste tombe souvent sur une voix « nouveauté »
 * (Eddy, Flo…) qui reste muette.
 *
 * Pièges gérés :
 *  - `getVoices()` peut renvoyer `[]` au premier appel (liste asynchrone) ;
 *  - voix mandarin annoncées `cmn-*` / `yue-*` autant que `zh-*` ;
 *  - Chrome peut rester « en pause » après un `cancel()` → `resume()` ;
 *  - une `SpeechSynthesisUtterance` non référencée peut être ramassée par le GC
 *    avant la fin de la lecture.
 */

export type SpeakOutcome = 'spoken' | 'no-chinese-voice' | 'unsupported' | 'error'

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined'
}

const CHINESE_LANG = /^(zh|cmn|yue|hak|nan)\b/i

let voiceCache: SpeechSynthesisVoice[] = []

function voices(): SpeechSynthesisVoice[] {
  if (!canSpeak()) {
    return []
  }
  const current = window.speechSynthesis.getVoices()
  if (current.length > 0) {
    voiceCache = current
  }
  return voiceCache
}

if (canSpeak() && typeof window.speechSynthesis.addEventListener === 'function') {
  window.speechSynthesis.addEventListener('voiceschanged', () => {
    voiceCache = window.speechSynthesis.getVoices()
  })
}

/** Une voix chinoise est-elle installée sur le système ? */
export function hasChineseVoice(): boolean {
  return voices().some((v) => CHINESE_LANG.test(v.lang.replace('_', '-')))
}

// Empêche le GC de couper un énoncé en cours (bug Chrome) : référence retenue
// jusqu'à `onend` / `onerror`.
const pinned = new Set<SpeechSynthesisUtterance>()

export function speak(text: string, lang = 'zh-CN'): SpeakOutcome {
  if (!canSpeak()) {
    return 'unsupported'
  }
  try {
    const synth = window.speechSynthesis
    const hasVoice = hasChineseVoice()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = lang
    utterance.onend = () => pinned.delete(utterance)
    utterance.onerror = () => pinned.delete(utterance)
    pinned.add(utterance)

    synth.cancel() // vide une file éventuellement bloquée
    synth.resume() // Chrome reste parfois « en pause » après un cancel
    synth.speak(utterance)

    return hasVoice ? 'spoken' : 'no-chinese-voice'
  } catch {
    return 'error'
  }
}
