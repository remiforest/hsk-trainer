# ADR 0001 — Moteur de répétition espacée : FSRS via `ts-fsrs`

- Statut : accepté
- Date : 2026-09-05

## Contexte

Le cœur de l'application est un moteur de répétition espacée. Le cahier des charges
demande FSRS via `ts-fsrs` « si elle convient », sinon un SM-2 amélioré, avec
justification.

Contraintes : logique métier pure et testable sans navigateur ; pas de dépendance
lourde ; comportement déterministe pour pouvoir reconstruire l'état des cartes en
rejouant le journal d'événements.

## Options envisagées

1. **`ts-fsrs`** — implémentation TypeScript de FSRS (Free Spaced Repetition
   Scheduler), l'algorithme utilisé par Anki depuis 2023.
2. **SM-2 maison** — algorithme historique d'Anki/SuperMemo 2, ~50 lignes.
3. **FSRS réimplémenté à la main** — contrôle total, mais réécriture d'un modèle
   à 17+ paramètres et risque d'erreurs.

## Décision

Utiliser **`ts-fsrs`**.

- Sans dépendance, pur TypeScript, typé, adapté à une exécution hors navigateur —
  compatible avec la règle « `src/core/` pur ».
- FSRS donne de meilleurs intervalles que SM-2 pour un volume de révisions égal,
  ce qui sert directement l'objectif « 5–15 min/jour ».
- API découplée : `ts-fsrs` calcule la prochaine échéance à partir de l'état d'une
  carte et d'une note ; il ne touche ni au stockage ni à l'horloge (on lui passe
  la date). Le déterminisme nécessaire au rejeu du journal est donc préservé.
- Les étapes d'apprentissage courtes façon Anki (1 min / 10 min), la re-mise en
  file d'une carte ratée dans la même session, le plafond de nouvelles cartes et
  la détection des leeches ne relèvent pas de FSRS : ils sont implémentés dans
  `src/core/srs/` autour de la librairie.

## Conséquences

- `src/core/srs/scheduler.ts` enveloppe `ts-fsrs` : conversion des 4 notes
  (Encore/Difficile/Bien/Facile → Again/Hard/Good/Easy), gestion des learning
  steps avant l'entrée dans le cycle FSRS, exposition d'une fonction pure
  `(carte, note, maintenant) → { carteApres, evenement }`.
- `src/core/srs/replay.ts` reconstruit l'état d'une carte en rejouant ses
  `ReviewEvent` dans l'ordre chronologique via ce même `scheduler.ts`.
- La version des paramètres FSRS utilisée est enregistrée pour que le rejeu reste
  cohérent après une mise à jour de la librairie (voir ADR 0003).
- Si `ts-fsrs` devenait un obstacle, le point de découplage est `scheduler.ts` :
  seul ce fichier serait à remplacer.
