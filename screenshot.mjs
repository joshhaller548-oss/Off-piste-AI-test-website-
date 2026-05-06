import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const screenshotDir = path.join(__dirname, 'temporary screenshots');
if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

function nextFilename(label) {
  const files = fs.readdirSync(screenshotDir).filter(f => /^screenshot-\d+/.test(f) && f.endsWith('.png'));
  let max = 0;
  for (const f of files) { const m = f.match(/^screenshot-(\d+)/); if (m) max = Math.max(max, +m[1]); }
  const n = max + 1;
  return label ? `screenshot-${n}-${label}.png` : `screenshot-${n}.png`;
}

const url   = process.argv[2] || 'http://localhost:3000';
const label = process.argv[3] || '';

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--force-color-profile=srgb'],
});

const page = await browser.newPage();
await page.setRequestInterception(true);
// Block Calendly CSS — defers Google Fonts in headless mode
page.on('request', req => req.url().includes('calendly.com') ? req.abort() : req.continue());

await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });

// Wait for fonts
await page.evaluate(() => document.fonts.ready);
await new Promise(r => setTimeout(r, 2000));

// Remove 'js' class (disables reveal opacity:0) and kill all transitions
await page.evaluate(() => {
  document.documentElement.classList.remove('js');
  const s = document.createElement('style');
  s.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
  document.head.appendChild(s);
});

// Slow scroll forces browser to paint every off-screen section
const pageHeight = await page.evaluate(() => document.body.scrollHeight);
for (let y = 0; y <= pageHeight; y += 200) {
  await page.evaluate(y => window.scrollTo(0, y), y);
  await new Promise(r => setTimeout(r, 80));
}
await page.evaluate(() => window.scrollTo(0, 0));
await new Promise(r => setTimeout(r, 500));

// Capture each viewport-height slice
const slices = Math.ceil(pageHeight / 900);
const filename = nextFilename(label);
const basename = filename.replace('.png', '');

if (slices === 1) {
  await page.screenshot({ path: path.join(screenshotDir, filename) });
  console.log(`Screenshot saved: temporary screenshots/${filename}`);
} else {
  // Take single full-height screenshot by setting tall viewport (fonts already rendered)
  await page.setViewport({ width: 1440, height: pageHeight, deviceScaleFactor: 2 });
  await new Promise(r => setTimeout(r, 300));
  await page.screenshot({ path: path.join(screenshotDir, filename), fullPage: false });
  console.log(`Screenshot saved: temporary screenshots/${filename}`);
}

await browser.close();
