/**
 * Synthèse vocale du chinois (cartes audio → sens). Best-effort : si l'API ou une
 * voix chinoise manque, on n'empêche jamais la révision — on renvoie juste un
 * `SpeakOutcome` pour que l'UI puisse expliquer le silence.
 *
 * Deux pièges gérés ici :
 *  - `getVoices()` peut renvoyer `[]` au premier appel (liste chargée en asynchrone) ;
 *  - `cancel()` juste avant `speak()` fait parfois sauter l'énoncé.
 */

export type SpeakOutcome = 'spoken' | 'no-chinese-voice' | 'unsupported' | 'error'

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined'
}

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
  return voices().find((v) => v.lang.toLowerCase().startsWith('zh')) ?? null
}

/** Une voix chinoise est-elle installée sur le système ? */
export function hasChineseVoice(): boolean {
  return chineseVoice() !== null
}

export function speak(text: string, lang = 'zh-CN'): SpeakOutcome {
  if (!canSpeak()) {
    return 'unsupported'
  }
  try {
    const synth = window.speechSynthesis
    const voice = chineseVoice()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = lang
    if (voice) {
      utterance.voice = voice
    }
    if (synth.speaking || synth.pending) {
      synth.cancel()
    }
    synth.speak(utterance)
    return voice ? 'spoken' : 'no-chinese-voice'
  } catch {
    return 'error'
  }
}
