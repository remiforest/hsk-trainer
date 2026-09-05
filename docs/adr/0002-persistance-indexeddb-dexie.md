# ADR 0002 — Persistance : IndexedDB via Dexie

- Statut : accepté
- Date : 2026-09-05

## Contexte

Application 100 % locale, hors ligne, sans backend ni compte. Il faut stocker de
façon durable : cartes SRS, journal d'événements append-only, contenu dérivé,
snapshots de sauvegarde, réglages et progression. Volume attendu : quelques
milliers de cartes, des dizaines de milliers d'événements sur plusieurs années,
plus des snapshots JSON complets.

## Options envisagées

1. **`localStorage`** — API simple mais synchrone, ~5 Mo, tout en chaînes, pas de
   transactions ni d'index. Insuffisant pour le journal et les snapshots.
2. **IndexedDB brut** — capacité largement suffisante, transactions, index, mais
   API verbeuse et piégeuse.
3. **IndexedDB via Dexie** — surcouche mince, transactions et migrations
   déclaratives, typages, requêtes par index lisibles.
4. **SQLite WASM (OPFS)** — puissant mais lourd (binaire WASM), surdimensionné
   pour ce modèle de données et contraire à « pas de sur-ingénierie ».

## Décision

Utiliser **IndexedDB via Dexie**.

- Transactions multi-stores : une réponse de révision écrit atomiquement la carte
  mise à jour **et** l'événement de journal — exigence n° 1 de sûreté.
- Versionnage de schéma et fonctions de migration explicites intégrés à l'API
  (`db.version(n).stores(...).upgrade(...)`).
- Capacité de stockage adaptée aux snapshots JSON complets.
- API asynchrone compatible avec une couche `src/db/` isolée, `src/core/` restant
  pur.

## Conséquences

- `src/db/schema.ts` déclare les stores et **toutes** les migrations, une par
  version, jamais modifiées rétroactivement.
- Stores prévus : `words`, `grammarPoints`, `lessons`, `cards`, `reviewEvents`
  (append-only), `snapshots`, `userProgress`, `settings`, `meta`.
- Accès encapsulé dans `src/db/repositories/` ; le reste du code ne manipule pas
  Dexie directement.
- Un `snapshot` est pris avant toute exécution de migration (voir ADR 0003).
- Les navigateurs peuvent évincer le stockage : on demandera
  `navigator.storage.persist()` et l'export manuel reste le filet hors-appareil.
