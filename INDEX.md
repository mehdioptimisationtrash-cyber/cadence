# Cadence (dossier Chord/)

> Dernière analyse: 2026-10-01

PWA (iPhone + Mac) de composition harmonique façon Scaler / Chord Wizard : progressions d'accords, harmonisation, mélodies, export MIDI. Vanilla JS (modules ES), aucun build, sons synthétisés en Web Audio, hors ligne.

**En ligne :** https://mehdioptimisationtrash-cyber.github.io/cadence/ (repo `mehdioptimisationtrash-cyber/cadence`, GitHub Pages sur `main`).

## Architecture & fichiers clés
- `js/theory/slash.js` — accords slash (renversements, couleurs de basse, pédales, basse fluide).
- `js/theory/` — notes & orthographe (`notes.js`), 19 gammes/modes (`scales.js`), 37 qualités d'accords + détection (`chords.js`), harmonie : accords diatoniques par empilement de tierces, chiffrage romain, fonctions T/SD/D, emprunts, dominantes secondaires, substitutions, suggestions « et ensuite ? » (`harmony.js`), voicings + conduite des voix (`voicing.js`).
- `js/gen/` — 52 progressions célèbres + générateur par ambiance (`progressions.js`), mélodie motivique (`melody.js`), motifs de jeu accords/basse + swing (`patterns.js`), compilation en notes datées (`arrange.js`).
- `js/audio/` — instruments synthétisés + réverb (`synth.js`), lecteur à lookahead (`player.js`).
- `js/midi/` — export .mid type 1 (`export.js`), sortie Web MIDI Chrome (`webmidi.js`).
- `js/state.js` (magasin immuable, annuler/rétablir, sanitize, localStorage, liens #s=), `js/actions.js` (actions pures), `js/app.js` (assemblage, raccourcis, boucle d'animation).
- `js/ui/` — un fichier par zone (topbar, timeline, inspector, palette, generatePanel, melodyPanel, soundPanel, toolsPanel, keysheet, keyboard, pianoroll).
- `sw.js` réseau d'abord ; **à chaque modif : augmenter `CACHE_VERSION` et `APP_VERSION` (`js/version.js`)**, et ajouter tout nouveau fichier JS à `SHELL`.

## Lancer / tester
- `npm run serve` → http://localhost:8777
- `npm test` (23 tests unitaires) · `node tests/e2e-flow.mjs <dossier-captures> webkit` (Playwright, parcours complet)
- Icônes : `node tools/make_icons.mjs` (depuis `icons/icon.svg`)

## Activité récente
- 2026-10-01 : création complète, revue de code (10 points corrigés), mise en ligne.
- 2026-10-01 : roue des quintes à l'écoute (v2) ; export MIDI repensé (v3) : choix du contenu, Partager (AirDrop/Fichiers) sur iPhone, tuile glisser-déposer vers le DAW (Chrome/Edge uniquement — Safari ne le permet pas).
- 2026-10-01 : décrochages audio iPhone (v4) : horloge dans un worker (`js/audio/clock-worker.js`), réserve audio « playback » sur tactile, programmation 0,5 s à l'avance, notes en retard jouées au lieu d'être sautées, relance après interruption iOS, plafond de voix. Mesuré : charge audio ~3-4 % sur Mac, aucun décrochage simulé — la cause exacte sur iPhone reste à confirmer par Mehdi.
- 2026-10-01 : son coupé après avoir quitté l'app (v5) : à la sortie (visibilitychange/pagehide) on arrête la lecture et on ferme l'AudioContext (`synth.reset()`), un contexte neuf est recréé au premier toucher. `window.cadenceAudio()` = diagnostic pour les tests.
- 2026-10-01 : basse modifiable à la main (v6) : `state.bassLine {custom, notes, stale}`, `freezeBass`/`releaseBass`/`setTrackNotes` (actions), barre d'édition au-dessus du piano roll (Mélodie/Basse, durée, aimant), vue zoomée avec noms de notes, glisser pour déplacer.
- 2026-10-02 : éditeur de notes plein écran (v7, `js/ui/noteEditor.js` + règles pures `js/gen/noteEdit.js`) : glisser = défiler, pincer = zoomer, crayon explicite (ou double-toucher) pour ajouter, toucher = sélectionner, barre d'actions (hauteur, octave, durée, dupliquer, supprimer), annuler/rétablir visibles, aucune superposition. Le mini piano roll redevient une simple vue.
- 2026-10-02 : accords sur une autre basse (v8, `js/theory/slash.js`) : section palette (couleurs de basse, renversements, pédale), suggestions à basse conjointe, variantes + choix rapide de basse dans l'inspecteur, curseur « Basse fluide » du générateur (programmation dynamique), 8 progressions « Basses mobiles », chiffrage romain avec basse (IV/V).
- 2026-10-02 : étouffement des voix (v9) : `synth.play(..., choke)` — en lecture un nouvel accord coupe le précédent (token = index d'accord), mélodie et basse monophoniques, chaque écoute (accord ou note) coupe la précédente. Vérifié par rendu hors ligne (résidu 0).
- 2026-10-02 : clavier jouable (v10, `js/ui/keybed.js`) : multitouch, nom de note/accord en direct, « Maintenir » pour construire un accord (`ui.builder`), saisie au clavier du Mac (positions physiques), octaves ◀ ▶ sur mobile. Accordeur micro (`js/ui/tuner.js` + détection NSDF `js/audio/pitch.js`) : aiguille ±50 cents, validation manuelle ou auto, notes ajoutées à l'accord en construction. Détecteur de l'onglet Outils supprimé (remplacé par le clavier).
- 2026-10-02 : accordeur accéléré (v11) : détection YIN (seuil de volume 0,0015 au lieu de 0,012, qui ignorait les sons d'un vrai micro), suivi `createPitchTracker` (note confirmée sur 2 lectures, aiguille lissée, tenue pendant les micro-coupures), validation auto 380 ms. 60–90 ms jusqu'à l'affichage. Banc : `node tools/pitch-latency.mjs`.
- 2026-10-02 : fiabilité (v12) : voicing indépendant par accord (écoute = lecture, plus d'effet sur les voisins) ; mélodie/basse écrites recalées automatiquement quand un accord change (`js/gen/adapt.js`) ; réservoir mélodique par accord (pas de frottement sur les emprunts) ; silences `{rest:true}` ; insertion « + » entre les cartes (curseur `ui.insertAt`, bandeau) ; lignes écrites jouées sans swing (éditeur = lecture) ; orthographe des gammes exotiques corrigée ; doublons du générateur supprimés. Audit `tests/theory-audit.test.js` (12 tonalités × 19 gammes × 37 qualités × 5 voicings).
- 2026-10-02 : toucher une carte (v13) joue l'accord + la basse réellement enregistrée à cet endroit (`ctx.auditionAt`, lue dans `arrange`), aussi pour les flèches et l'inspecteur.
- 2026-10-02 : basse écrite sacrée (v14, `js/gen/adapt.js` réécrit) : les notes écrites suivent leur accord (par id) lors des insertions/suppressions/déplacements ; la basse écrite n'est modifiée que si la basse de l'accord change explicitement (seules les notes posées sur l'ancienne basse bougent) ; remplacer toute la progression (modèle/générateur) remet la basse au motif.

## TODO / idées
- Retours de Mehdi après essai sur iPhone.
- Pistes : échantillons de vrais instruments, export audio WAV, édition de rythme des accords, plus de styles de mélodie.

## Pour les futures sessions Claude
Mettre à jour ce fichier en fin de session si changement structurant.
