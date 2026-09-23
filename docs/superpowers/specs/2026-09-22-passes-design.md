# Passages visibles de l'ISS — `/passes/`

Spec de conception, validée section par section le 22 septembre 2026.

## 1. Intention

**Objectif.** Faire venir du monde sur ISS Live. La question que le grand public tape dans un
moteur à propos de l'ISS est « quand est-ce que je peux la voir ? ». Le site sait déjà calculer
l'orbite et le Soleil ; il ne répond pas encore à cette question.

**Pour qui.** Un visiteur venu d'un moteur de recherche, souvent sur téléphone, qui veut savoir
s'il verra la station ce soir et où regarder. Secondairement, le visiteur déjà sur la console.

**Réussite.**
- une page `/passes/` indexable, dont le texte se lit sans JavaScript ;
- un visiteur qui obtient les passages de sa ville en un geste (géolocalisation ou une recherche) ;
- des horaires justes à la dizaine de secondes près face à un calcul indépendant ;
- un visiteur qui peut partager la page et mettre un passage dans son agenda.

**Contexte.** La diffusion de télémétrie NASA est muette depuis le 14 septembre 2026. Cette page
ne dépend pas de la télémétrie : elle reste utile pendant les coupures.

**Ce que l'utilisateur a décidé** (choix explicites pendant la conception) :

| Question | Décision |
|---|---|
| Où vivent les prévisions | une page dédiée `/passes/`, pas de page par ville |
| Position | géolocalisation du navigateur **et** recherche dans une liste de villes embarquée |
| Horizon et contenu | 5 jours, tous les passages au-dessus de l'horizon ; visibles mis en avant, les autres grisés avec leur raison |
| Luminosité | une échelle en mots, le chiffre approché en infobulle, l'incertitude écrite |
| Présentation | liste avec mini-carte par passage, carte du ciel complète au clic |
| Faire revenir et partager | position mémorisée, lien par ville, export agenda — les trois |
| Architecture | une deuxième entrée Vite, `passes/index.html` |

**Hypothèses de ma part**, non discutées explicitement :
- l'interface est en anglais, comme le reste du site ;
- le style est celui des pages statiques existantes (`public/pages.css`, palette console).

## 2. Hors périmètre

- pages statiques par ville (`/passes/paris/`) — écartées au profit de la page unique ;
- noms alternatifs de villes (« Londres » pour London) — tripleraient la liste ;
- ville la plus proche d'une position géolocalisée — demanderait toutes les données ;
- notifications push, compte utilisateur, tout service serveur ;
- traduction française (piste distincte, non engagée) ;
- prévision au-delà de 5 jours ;
- reflets ponctuels (« flares ») des panneaux : leur orientation n'est pas connue, en particulier
  pendant une coupure de télémétrie.

## 3. Architecture

**Une deuxième entrée Vite.** `vite.config.ts` déclare deux entrées : `index.html` (la console,
inchangée) et `passes/index.html`. Vite émet `dist/passes/index.html`, servi par Cloudflare Pages à
`/passes/`.

**Le HTML de l'entrée porte le texte indexable en dur** : en-tête commun des pages statiques,
`h1`, accroche, et les sections explicatives (§ 7). Le script monte l'outil dans un conteneur
dédié ; tout le reste de la page existe sans JavaScript.

**Poids.** L'entrée partage les chunks déjà en cache (`react`, `orbit`). Elle ne doit charger ni
three.js, ni Lightstreamer, ni la carte (atlas, zones marines) — contrôlé au build (§ 10).

**Réutilisé tel quel :** `src/orbit/tle.ts` (chargement, cache, éléments de secours),
`src/orbit/propagator.ts` (SGP4, direction du Soleil, ombre), `src/orbit/coordinates.ts`.

**Nouveaux modules** (noms indicatifs, fixés par le plan) :

| Module | Rôle | Dépend de |
|---|---|---|
| `src/passes/findPasses.ts` | trouver et classer les passages pour un lieu et une fenêtre | `propagator`, `satellite.js` |
| `src/passes/brightness.ts` | magnitude estimée et mot associé | — |
| `src/passes/skyChart.ts` | projection hauteur/azimut → plan, est à gauche | — |
| `src/passes/cities.ts` | chargement des paquets, recherche, résolution d'un identifiant | données § 6 |
| `src/passes/place.ts` | position courante : géolocalisation, mémoire, lien | `cities` |
| `src/passes/ics.ts` | génération du fichier agenda | — |
| `src/passes/PassesApp.tsx` et composants | l'interface | tout ce qui précède |
| `scripts/build-cities.mjs` | préparation des données de villes | GeoNames |
| `scripts/verify-passes.mjs` (+ Python) | vérification contre Skyfield | Skyfield |

Chaque module de calcul est une fonction pure testable sans navigateur.

## 4. Calcul

**Échantillonnage.** Pour le lieu de l'observateur, propagation toutes les 30 s sur 5 jours
(≈ 14 400 points) ; hauteur et azimut topocentriques via `satellite.js` (`ecfToLookAngles`).
Coût attendu : quelques millisecondes, **à mesurer** ; un Web Worker seulement si la mesure le
justifie.

**Passage.** Commence quand la hauteur passe au-dessus de 0°, finit quand elle repasse dessous.
Lever, culmination et coucher affinés par dichotomie à la seconde.

**Classement, point par point le long de la trajectoire :**
- station éclairée — calcul d'ombre existant (`shadow`) ;
- observateur dans la nuit — Soleil à ≤ −6° sous l'horizon du lieu ;
- assez haut — hauteur ≥ 10°.

Un passage est **visible** si une partie de sa trajectoire réunit les trois conditions **pendant au moins une minute** (décision de l'utilisateur, 23 septembre 2026 : un passage vu quelques secondes à 10° au bord de l'ombre fait sortir pour rien ; raison affichée `seen for under a minute`). Les heures,
directions et la carte du ciel décrivent la **partie visible** ; un passage partiellement visible
le dit (« becomes visible at 20:16 », « ends in shadow at 21:05 »). Un passage invisible porte sa
raison dominante : `daylight`, `in shadow`, `too low`.

**Directions** en 16 points cardinaux (W, SSW, …). **Hauteurs** traduites en mots pour la phrase
d'instruction (« low », « halfway up », « two-thirds of the way up », « overhead ») ; les degrés
restent affichés à côté.

**Heure.** Tous les horaires sont à l'heure **du lieu observé** : fuseau de la ville (§ 6) ou,
pour la géolocalisation, fuseau du navigateur. Affichage via `Intl.DateTimeFormat`, sans
bibliothèque.

**Âge des éléments orbitaux** affiché, avec : « A reboost not yet published can move a pass by
minutes. » En ambre si les éléments sont ceux de secours ou ont plus de 3 jours.

## 5. Luminosité

Magnitude standard **−1,8 à 1 000 km** (valeur la plus citée ; source nommée sur la page),
corrigée par la distance réelle et l'angle de phase Soleil–station–observateur, la station étant
modélisée en sphère diffuse. Trois mots :

| Magnitude | Mot |
|---|---|
| ≤ −2,5 | very bright |
| ≤ −1,0 | bright |
| au-dessus | visible but faint |

Le chiffre (« ≈ −3.1 ») en infobulle ; « ±1 magnitude » écrit une fois sur la page, avec la raison :
la luminosité réelle dépend de l'orientation des panneaux et radiateurs.

## 6. Villes

**Source.** GeoNames `cities15000` (≈ 26 000 villes de plus de 15 000 habitants), licence
**CC BY 4.0**. Attribution sur `/passes/` et dans « How it works » (`renderAbout`), à côté de
Natural Earth.

**Préparation.** `scripts/build-cities.mjs`, lancé à la main (sur le modèle de `build:marine`),
télécharge l'archive, filtre, et écrit des fichiers **versionnés dans le dépôt** : le build ne
dépend pas du réseau, et un changement de données est un commit.

**Contenu par ville :** nom, nom sans accents, code pays, latitude et longitude arrondies à 0,01°,
index de fuseau (table des fuseaux commune), population, identifiant.

**Identifiant** = nom et pays sans accents (`lyon-fr`) ; suffixe numérique pour les homonymes du
même pays. Unicité vérifiée par le script, qui échoue sinon.

**Découpage en paquets par première lettre** du nom normalisé (≈ 26 paquets de 10 à 15 ko),
chargés à la demande : le premier caractère tapé dans la recherche choisit le paquet, et un lien
`?city=lyon-fr` ne charge que le paquet « l ». Poids total estimé 250–300 ko compressés,
**à mesurer** ; seuil de population relevé si trop lourd.

**Recherche** par préfixe, insensible aux accents et à la casse, classée par population.
Homonymes départagés par le pays, nommé via `Intl.DisplayNames` (« Paris, United States »).

## 7. Interface

**De haut en bas :**
1. en-tête commun des pages statiques ; « Passes » ajouté à leur navigation (`NAV` dans
   `render-pages.mjs`), au pied de la console (`SiteFooter`), au `<noscript>` de `index.html` et au
   sitemap ;
2. `h1` « When to see the ISS » et une phrase d'accroche ;
3. barre de position : « ⌖ Use my location » et « type a city… » ; une fois choisie,
   « Paris, France · times in Europe/Paris · share · change » ;
4. liste des passages : visibles avec mini-carte, direction en résumé (« W → 67° SSW → ESE »),
   luminosité, bouton agenda ; invisibles grisés sur une ligne avec leur raison ;
5. âge des éléments orbitaux ;
6. texte indexable : *Why you can't always see it*, *How bright is "very bright"*, *Your location
   stays here*, *Why five days*, sources et licences.

**Carte du ciel** (au clic sur un passage) : le ciel vu allongé sur le dos, tête au nord — **est à
gauche**, ouest à droite ; zénith au centre, horizon au bord, cercles à 30° et 60°. Trajectoire
visible en vert plein, parties non visibles en pointillé gris. Lever, culmination, coucher marqués
avec leur heure. Une phrase d'instruction en mots : « Look west, low, at 20:14. It climbs to
two-thirds of the way up in the south-south-west at 20:17, and sets east-south-east at 20:20. »

**États :**
- pas de position : barre seule, texte en dessous ;
- aucun passage visible sur 5 jours : dit, avec le décompte des raisons ;
- géolocalisation refusée : bascule vers la recherche, sans alarme ;
- éléments de secours ou vieux de plus de 3 jours : avertissement en ambre ;
- chargement d'un paquet de villes impossible : message et géolocalisation proposée.

**Accessibilité.** Chaque passage existe en texte ; la carte du ciel porte une description ;
navigation clavier de la recherche (liste d'options) ; cible Lighthouse 100.

## 8. Position, partage, mémoire

**Géolocalisation** via `navigator.geolocation`, précision basse. Coordonnées arrondies à 0,1°
**avant toute utilisation** ; elles ne quittent jamais le navigateur, et la page le dit.

**Lien** `/passes/?city=<identifiant>` uniquement — jamais de coordonnées dans l'adresse. Pour une
position géolocalisée, « share » propose de choisir une ville. Partage natif (`navigator.share`)
sur téléphone, copie du lien ailleurs.

**Canonique** : `/passes/` pour toutes les variantes `?city=`.

**Mémoire** en `localStorage` : l'identifiant de ville, ou la position arrondie et son fuseau.
Toute lecture et écriture protégée par `try/catch` ; la page fonctionne stockage bloqué. Priorité :
lien `?city=` > mémoire > rien. « change » efface la mémoire.

## 9. Agenda

Fichier `.ics` généré dans le navigateur, un événement :
- `DTSTART`/`DTEND` = la partie visible, en UTC ;
- `SUMMARY` « ISS pass — very bright » ;
- `LOCATION` la ville, ou « your location » ;
- `DESCRIPTION` : l'instruction en mots, l'avertissement sur les rehaussements, le lien de la page ;
- `VALARM` 10 minutes avant ;
- `UID` stable (lieu + heure de début), pour qu'un second ajout remplace le premier ;
- conforme RFC 5545 : fins de ligne CRLF, lignes repliées à 75 octets, échappements.

## 10. Vérification

**Contre une source indépendante — `npm run verify:passes`.** Les mêmes passages calculés par
**Skyfield** (Python ; autre SGP4, autres éphémérides, `find_events`, `is_sunlit`) sur le même jeu
d'éléments, pour Paris, Tromsø, Quito, Ushuaïa, Tokyo, Honolulu, sur 5 jours. Critères :
- mêmes passages des deux côtés ;
- lever, culmination, coucher à ±10 s ;
- hauteur maximale à ±0,5° ;
- même classement.
Échec au moindre écart, avec le passage fautif imprimé. Skyfield hors du build.

**Luminosité** : comparaison manuelle à Heavens-Above sur une dizaine de passages, résultat noté
dans la doc ; seuils ajustés une fois si le biais est systématique, en l'écrivant.

**Tests unitaires** (Vitest, écrits pour échouer avant le code) : détection d'un passage sur des
éléments figés ; raison d'invisibilité et passage partiellement visible ; heure du lieu (Tokyo lu
depuis Paris) ; projection est-à-gauche ; arrondi de géolocalisation ; unicité des identifiants ;
`.ics` conforme ; page fonctionnelle `localStorage` bloqué.

**Contrôles de build** : `/passes/` a titre, un seul `h1`, canonique, texte lisible sans
JavaScript ; présente au sitemap ; son graphe de chunks (manifeste Vite) exclut three.js,
Lightstreamer, l'atlas et les zones marines.

**Mesures avant de conclure** : Lighthouse mobile sur `/passes/` (accessibilité 100, performance
≥ 95) ; poids réel du chargement initial et d'un paquet de villes ; temps de calcul des 5 jours.

**Test réel** : un passage visible observé depuis chez l'utilisateur, à l'heure et dans la
direction annoncées.

## 11. Risques

- **Rehaussement d'orbite** entre la publication des éléments et le passage : décalage de plusieurs
  minutes. Atténué par l'avertissement et l'âge affiché ; non éliminable.
- **Luminosité** : ±1 magnitude au mieux ; assumé et écrit.
- **Poids des villes** au-dessus de l'estimation : seuil de population relevé.
- **Contenu jugé mince** par les moteurs : atténué par le texte explicatif en dur ; à surveiller
  dans Search Console.
