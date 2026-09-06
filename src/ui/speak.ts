/**
 * Synthèse vocale du chinois (cartes audio → sens). Best-effort : si l'API ou une
 * voix chinoise manque, on n'empêche jamais la révision — on renvoie un
 * `SpeakOutcome` pour que l'UI puisse expliquer un éventuel silence.
 *
 * Sélection de la voix : Chrome, laissé seul avec `lang='zh-CN'`, prend la
 * première voix `zh-*` de la liste — souvent une voix « personnage » (Eddy,
 * Flo, Grandpa…) qui reste muette. On choisit donc explicitement une voix
 * « normale » (nom sans parenthèse : Tingting, Meijia, Sinji…), en préférant
 * zh-CN puis les voix locales.
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

/** Note plus la voix est adaptée, plus le score est bas. */
function score(voice: SpeechSynthesisVoice): number {
  const lang = voice.lang.replace('_', '-').toLowerCase()
  let s = 0
  // nom « simple » (Tingting, Meijia…) plutôt qu'une voix personnage localisée
  if (!/[(（]/.test(voice.name)) s -= 8
  if (lang.startsWith('zh-cn')) s -= 4
  else if (lang.startsWith('zh')) s -= 2
  if (voice.localService) s -= 1
  return s
}

function chineseVoice(): SpeechSynthesisVoice | null {
  const zh = voices().filter((v) => CHINESE_LANG.test(v.lang.replace('_', '-')))
  if (zh.length === 0) {
    return null
  }
  return [...zh].sort((a, b) => score(a) - score(b))[0] ?? null
}

/** Une voix chinoise est-elle installée sur le système ? */
export function hasChineseVoice(): boolean {
  return chineseVoice() !== null
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
