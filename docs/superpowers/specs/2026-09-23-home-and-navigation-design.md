# Accueil, navigation commune et console allégée

Spec de conception, validée section par section le 23 septembre 2026.

## 1. Intention

**Le problème.** Les pages explicatives — `/passes/`, la station module par module, les six
sous-systèmes, « How it works » — ne sont atteignables depuis la console que par un bloc « Read about
it » placé en bas de la colonne de droite, hors champ sur un écran ordinaire. Et la console, qui est
la page d'accueil, est dense : un pupitre d'opérateur, pas une porte d'entrée. Pendant la coupure de
la diffusion NASA (muette depuis le 14 septembre 2026), elle montre surtout des tirets.

**Pour qui.** Le visiteur venu d'un moteur de recherche, souvent sur téléphone, qui ne connaît rien
à la télémétrie ; secondairement l'habitué, qui veut la console complète.

**Réussite.**
- un visiteur qui arrive sur `/` comprend en un écran où est la station, s'il peut la voir, et où
  aller ensuite ;
- toutes les pages du site sont atteignables depuis toutes les autres par une barre visible ;
- la console reste un pupitre complet, sans perte de place pour la carte et les lectures ;
- l'accueil fonctionne pendant une coupure de télémétrie.

**Ce que l'utilisateur a décidé :**

| Question | Décision |
|---|---|
| Ce qui gêne | les deux : les pages explicatives noyées, et la console trop chargée |
| Ce que voit le visiteur en arrivant | une nouvelle page d'accueil ; la console déménage à `/console/` |
| Contenu de l'accueil | la carte et une phrase de position, le prochain passage visible, les portes, une présentation ; l'état de la diffusion NASA réduit à une ligne sous la carte |
| La console | navigation commune, et colonne de droite repliable ; « Read about it » supprimé |
| Architecture | l'accueil devient l'entrée `index.html`, la console passe dans `console/index.html` |
| Disposition de l'accueil | option B, « la réponse d'abord » : le titre est la position |

**Hypothèses de ma part :** interface en anglais comme le reste du site ; palette et typographie de
la console et de `pages.css`, inchangées.

## 2. Hors périmètre

- refonte de la disposition de la console (carte, vue 3D, bandeau, lectures) ;
- menu « hamburger » ou navigation repliée ;
- géolocalisation depuis l'accueil (elle reste sur `/passes/`) ;
- valeurs de télémétrie sur l'accueil (seule une ligne d'état) ;
- traduction française.

## 3. Architecture

**Trois entrées Vite** au lieu de deux :

| Adresse | Entrée | Contenu |
|---|---|---|
| `/` | `index.html` | l'accueil (nouveau) |
| `/console/` | `console/index.html` | la console, code inchangé hormis la barre et la colonne |
| `/passes/` | `passes/index.html` | inchangé, sauf la barre |

Les pages rendues par `scripts/build-pages.mjs` gagnent une page, `/telemetry/`.

**Réutilisé :** `src/orbit/tle.ts`, `src/orbit/propagator.ts` (`propagateIss`, `groundTrack`),
`src/orbit/coordinates.ts`, `src/orbit/overflight.ts` (chargé en différé), `src/passes/findPasses.ts`,
`src/passes/place.ts` (lecture de la ville mémorisée), `src/passes/describe.ts`, `src/passes/time.ts`,
`src/passes/brightness.ts`, la projection de la carte de la console (`src/scene/map/projection.ts`).

**Nouveaux éléments** (noms indicatifs, fixés par le plan) :

| Élément | Rôle |
|---|---|
| `src/site/nav.ts` | la liste unique des entrées de la barre, lue par la console (React) et par `render-pages.mjs` |
| `src/home/` | l'application de l'accueil : position, carte, prochain passage, ligne NASA |
| `scripts/build-home-map.mjs` | dessine une fois la carte du monde en SVG statique depuis Natural Earth |
| `worker/src/index.js` | nouveau point d'accès `/status` |
| `renderSystems` dans `render-pages.mjs` | la page `/telemetry/` |

## 4. Navigation commune

Une seule barre, sur toutes les pages : `ISS LIVE` (lien vers `/`) · **Console** (`/console/`) ·
**When to see it** (`/passes/`) · **The station** (`/station/`) · **Systems** (`/telemetry/`) ·
**How it works** (`/about/`).

- Cinq entrées au lieu des neuf actuelles : les six sous-systèmes sont regroupés derrière **Systems**.
- **`/telemetry/`**, nouvelle page rendue au build : les six sous-systèmes, chacun avec son titre
  lié et son accroche (`tagline`), plus une phrase d'introduction. Les pages de sous-système gardent
  leur pagination précédent/suivant.
- Pas de menu caché : la barre passe sur deux lignes sur un petit téléphone.
- L'entrée courante porte `aria-current="page"`.
- **Source unique** : la liste vit dans `src/site/nav.ts` ; `render-pages.mjs` l'importe (comme les
  scripts importent déjà du `.ts`) et la console React l'importe aussi.
- **Dans la console** : la barre remplace le nom seul de l'en-tête ; statut du flux, compteurs,
  bascule Map/Station, Sources et GitHub restent à droite.
- Le pied de page commun des pages statiques apparaît sur l'accueil ; la console n'en a pas.

## 5. La console

- **Adresse** `/console/`. Liens de pièce : `/console/?part=<id>`. `renderStation` et
  `renderSubsystem` produisent ces liens ; les liens internes de la console aussi (`deepLink.ts`).
- **Anciens liens** `/?part=<id>` : un script dans l'en-tête de l'accueil, exécuté avant tout
  affichage, remplace l'adresse par `/console/?part=<id>` (en conservant le reste de la requête et le
  fragment). `/` sans `part` ne redirige pas.
- **Canonique** `https://iss-live.pages.dev/console/`, carte de partage propre, présence au sitemap.
- **Colonne de droite :**
  - Orbite / Inspecteur : toujours ouvert.
  - Fraîcheur des données et Prochaine orbite : éléments `<details>` natifs, **fermés par défaut**,
    avec un résumé qui porte l'information essentielle (« Data freshness — broadcast silent since
    14 Sep », « Next orbit — 36 min in Earth's shadow »). L'état ouvert/fermé est mémorisé en
    `localStorage`, chaque accès protégé ; la page fonctionne stockage bloqué.
  - Le bloc « Read about it » (`SiteFooter`) est supprimé.
- **Inchangés :** carte, vue 3D, bandeau d'état, lectures de sous-systèmes, et leurs dimensions
  mesurées (1366, 1600, 1920, 1292×677).

## 6. L'accueil

**Disposition (option B), de haut en bas :**
1. la barre commune ;
2. « RIGHT NOW », puis le `h1` : « The International Space Station, right now » en petit, et la
   position en grand — « Over the South Atlantic, 418 km up. » ;
3. une ligne : vitesse, éclairage (in sunlight / in Earth's shadow), et l'état de la diffusion NASA ;
4. la carte : côtes, trace de −45 à +90 min, position ;
5. le prochain passage, en une phrase-action ;
6. la présentation d'ISS Live ;
7. les quatre portes : Live console, When to see it, How the station works (`/telemetry/`), About
   this site (`/about/`) ;
8. le pied de page commun.

**Texte en dur.** Le HTML contient le `h1` avec une ligne de position de repli — « somewhere over the
Earth, about 420 km up » — que le script remplace ; l'espace de cette ligne est réservé pour qu'aucun
texte ne bouge. Il contient aussi la présentation, les portes et un court « What is ISS Live ».

**La carte.** `scripts/build-home-map.mjs` dessine, une fois, les terres de Natural Earth (les mêmes
que la carte de la console) en SVG équirectangulaire, écrit dans `public/`. Le navigateur superpose en
SVG la trace et la position, calculées par `propagator.ts`, avec la projection de la console. Aucun
chargement de l'atlas.

**Le nom du lieu survolé.** `overflight.ts` (zones marines, ≈ 300 ko non compressés) est chargé
**après** le premier affichage. La ligne montre d'abord les coordonnées (« 12.3° S, 25.1° W, 418 km
up »), puis le nom. Si le chargement échoue, les coordonnées restent. Coût réel à mesurer ; si trop
lourd, le nom devient facultatif.

**Le prochain passage.** Si une ville est mémorisée par `/passes/` (même clé `localStorage`, même
validation), l'accueil calcule son prochain passage visible (`findPasses`, règles identiques, minute
continue comprise) : « See it tonight from Paris — 20:30 · very bright ». Sinon : « When can you see
it from your city? » avec un lien vers `/passes/`. Si les éléments orbitaux ont plus de 14 jours, pas
d'horaire (même règle que `/passes/`).

**La ligne NASA.** Lue depuis le Worker collecteur, nouveau point d'accès `/status` (§ 7) : « Live
telemetry from the station » ou « NASA's broadcast silent since 14 Sep ». Si le point d'accès ne
répond pas, la ligne est absente, sans erreur.

**Référencement.** Canonique `https://iss-live.pages.dev/`, données structurées `WebSite` (et
`WebApplication` pour la console, sur sa page), description orientée « where is the ISS now ».

**Budget.** Premier chargement ≈ 100 ko transférés, comme `/passes/`. Le contrôle de build refuse
three.js, Lightstreamer et l'atlas dans le graphe de l'accueil ; seules les zones marines sont admises,
en import dynamique.

## 7. Worker : `/status`

Le collecteur (`worker/src/index.js`) expose `GET /status` :
`{ "live": boolean, "lastLive": ISO | null, "checkedAt": ISO }` — `live` vrai si des mises à jour
de la station (`pushes > 0`) ont été reçues dans les 10 dernières minutes ; `lastLive` la dernière
minute où c'était le cas. Une seule requête D1 (la dernière ligne avec `pushes > 0`, et la dernière
ligne tout court). En-têtes : `Access-Control-Allow-Origin: https://iss-live.pages.dev`,
`Cache-Control: public, max-age=60`. Redéploiement du Worker **sur accord explicite** de l'utilisateur,
avant celui du site.

## 8. Vérification

**Tests unitaires** (écrits pour échouer d'abord) : barre commune (cinq entrées, entrée courante,
source unique pour React et `render-pages`) ; redirection `/?part=` (script tel que dans la page ;
paramètres et fragment conservés ; pas de redirection sans `part`) ; position (coordonnées puis nom ;
nom indisponible → coordonnées) ; prochain passage (ville mémorisée, aucune, valeur illisible) ; ligne
NASA (active, silencieuse avec date, point d'accès muet) ; `/status` du Worker (forme, en-têtes) ;
blocs repliables (fermés par défaut, résumé, mémoire, stockage bloqué).

**Contrôles de build** : `/`, `/console/`, `/telemetry/` passent les contrôles de page existants ;
graphe de l'accueil sans chunk lourd ; sitemap à 12 adresses ; aucun lien généré vers `/?part=`.

**Mesures** : Lighthouse mobile sur `/`, `/console/`, `/telemetry/` (accessibilité 100 ; performance
de l'accueil ≥ 95 ; pas de recul de la console) ; poids de l'accueil et coût des zones marines ;
dimensions de la carte et des lectures de la console aux tailles déjà vérifiées, colonne repliée et
dépliée.

## 9. Risques

- **Référencement** : `/` change de contenu ; la console reste trouvable par la barre, le sitemap et
  les redirections. Redemander l'indexation de `/` et `/console/` dans Search Console.
- **Liens externes vers `/?part=`** : couverts par le script de redirection, pas par Cloudflare.
- **Worker non redéployé** : l'accueil fonctionne, la ligne NASA manque.
- **Zones marines trop lourdes** : repli sur les coordonnées seules.
