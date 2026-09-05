# À vérifier

Points de contenu chinois (mots, tons, traductions, exemples) sur lesquels il
subsiste un doute et qui doivent être relus par un locuteur ou une source fiable
avant d'être considérés comme définitifs.

---

## Liste HSK 1 — effectif

- **Doute** : le jeu de données contient **159** entrées « niveauHsk 1 » alors que
  la liste officielle HSK 2.0 Band 1 en compte **150**. La liste a été
  reconstituée de mémoire ; certains mots marginaux sont peut-être HSK 2, et
  quelques mots HSK 1 manquent peut-être.
- **Piste** : réconcilier `src/data/hsk1/words.json` avec une source officielle
  (annexe du HSK 2.0, Hanban). Retirer / ajouter, puis ajuster
  `EXPECTED_HSK1_COUNT` et `docs/a-verifier.md`.
- **Entrées les plus incertaines** : `w-0017 这儿`, `w-0018 那儿`, `w-0042 一点儿`,
  `w-0073 汉语`, `w-0077 饭馆`, `w-0093 报纸`, `w-0159 两`.
- **Statut** : ouvert

## Convention : sandhi de 不 et 一

- **Doute** : dans les exemples, `不` est écrit `bú` devant un 4e ton
  (`bú shì`, `bú kèqi`) et `一` est écrit `yì` / `yí` selon le ton suivant
  (`yí ge`, `yì běn`). C'est le sandhi réel, mais les entrées d'en-tête gardent le
  ton de citation (`bù`, `yī`).
- **Piste** : décider d'une règle unique (citation partout, ou sandhi partout) et
  s'y tenir. Vérifier chaque occurrence.
- **Statut** : ouvert

## Tons neutres

- **Doute** : tons neutres notés sans marque —
  `xiè xie`, `bà ba`, `mā ma`, `péng you`, `xué sheng`, `míng zi`, `shí hou`,
  `xǐ huan`, `piào liang`, `duō shao`, `zěn me`, `shén me`, `dōng xi`,
  `yī fu`, `kè qi`, `guān xi`, `jué de`, particules `de / le / ma / ne`.
- **Piste** : recouper syllabe par syllabe avec un dictionnaire (Pleco / CC-CEDICT).
  Certains dictionnaires notent `xué shēng` (2e ton) plutôt que `xué sheng`.
- **Statut** : ouvert

## Érisation (儿)

- **Doute** : `这儿 zhèr`, `那儿 nàr`, `哪儿 nǎr`, `一点儿 yì diǎnr` — pinyin noté
  avec `r` final collé. Le validateur tolère une syllabe de moins que le nombre de
  caractères pour ces cas.
- **Piste** : confirmer la graphie retenue (`nǎr` vs `nǎ r` vs `nǎ'ér`).
- **Statut** : ouvert

## Découpage grammatical

- **Doute** : les 14 points de grammaire (`src/data/hsk1/grammar.json`) et le
  découpage en 14 leçons sont un choix personnel (l'utilisateur a laissé le champ
  libre), non calqué sur un manuel précis.
- **Piste** : comparer à « HSK Standard Course 1 » ou « Kuaile Hanyu » si l'on veut
  un alignement.
- **Statut** : ouvert
