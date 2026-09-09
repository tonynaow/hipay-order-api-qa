# Analyse et stratégie de test — HiPay Order API

## Méthodologie de réalisation

Cet exercice — analyse, stratégie de test et automatisation — a été réalisé par Tony Arroumugamme
avec l'assistance de l'agent IA Warp, utilisé comme outil de co-construction tout au long du
processus : extraction des critères d'acceptation depuis la documentation HiPay, formulation et
itération de la stratégie de test, puis implémentation de la suite d'automatisation. Chaque
proposition de l'outil a été revue, challengée et validée avant d'être retenue, avec plusieurs
itérations de correction et d'approfondissement au fil du travail.

## Contexte et cadrage

Nous sommes QA au sein de la squad back HiPay qui **conçoit et possède** le endpoint
`POST /v1/connector/order` (Cloud API for Nepting). Ce cadrage change la nature du travail :
il ne s'agit pas de tester une API tierce en boîte noire après coup, mais d'intervenir
**tout au long du processus de développement**, de la conception à la mise en production —
une démarche shift-left explicitement demandée par le contexte de l'exercice.

Le périmètre couvert est strictement celui de l'énoncé : `POST /v1/connector/order`.

## Critères d'acceptation extraits de la documentation HiPay

**Authentification (HTTP Basic obligatoire sur chaque requête)**
- Header absent, vide, mal formé, ou credentials invalides → `401`
- Seules les credentials de type "Private" sont acceptées

**Validation de la requête**
- Champ obligatoire manquant → `400`, `code: required.openapi.requestValidation`,
  `details.path` pointant le champ concerné
- Champ présent mais hors format/valeurs attendues → `400`

**Comportement métier du `200`**
- Le code `200` recouvre 3 issues distinctes : succès, échec/rejet/annulation/timeout côté porteur,
  ou terminal déjà occupé — le `paymentStatus` doit être vérifié, pas seulement le code HTTP
- Point de vigilance contrat : la requête utilise la clé `pos_technical_info`, mais l'exemple de
  réponse `200` de la documentation renvoie cette même section sous la clé `technical_pos_info`

**Dépendance au terminal POS (hors de notre contrôle direct)**
- Passphrase non initialisée → `403`
- Terminal injoignable (éteint, sans internet, service désactivé, déconnecté) → `502`
- Aucune app (HiPay/Nepting) ne répond → `504`
- Contrainte technique dure et déjà documentée par HiPay : le terminal dispose d'un maximum de
  **10 secondes** pour acquitter, au-delà duquel le `504` est obligatoire — c'est le point
  d'ancrage naturel de tout SLO de latence sur ce endpoint

**Erreurs génériques**
- Ressource inconnue → `404` ; erreur interne imprévue → `500`

## Ce qui est testé/automatisé

- **Contrat et cohérence structurelle** : schéma de requête/réponse pour chaque code, y compris
  la vérification explicite de l'incohérence `pos_technical_info` / `technical_pos_info`
- **Authentification et sécurité** : les variantes de rejet d'auth, aucune credential ne doit
  apparaître dans les logs/rapports
- **Validation métier** : un scénario par champ obligatoire (via `Scenario Outline`), classes
  d'équivalence sur les champs numériques/enum
- **Issues métier du `200`** : les 3 sous-cas de succès, simulés via un mock puisqu'ils dépendent
  d'un état physique du terminal impossible à provoquer à la demande
- **Dépendances externes** (`403`/`500`/`502`/`504`) : simulées à la frontière que la squad maîtrise
- **Non-fonctionnel (SLA/SLO/SLI)** : latence propre à notre traitement (hors acquittement
  terminal), comportement au bord de la limite des 10s, taux d'erreur catégorisé pour ne pas
  fausser le calcul de disponibilité

## Stratégie — shift-left, avant et après la mise en service

### Avant le développement (conception, Definition of Ready)
- Atelier de spécification collaboratif (dev/QA/PO) à partir des critères d'acceptation
  ci-dessus, formalisés directement en Gherkin — c'est une pratique BDD à part entière, pas une
  documentation écrite après coup
- Définition du SLO interne dès cette étape (ex. P95 < 2s, P99 < 5s, avec une marge confortable
  sous la limite dure des 10s)
- Levée explicite des ambiguïtés de contrat identifiées (incohérence de nommage, exemples de
  réponse d'erreur de la doc HiPay qui semblent tous recopier le même exemple `400`)

### Pendant le développement, avant mise en service
- Tests unitaires (devs) sur la validation/mapping, QA en support sur la couverture des cas limites
- Tests de composant/intégration avec le terminal mocké, couvrant tous les codes documentés de
  façon déterministe
- Tests de contrat automatisés sur chaque code de réponse
- Suite BDD/CodeceptJS + Page Object (ce dépôt), exécutée en CI à chaque PR contre un mock,
  et contre le staging réel dès que des credentials CI sont disponibles
- Tests de performance légers (k6/Artillery — **pas** CodeceptJS, qui ne fait pas de test de
  charge), non bloquants, comparés au SLO défini en conception
- Tests de résilience ciblés sur la limite des 10s (déclenchement correct du `504`)
- Checklist Go/No-Go avant release : contrat + intégration mockée au vert (bloquant), smoke E2E
  réel au vert si un environnement de test terminal est disponible, perf dans le budget SLO

### Après la mise en service
- **Synthetic monitoring** : rejeu régulier d'un sous-ensemble `@smoke` de cette même
  suite contre la prod réelle, pour mesurer en continu les SLI (disponibilité, latence,
  conformité de schéma) — particulièrement pertinent ici puisque plusieurs modes de défaillance
  (`403`/`502`/`504`) dépendent du matériel/de l'app Android du partenaire, hors de portée du
  seul test pré-release
- Suivi d'un **error budget** sur le SLO (ex. taux `5xx` > seuil sur fenêtre glissante) avec
  alerting, pouvant déclencher un gel de release si consommé
- Ré-exécution de la suite de régression à chaque déploiement, plus un run complet planifié
  (nightly) incluant les scénarios négatifs
- Boucle de rétroaction : tout incident ou cas limite observé en production devient un nouveau
  scénario Gherkin ajouté à la suite

## Point à éclaircir : cas de test non détaillés dans la documentation

La documentation HiPay décrit textuellement plusieurs comportements sans préciser ni les
valeurs exactes attendues, ni comment les reproduire de façon fiable :
- Les 2 issues du code `200` autres que le succès (paiement rejeté/annulé/expiré, terminal
  déjà occupé) : seul `"Success"` est donné comme exemple de valeur pour `paymentStatus`,
  les autres valeurs ne sont pas documentées
- Les causes documentées des codes `403`/`502`/`504` (passphrase non initialisée, terminal
  injoignable sous ses différentes formes, timeout applicatif) : décrites narrativement mais
  sans indication sur la manière de les provoquer de manière contrôlée et répétable

Avant d'ajouter des cas de test sur ces scénarios, il est nécessaire d'échanger avec l'équipe
métier et les développeurs pour clarifier :
- Les valeurs exactes à attendre en réponse pour chacun de ces cas
- Le moyen de les reproduire de façon fiable (environnement de simulation, état préalable du
  terminal, ou autre mécanisme fourni par HiPay/Nepting)
- Le niveau auquel ils doivent être testés (composant/contrat avec un comportement à convenir,
  E2E réel nécessitant du matériel physique, ou les deux)

Ces cas de test seront conçus et ajoutés à la suite une fois ces points clarifiés.

## Limitations de cet exercice

Sans accès aux credentials réelles ni à un terminal POS physique, la suite livrée tourne contre
un mock server qui reproduit fidèlement le contrat documenté (voir `README.md`). Les axes
"post mise en service" (synthetic monitoring, error budget, tests de charge) sont documentés
comme stratégie cible mais non implémentés faute d'environnement de production accessible.
