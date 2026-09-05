# ADR 0003 — Stratégie de sauvegarde : journal append-only + snapshots + export

- Statut : accepté
- Date : 2026-09-05

## Contexte

L'exigence prioritaire du projet est de **ne jamais perdre la progression**. Le
stockage local peut être corrompu, évincé par le navigateur, ou cassé par un bug
de migration. Il faut plusieurs niveaux de récupération indépendants.

## Décision

Combiner trois mécanismes, du plus fin au plus grossier.

### 1. Journal d'événements append-only (source de vérité)

Chaque révision produit un `ReviewEvent` **immuable** :
`{ id, sessionId, cardId, timestamp, rating, stateBefore, stateAfter, dueBefore,
dueAfter, intervalBeforeDays, intervalAfterDays, elapsedMs }`.

- Écrit dans la **même transaction** que la mise à jour de la carte.
- Jamais modifié ni supprimé.
- L'état de n'importe quelle carte est **reconstructible** en rejouant ses
  événements dans l'ordre chronologique via `core/srs/scheduler.ts`
  (`core/srs/replay.ts`). Les champs `*Before/*After` servent au contrôle
  d'intégrité rapide et à l'audit, pas au calcul.
- Filet ultime : si l'état dérivé (`cards`) est corrompu, on le recalcule depuis
  le journal.

### 2. Snapshots automatiques (récupération rapide)

Dump JSON complet de la base, stocké dans le store `snapshots` d'IndexedDB.

- `reason` : `daily` (au plus un par jour local), `manual`, `pre-migration`.
- **Rotation** : on conserve les 7 derniers snapshots quotidiens + les 4 derniers
  hebdomadaires ; **tous** les snapshots `pre-migration` sont conservés.
- Un snapshot `pre-migration` est pris **systématiquement avant** toute migration
  de schéma, avant que Dexie n'ouvre la nouvelle version.

### 3. Export / import manuel (hors appareil)

- « Exporter ma progression » télécharge un `ExportBundle` JSON versionné
  `{ format: 'hsk-trainer-export', version, exportedAt, schemaVersion, data }`.
- L'import **valide** le fichier (format + version + schéma) puis affiche un
  **aperçu** (nombre de cartes, d'événements, dernière activité) avant d'appliquer.

## Récupération au démarrage

`src/db/bootstrap.ts` : contrôle d'intégrité (cartes orphelines, dates invalides,
compteurs incohérents). En cas d'anomalie, l'application n'échoue pas : elle
affiche un **écran de récupération** proposant (a) la reconstruction depuis le
journal, ou (b) la restauration d'un snapshot.

## Conséquences

- Coût de stockage des snapshots JSON complets : acceptable au vu de la rotation
  et de la capacité d'IndexedDB.
- La version des paramètres FSRS est stockée dans `meta` : le rejeu du journal
  reste cohérent même après mise à jour de `ts-fsrs`.
- Tests écrits avant l'UI : atomicité, `replay ≡ état direct`, rotation,
  round-trip export/import, intégrité, migration + snapshot pré-migration.
