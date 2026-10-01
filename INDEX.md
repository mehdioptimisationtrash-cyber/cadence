# Cadence (dossier Chord/)

> Dernière analyse: 2026-10-01

PWA (iPhone + Mac) de composition harmonique façon Scaler / Chord Wizard : progressions d'accords, harmonisation, mélodies, export MIDI. Vanilla JS (modules ES), aucun build, sons synthétisés en Web Audio, hors ligne.

**En ligne :** https://mehdioptimisationtrash-cyber.github.io/cadence/ (repo `mehdioptimisationtrash-cyber/cadence`, GitHub Pages sur `main`).

## Architecture & fichiers clés
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

## TODO / idées
- Retours de Mehdi après essai sur iPhone.
- Pistes : échantillons de vrais instruments, export audio WAV, édition de rythme des accords, plus de styles de mélodie.

## Pour les futures sessions Claude
Mettre à jour ce fichier en fin de session si changement structurant.
