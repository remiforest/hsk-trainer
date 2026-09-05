# HSK Trainer

Application web locale pour apprendre le mandarin des niveaux HSK 1 puis HSK 2, par
répétition espacée. Sessions courtes (5–15 min/jour), ordinateur et mobile, **100 %
hors ligne**, aucun compte, aucun serveur. Le chinois est toujours affiché en
caractères simplifiés + pinyin avec tons marqués ; les traductions sont en français.

## Installation

```bash
npm install
npm run dev        # serveur de développement
```

## Scripts

| Commande                | Rôle                                                              |
| ----------------------- | ----------------------------------------------------------------- |
| `npm run dev`           | Serveur de dev Vite                                               |
| `npm run build`         | Typecheck + build de production (fichiers statiques dans `dist/`) |
| `npm run preview`       | Sert le build de production localement                            |
| `npm run test`          | Tests Vitest (`test:watch`, `test:cov` pour la couverture)        |
| `npm run typecheck`     | `tsc -b` sur tout le projet                                       |
| `npm run lint`          | ESLint (zéro warning toléré)                                      |
| `npm run format`        | Prettier en écriture (`format:check` en lecture seule)            |
| `npm run validate:data` | Validation du contenu pédagogique de `src/data/`                  |

## Architecture (survol)

- `src/types/` — types partagés, aucune dépendance.
- `src/core/` — logique métier **pure** : moteur SRS, sélection de la file du jour,
  normalisation/comparaison du pinyin, reconstruction depuis le journal, contrôles
  d'intégrité. Testable sans navigateur ni React.
- `src/db/` — persistance IndexedDB (Dexie), schéma versionné + migrations,
  snapshots, export/import, séquence de démarrage.
- `src/data/` — contenu pédagogique (mots, grammaire, leçons) en JSON, séparé du
  code et validé par `validate:data`.
- `src/ui/` — composants React et écrans (Accueil, Session, Leçon, Progression,
  Sauvegardes, Réglages, Récupération).

Sens des dépendances : `types/` ← `core/` ← `db/` ← `ui/`. `core/` n'importe jamais
Dexie ni React.

## Décisions d'architecture

Voir `docs/adr/`. Conventions de contribution : `CLAUDE.md`.
