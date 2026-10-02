import { webkit, chromium } from 'playwright';
const SP = process.argv[2] ?? "/tmp";
const engine = process.argv[3] === 'chromium' ? chromium : webkit;
const browser = await engine.launch();
const errors = [];
const step = async (name, fn) => { try { await fn(); console.log('ok  ', name); } catch (e) { console.log('FAIL', name, e.message.split('\n')[0]); } };
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, acceptDownloads: true });
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:8777/');
await page.waitForTimeout(800);
await step('play / stop', async () => {
  await page.click('.play-btn'); await page.waitForTimeout(1500);
  if (!(await page.$('.card.is-playing'))) throw new Error('no playing card');
  await page.screenshot({ path: `${SP}/m-playing.png` });
  await page.click('.play-btn');
});
await step('select chord → inspector', async () => {
  await page.click('.card >> nth=1'); await page.waitForSelector('.inspector.is-open');
  await page.screenshot({ path: `${SP}/m-inspector.png` });
  await page.locator('.inspector .quality-grid button', { hasText: /^G9$/ }).click();
  await page.waitForTimeout(300);
  const t = await page.textContent('.card >> nth=1'); if (!t.includes('G9')) throw new Error(t);
  await page.click('.inspector .insp-head [aria-label=Fermer]', { timeout: 5000 });
  await page.waitForTimeout(300);
});
await step('add from palette', async () => {
  const n = await page.locator('.card').count();
  await page.click('#panel-palette .chip-add >> nth=0');
  await page.waitForTimeout(300);
  if ((await page.locator('.card').count()) !== n + 1) throw new Error('not added');
});
await step('generate', async () => {
  await page.click('#tabbar .tab:has-text("Générer")');
  await page.click('.mood:has-text("Épique")');
  await page.click('button:has-text("Générer une progression")');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SP}/m-generate.png`, fullPage: false });
  console.log('     key:', await page.textContent('.k-value'), '|', await page.locator('.card-sym').allTextContents());
});
await step('template preview + use', async () => {
  await page.click('.pill:has-text("Jazz")'); await page.waitForTimeout(300);
  await page.click('.template >> nth=0 >> button[aria-label^="Écouter"]');
  await page.waitForTimeout(500);
  await page.click('.template >> nth=0 >> button:has-text("Utiliser")');
  await page.waitForTimeout(300);
  console.log('     ', await page.locator('.card-sym').allTextContents());
});
await step('sound panel', async () => {
  await page.click('#tabbar .tab:has-text("Son")');
  await page.click('.pill:has-text("Arpège ↑")');
  await page.screenshot({ path: `${SP}/m-sound.png` });
});
await step('key sheet → D minor', async () => {
  await page.click('.key-pill');
  await page.waitForSelector('.sheet.is-open');
  await page.screenshot({ path: `${SP}/m-key.png` });
  await page.locator('.scale-btn', { has: page.locator('b', { hasText: /^Mineur$/ }) }).click();
  await page.waitForTimeout(300);
  await page.click('.sheet .sheet-head [aria-label=Fermer]');
  await page.waitForTimeout(300);
  console.log('     key:', await page.textContent('.k-value'), '|', await page.locator('.card-sym').allTextContents());
});
await step('tools: export + clavier détecteur', async () => {
  await page.click('#tabbar .tab:has-text("Outils")');
  // Sur téléphone, l'export passe par le menu de partage (AirDrop, Fichiers) : on vérifie les boutons.
  await page.waitForSelector('.export-actions .btn');
  const labels = await page.locator('.export-actions .btn').allTextContents();
  if (!labels.some((l) => l.includes('AirDrop'))) throw new Error(labels.join());
  await page.click('.kb-pill:has-text("Maintenir")');
  for (const m of [60, 64, 67]) await page.dispatchEvent(`#keybed [data-midi="${m}"]`, 'pointerdown');
  await page.waitForTimeout(300);
  const name = (await page.textContent('.kb-name')).trim();
  if (name !== 'C') throw new Error(`accord détecté : ${name}`);
  await page.screenshot({ path: `${SP}/m-tools.png` });
});
await step('reload keeps session', async () => {
  const before = await page.locator('.card-sym').allTextContents();
  await page.waitForTimeout(600); await page.reload(); await page.waitForTimeout(800);
  const after = await page.locator('.card-sym').allTextContents();
  if (before.join() !== after.join()) throw new Error(before + ' vs ' + after);
});
console.log('errors:', errors);
await browser.close();
