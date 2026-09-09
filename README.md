# HiPay Order API — Suite d'automatisation BDD

Suite de tests automatisés (CodeceptJS + Gherkin + Page Object) pour l'endpoint
`POST /v1/connector/order` de la Cloud API for Nepting (HiPay).

Ce dépôt correspond au livrable "AUTOMATISATION" du test technique QA Analyst.
L'analyse et la stratégie de test complètes sont documentées dans [`STRATEGY.md`](./STRATEGY.md).

## Pourquoi un mock server ?

Aucune credential réelle pour l'environnement stage HiPay (`HIPAY_API_LOGIN`/`HIPAY_API_PASSWORD`)
n'était disponible dans le cadre de cet exercice. Plutôt que de livrer une suite qui échouerait
silencieusement en `401`, la suite tourne par défaut contre un **mock server** (`mock-server/`)
qui reproduit fidèlement le contrat documenté par HiPay : mêmes codes HTTP, mêmes formats
d'erreur, même exigence d'authentification HTTP Basic.

La même suite est conçue pour être rejouée telle quelle contre le vrai staging HiPay
(`TEST_ENV=stage`) dès que des credentials sont fournies — voir [Environnements](#environnements).

## Structure du projet

```
├── features/                  Scénarios Gherkin (.feature)
├── step_definitions/          Implémentation des steps (Given/When/Then)
├── pageobjects/orderApi.js    "Page Object" de l'API : construction des payloads + appel HTTP
├── config/environments.js     Résolution de l'environnement cible (mock | stage)
├── mock-server/                Mock Express reproduisant le contrat HiPay documenté
├── codecept.conf.js           Configuration CodeceptJS (Gherkin, reporting)
├── .github/workflows/ci.yml   Pipeline CI
└── STRATEGY.md                 Analyse et stratégie de test (livrable ANALYSE et STRATÉGIE)
```

Le pattern **Page Object** est appliqué à l'API plutôt qu'à l'UI : `pageobjects/orderApi.js`
encapsule toute la connaissance du endpoint (construction de payload, header d'authentification,
appel HTTP). Les steps Gherkin ne manipulent jamais directement une requête HTTP.

## Prérequis

- Node.js 20+ (testé avec Node 22)
- Docker (optionnel, pour lancer le mock server en conteneur)

## Installation

```bash
npm install
cp .env.example .env
```

## Exécution locale (contre le mock)

Dans un premier terminal :
```bash
npm run mock:start
```

Dans un second terminal :
```bash
npm test                # exécution simple, sortie console
npm run test:report     # génère un rapport HTML dans output/execution-report.html
npm run test:smoke      # ne rejoue que les scénarios @smoke
```

Alternative avec Docker pour le mock :
```bash
docker compose up --build -d
npm run test:report
docker compose down
```

## Exécution contre le vrai staging HiPay

```bash
TEST_ENV=stage HIPAY_API_LOGIN=xxx HIPAY_API_PASSWORD=xxx npm run test:report
```

La configuration échoue rapidement (fail-fast) avec un message explicite si `TEST_ENV=stage`
est utilisé sans credentials, plutôt que de laisser chaque scénario échouer un par un en `401`.

## Scénarios automatisés

| Feature | Ce qui est validé |
|---|---|
| `order-payment-success.feature` | Paiement nominal, payload minimal et complet → `200` / `paymentStatus: Success`, + cohérence des données echoées (`order`/`customer`/`technical_pos_info`) |
| `order-payment-validation.feature` | Champ obligatoire manquant → `400` avec le code et le chemin d'erreur exacts documentés |
| `order-payment-unauthorized.feature` | Absence de header ou credentials invalides → `401` |
| `order-payment-terminal-unavailable.feature` (bonus) | Terminal POS injoignable → `502` |

**Positionnement dans la stratégie de test**

Cette suite correspond au niveau **tests de composant/contrat** de la stratégie de test
définie dans [`STRATEGY.md`](./STRATEGY.md). La stratégie complète prévoit également des
tests **End-to-End** exécutés sur un environnement dédié (staging), contre le vrai service
déployé avec un terminal POS physique — c'est ce niveau qui valide réellement le
comportement du système complet, au-delà de ce qu'un contrat simulé peut couvrir.

Ce niveau E2E n'a pas pu être mis en œuvre dans le cadre de cet exercice, faute d'accès à
un environnement staging réel et à un terminal physique (voir [Pourquoi un mock server ?](#pourquoi-un-mock-server-)).
Ce qui est livré ici en constitue donc le premier niveau — nécessaire mais pas suffisant
au regard de la stratégie complète.

Le mock server simule les cas impossibles à provoquer sur un vrai terminal physique
(`403`, `500`, `502`, `504`) via une convention de préfixe sur `order_id` : `FORBIDDEN_`,
`SERVERERROR_`, `BADGATEWAY_`, `TIMEOUT_`, `FAIL_`, `BUSY_`. Voir `mock-server/server.js`.

Un point de contrat volontairement testé : la documentation HiPay utilise la clé
`pos_technical_info` dans la requête mais `technical_pos_info` dans l'exemple de réponse `200`.
Le mock reproduit cette incohérence documentée pour que la suite reste alignée sur le contrat
réel plutôt que sur une version "corrigée" de notre propre initiative.

## Granularité du rapport d'exécution

Chaque scénario attache au rapport mochawesome (onglet "Context" par test, visible
dans `output/execution-report.html`) les éléments de preuve nécessaires pour investiguer
sans avoir à rejouer le test :

- La commande **curl exacte** envoyée (header `Authorization` toujours masqué : `Basic ***MASKED***`)
- Le **payload** envoyé
- Le **code de statut** HTTP retourné
- Le **corps de la réponse** complet
- Un **Request ID** (`X-Request-Id`), généré côté test, renvoyé par le mock dans chaque
  réponse (succès et erreur) et journalisé côté serveur (`[mock-server] requestId=... -> <status>`) —
  utilisable pour retrouver la requête correspondante dans les logs

Cette mécanique est implémentée dans `pageobjects/orderApi.js` (construction des diagnostics)
et `reporting/mochawesomeContextPlugin.js` (pont vers l'API `addContext` de mochawesome, les
scénarios Gherkin n'ayant pas nativement accès à l'objet Test Mocha).

## Données de test dynamiques et cohérence du contrat

`pageobjects/orderApi.js` génère aléatoirement les champs "données" de chaque payload
(montants, identifiants, coordonnées client, références produit...) à chaque appel, plutôt
que d'utiliser des littéraux figés. Les champs relevant d'une énumération métier documentée
de manière incomplète (`transaction_type`, `protocol`) restent volontairement fixes.

Les scénarios nominaux (`order-payment-success.feature`) exploitent ce caractère dynamique
pour vérifier la **cohérence du contrat** : les sections `order`, `customer` et
`technical_pos_info` renvoyées dans la réponse doivent correspondre exactement à ce qui a
été envoyé. Comme les valeurs changent à chaque exécution, cette assertion est réellement
probante — elle ne repose pas sur deux constantes qui coïncideraient de toute façon.

## Stratégie de tags

- `@smoke` : sous-ensemble minimal à exécuter en continu (y compris en synthetic monitoring)
- `@nominal` : chemins de succès métier
- `@negative` : validation et rejets attendus
- `@auth` : authentification
- `@contract` : conformité au contrat documenté
- `@resilience` : dépendances externes défaillantes (terminal POS)

Exécution ciblée : `npx codeceptjs run --grep @auth`

## Qualité

```bash
npm run lint          # ESLint sur le code JS
npm run lint:gherkin  # gherkin-lint sur les fichiers .feature
npm run lint:all
```

## Environnements

| Nom | Base URL | Usage |
|---|---|---|
| `mock` (défaut) | `http://localhost:3000` | CI, développement local, démonstration |
| `stage` | `https://cloudrun-api-yugcnet4yq-ew.a.run.app` | Intégration réelle, nécessite des credentials |

## CI

Le pipeline (`.github/workflows/ci.yml`) exécute à chaque push/PR : lint → démarrage du mock
→ suite complète → publication du rapport mochawesome en artifact. Un job séparé, déclenché
manuellement (`workflow_dispatch`), permet de rejouer les scénarios `@smoke` contre le vrai
staging si les secrets `HIPAY_API_LOGIN`/`HIPAY_API_PASSWORD` sont configurés sur le repo.

## Limitations connues

- Sans accès au staging réel ni à un terminal POS physique, les scénarios `200`/`403`/`502`/`504`
  ne sont validés qu'au niveau contrat (mock), pas en conditions réelles.
- Le niveau **End-to-End** de la stratégie (environnement staging réel, terminal physique) n'a
  pas pu être mis en œuvre dans le cadre de cet exercice ; seul le niveau contrat est couvert
  par cette suite.
- Les tests de performance/résilience évoqués dans `STRATEGY.md` (k6/Artillery, synthetic
  monitoring) sont documentés comme axes de maturité mais non implémentés ici, faute
  d'environnement de prod/staging accessible dans le cadre de cet exercice.
