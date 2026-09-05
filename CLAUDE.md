# Conventions du projet HSK Trainer

Contexte pour les sessions de travail futures. À lire avant de coder.

## Objectif produit

Apprendre le vocabulaire et la grammaire HSK 1 puis HSK 2 par répétition espacée,
en sessions de 5–15 min/jour. **Priorité absolue : ne jamais perdre la progression
de l'utilisateur.** Les garanties de sûreté (journal append-only, snapshots,
export/import, écran de récupération, contrôle d'intégrité au démarrage) passent
avant les fonctionnalités.

## Stack

React 19 + TypeScript strict + Vite + Tailwind v4 (CSS-first, pas de
`tailwind.config`). Tests : Vitest + Testing Library. Persistance : IndexedDB via
Dexie. SRS : `ts-fsrs` enveloppé par notre code (learning steps façon Anki).
Pas de backend, pas de state manager global (Context + `useState` suffisent).

## Règles de code

- TypeScript `strict`, plus `noUncheckedIndexedAccess` et
  `exactOptionalPropertyTypes`. **Aucun `any`** (`@typescript-eslint/no-explicit-any`
  en erreur). Utiliser `unknown` + validation.
- Imports de types en `import { type X }` (inline type imports).
- Séparation stricte des couches : `types/` ← `core/` ← `db/` ← `ui/`.
  `src/core/` est **pur** : pas d'import de Dexie, de React, ni d'API navigateur
  non injectée (l'heure et l'aléatoire sont passés en paramètres).
- Le contenu pédagogique vit dans `src/data/*.json`, jamais en dur dans le code.
- Prettier : pas de point-virgule, guillemets simples, largeur 100, virgule
  finale. `npm run lint` doit être vert, **zéro warning**.

## Modèle de données (rappel)

- `Card.id` déterministe : `` `${itemType}:${itemId}:${cardType}` ``.
- `ReviewEvent` : journal **append-only immuable**. L'état des cartes doit rester
  reconstructible en rejouant les notes dans le scheduler (`core/srs/replay.ts`).
- `Snapshot` : dump JSON complet, rotation 7 jours + 4 semaines, + snapshot
  systématique avant toute migration de schéma.
- Notes SRS : Encore / Difficile / Bien / Facile → Again / Hard / Good / Easy.

## Workflow

- Commits atomiques, **Conventional Commits**, un commit par étape logique.
- Jamais de commit avec des tests cassés, du lint en échec, ou un typecheck rouge.
- Tests des mécanismes de sûreté et du SRS écrits **avant** l'UI correspondante.
- CI (`.github/workflows/ci.yml`) : lint + typecheck + test + validate:data + build.
- Un doute sur un mot chinois, un ton, une traduction → le noter dans
  `docs/a-verifier.md`, ne jamais deviner silencieusement.

## Plan par étapes

Voir la section 8 du cahier des charges. À la fin de chaque étape : lancer les
tests, commiter, puis montrer un point d'étape à l'utilisateur avant de continuer.
