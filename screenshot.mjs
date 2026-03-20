import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const screenshotDir = path.join(__dirname, 'temporary screenshots');

if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

// Auto-increment filename, never overwrite
function nextFilename(label) {
  const files = fs.readdirSync(screenshotDir).filter(f => f.startsWith('screenshot-') && f.endsWith('.png'));
  let max = 0;
  for (const f of files) {
    const match = f.match(/^screenshot-(\d+)/);
    if (match) max = Math.max(max, parseInt(match[1], 10));
  }
  const n = max + 1;
  return label
    ? `screenshot-${n}-${label}.png`
    : `screenshot-${n}.png`;
}

const url   = process.argv[2] || 'http://localhost:3000';
const label = process.argv[3] || '';

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });

// Force all scroll-reveal elements visible (IntersectionObserver won't fire in headless full-page mode)
// Also lock stat counters to their final values immediately
await page.evaluate(() => {
  document.querySelectorAll('.reveal').forEach(el => el.classList.add('up'));
  const nums = document.querySelectorAll('.stat-num');
  const finals = ['50+', '3×', '15+', '100%'];
  nums.forEach((el, i) => { if (finals[i]) el.textContent = finals[i]; });
});

// Scroll through the page to trigger any remaining observers and load lazy content
const pageHeight = await page.evaluate(() => document.body.scrollHeight);
const step = 600;
for (let y = 0; y < pageHeight; y += step) {
  await page.evaluate(pos => window.scrollTo(0, pos), y);
  await new Promise(r => setTimeout(r, 60));
}
await page.evaluate(() => window.scrollTo(0, 0));

// Wait for animations to settle
await new Promise(r => setTimeout(r, 1200));

const filename = nextFilename(label);
const filepath = path.join(screenshotDir, filename);

await page.screenshot({ path: filepath, fullPage: true });
await browser.close();

console.log(`Screenshot saved: temporary screenshots/${filename}`);
