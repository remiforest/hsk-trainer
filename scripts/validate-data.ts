/**
 * Validation du contenu pédagogique (`src/data/`) : format du pinyin, absence de
 * doublons, cohérence des références entre leçons et mots, complétude des
 * traductions françaises.
 *
 * Implémentation complète à l'étape 4. Pour l'instant le contenu n'existe pas
 * encore : le script se contente de confirmer que le dossier est accessible pour
 * que la commande soit branchée dans la CI dès l'étape 1.
 */
import { existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const dataDir = resolve(import.meta.dirname, '..', 'src', 'data')

if (!existsSync(dataDir)) {
  console.log('validate:data — src/data/ absent, rien à valider (contenu ajouté à l’étape 4).')
  process.exit(0)
}

const entries = readdirSync(dataDir)
console.log(
  `validate:data — src/data/ contient ${entries.length} entrée(s). ` +
    'Validation détaillée branchée à l’étape 4.',
)
process.exit(0)
