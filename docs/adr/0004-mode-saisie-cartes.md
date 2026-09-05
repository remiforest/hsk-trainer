# ADR 0004 — Mode de saisie des cartes de production

- Statut : accepté
- Date : 2026-09-05

## Contexte

Le cahier des charges laisse le choix, pour les cartes de production, entre choix
multiple et saisie libre. L'usage cible est quotidien, court, et souvent au pouce
sur mobile. Taper des caractères chinois exige un IME configuré, ce qui n'est pas
acquis sur tous les appareils et ajoute de la friction à une session de 10 min.

## Décision

- **sens → hanzi** : **choix multiple** (4 propositions). Les distracteurs sont
  tirés en priorité parmi des mots du même niveau HSK et, si possible, du même
  champ thématique ou de forme graphique proche.
- **hanzi → pinyin (avec ton)** : **saisie clavier en chiffres de ton**.
  L'utilisateur tape `ni3 hao3` ; l'application normalise en `nǐ hǎo` et compare
  syllabe + ton. Tolérance sur les espaces, la casse et le `v`/`ü`. La saisie
  sans chiffre de ton est acceptée mais signalée comme ton manquant.
- **hanzi → sens** et **audio → sens** : reconnaissance (révélation puis
  auto-notation façon Anki), pas de saisie.

## Conséquences

- Le modèle `Card` porte un `cardType` qui détermine le mode d'interaction ; le
  rendu de session est un `switch` sur ce type.
- `core/pinyin/normalize.ts` convertit chiffres de ton → diacritiques et valide le
  placement du ton (règle de la voyelle accentuée). `core/pinyin/compare.ts`
  compare la réponse à la référence.
- La génération des cartes (`core/cards/generate.ts`) produit, pour les cartes à
  choix multiple, la liste des distracteurs de façon déterministe (aléatoire
  injecté) pour rester testable et rejouable.
- Aucune dépendance à un IME. Réévaluable plus tard si l'utilisateur veut un mode
  d'écriture des caractères.
