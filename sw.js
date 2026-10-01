// Service worker : l'app fonctionne hors ligne.
// Fichiers de l'app : réseau d'abord (mises à jour immédiates), copie locale si hors ligne.
// À chaque modification du site, augmenter CACHE_VERSION (et APP_VERSION dans js/version.js).
const CACHE_VERSION = 'cadence-v5';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-512.png',
  'js/app.js', 'js/version.js', 'js/state.js', 'js/actions.js',
  'js/theory/notes.js', 'js/theory/scales.js', 'js/theory/chords.js', 'js/theory/harmony.js', 'js/theory/voicing.js',
  'js/gen/patterns.js', 'js/gen/progressions.js', 'js/gen/melody.js', 'js/gen/arrange.js',
  'js/audio/synth.js', 'js/audio/player.js', 'js/audio/clock-worker.js', 'js/midi/export.js', 'js/midi/webmidi.js',
  'js/ui/dom.js', 'js/ui/context.js', 'js/ui/topbar.js', 'js/ui/timeline.js', 'js/ui/inspector.js', 'js/ui/palette.js',
  'js/ui/generatePanel.js', 'js/ui/melodyPanel.js', 'js/ui/soundPanel.js', 'js/ui/toolsPanel.js', 'js/ui/keysheet.js',
  'js/ui/keyboard.js', 'js/ui/pianoroll.js',
];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

// Réseau lent : on bascule sur la copie locale au bout de quelques secondes.
const withTimeout = (promise, ms) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
]);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const isOwn = url.origin === self.location.origin;
  const isFont = FONT_HOSTS.includes(url.hostname);
  if (!isOwn && !isFont) return;
  const fromNetwork = () => withTimeout(fetch(request, isOwn ? { cache: 'no-cache' } : {}), 3500).then((res) => {
    if (res.ok || res.type === 'opaque') {
      const copy = res.clone();
      caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
    }
    return res;
  });
  const fromCache = () => caches.match(request, { ignoreSearch: isOwn });
  event.respondWith(isFont
    ? fromCache().then((cached) => cached || fromNetwork())
    : fromNetwork().catch(() => fromCache().then((cached) => cached || Response.error())));
});
