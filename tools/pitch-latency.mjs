// Banc d’essai : délai d’affichage et fiabilité de l’accordeur sur des sons de synthèse (node tools/pitch-latency.mjs).
const { createPitchTracker, freqToNote } = await import('../js/audio/pitch.js');
const RATE = 48000, WIN = 2048, HOP = 800;
function signal(freq, amp, noise, secs = 2, onset = 0.3) {
  const out = new Float32Array(RATE * secs);
  for (let i = 0; i < out.length; i += 1) {
    const t = i / RATE; const on = t >= onset ? Math.min(1, (t - onset) / 0.05) : 0;
    out[i] = on * amp * (Math.sin(2 * Math.PI * freq * t) + 0.3 * Math.sin(4 * Math.PI * freq * t)) + noise * (Math.random() * 2 - 1);
  }
  return out;
}
let worst = 0;
for (const [name, f, amp, noise] of [['sifflement fort', 1318.5, 0.2, 0.01], ['sifflement doux (vrai micro)', 1318.5, 0.008, 0.002], ['voix grave', 130.8, 0.05, 0.004], ['voix douce', 220, 0.01, 0.002], ['fredonnement très doux', 196, 0.004, 0.001]]) {
  const tr = createPitchTracker(RATE); const sig = signal(f, amp, noise); let res = null; let wrong = 0;
  const t0 = performance.now(); let frames = 0;
  for (let end = WIN; end < sig.length; end += HOP) {
    frames += 1; const r = tr.push(sig.subarray(end - WIN, end));
    if (r && end / RATE > 0.3) { if (!res) res = { ms: Math.round((end / RATE - 0.3) * 1000), midi: r.midi }; if (r.midi !== Math.round(freqToNote(f).exact)) wrong += 1; }
    if (r && end / RATE < 0.3) wrong += 1;
  }
  const cpu = ((performance.now() - t0) / frames).toFixed(2);
  console.log(name.padEnd(30), res ? `${res.ms} ms → note ${res.midi} (attendu ${Math.round(freqToNote(f).exact)}), lectures fausses: ${wrong}` : 'JAMAIS', `| ${cpu} ms de calcul/image`);
}
