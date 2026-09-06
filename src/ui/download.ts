/**
 * Déclenche le téléchargement d'un fichier texte (sauvegarde JSON export).
 * Lève si l'environnement ne fournit pas `URL.createObjectURL` — l'appelant
 * affiche alors une erreur.
 */
export function downloadText(filename: string, text: string, type = 'application/json'): void {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
  } finally {
    URL.revokeObjectURL(url)
  }
}
