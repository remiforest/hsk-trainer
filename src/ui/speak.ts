/**
 * Synthèse vocale du chinois (cartes audio → sens). Best-effort : si l'API ou une
 * voix chinoise manque, on n'empêche jamais la révision — on renvoie un
 * `SpeakOutcome` pour que l'UI puisse expliquer un éventuel silence.
 *
 * Pièges gérés ici :
 *  - `getVoices()` peut renvoyer `[]` au premier appel (liste chargée en asynchrone) ;
 *  - certaines voix mandarin s'annoncent `cmn-*` et non `zh-*` ;
 *  - Chrome peut laisser la synthèse en pause après un `cancel()` → `resume()` ;
 *  - une `SpeechSynthesisUtterance` non référencée peut être ramassée par le GC
 *    avant la fin de la lecture → on garde une référence le temps de l'énoncé.
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

function chineseVoice(): SpeechSynthesisVoice | null {
  return voices().find((v) => CHINESE_LANG.test(v.lang.replace('_', '-'))) ?? null
}

/** Une voix chinoise est-elle installée sur le système ? */
export function hasChineseVoice(): boolean {
  return chineseVoice() !== null
}

// Empêche le GC de couper un énoncé en cours (bug Chrome) : on garde une
// référence jusqu'à `onend` / `onerror`.
const pinned = new Set<SpeechSynthesisUtterance>()

export function speak(text: string, lang = 'zh-CN'): SpeakOutcome {
  if (!canSpeak()) {
    return 'unsupported'
  }
  try {
    const synth = window.speechSynthesis
    const voice = chineseVoice()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = voice ? voice.lang : lang
    if (voice) {
      utterance.voice = voice
    }
    utterance.onend = () => pinned.delete(utterance)
    utterance.onerror = () => pinned.delete(utterance)
    pinned.add(utterance)

    synth.cancel() // vide une file éventuellement bloquée
    synth.resume() // Chrome reste parfois « en pause » après un cancel
    synth.speak(utterance)
    return voice ? 'spoken' : 'no-chinese-voice'
  } catch {
    return 'error'
  }
}
