// Shared helpers: serve dist/ with vite preview and drive the game in headless Chromium.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

export async function serve(port = 4789) {
  const proc = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('preview server timeout')), 20000);
    proc.stdout.on('data', (d) => { if (String(d).includes('http')) { clearTimeout(t); resolve(); } });
    proc.on('exit', (c) => reject(new Error('preview exited ' + c)));
  });
  return { url: `http://127.0.0.1:${port}/`, close: () => { proc.stdout.destroy(); proc.stderr.destroy(); proc.kill('SIGKILL'); } };
}

export async function launch() {
  const candidates = [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].filter(Boolean);
  const executablePath = candidates.find((p) => existsSync(p));
  return chromium.launch({
    executablePath,
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
}

export async function openGame(browser, url, query, { width = 800, height = 500 } = {}) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.stack || e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${url}?${query}`);
  await page.waitForFunction(() => window.__rift && window.__rift.game);
  return { page, errors };
}
