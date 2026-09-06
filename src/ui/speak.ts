/**
 * Synthèse vocale du chinois (cartes audio → sens). Best-effort : si l'API n'est
 * pas disponible (navigateur sans `speechSynthesis`, environnement de test), on
 * ne fait rien — l'absence d'audio ne doit jamais empêcher une révision.
 */

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined'
}

export function speak(text: string, lang = 'zh-CN'): void {
  try {
    if (!canSpeak()) {
      return
    }
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = lang
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  } catch {
    // pas de synthèse vocale : on continue sans audio
  }
}
