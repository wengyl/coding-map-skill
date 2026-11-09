#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { readMap, validateMap } from './map-lib.mjs';

const [file, ...extra] = process.argv.slice(2);
if (!file || extra.length) {
  console.error('用法: node scripts/check-render.mjs <map.html>');
  process.exitCode = 1;
} else {
  let browser;
  try {
    const data = await readMap(file);
    const validation = validateMap(data);
    if (validation.errors.length) throw new Error(validation.errors.join('\n'));
    const { chromium } = await import('playwright');
    browser = await chromium.launch();
    const context = await browser.newContext({ offline: true });
    const page = await context.newPage();
    const failures = [];
    page.on('pageerror', error => failures.push(error.message));
    page.on('request', request => { if (/^https?:/.test(request.url())) failures.push(`外部请求: ${request.url()}`); });
    await page.goto(pathToFileURL(resolve(file)).href);
    await page.waitForFunction(() => window.__CODE_MAP__?.ready === true, null, { timeout: 30000 });
    const rendered = await page.evaluate(() => ({
      errors: window.__CODE_MAP__.errors,
      missingAnchors: window.__CODE_MAP__.missingAnchors,
      diagrams: [...document.querySelectorAll('[data-diagram-id]')].filter(el => el.querySelector('svg')).length
    }));
    failures.push(...rendered.errors.map(String), ...rendered.missingAnchors.map(a => `未找到锚点: ${typeof a === 'string' ? a : JSON.stringify(a)}`));
    if (rendered.diagrams !== data.diagrams.length) failures.push(`应渲染 ${data.diagrams.length} 张图，实际 ${rendered.diagrams}`);
    if (failures.length) throw new Error([...new Set(failures)].join('\n'));
    console.log(`离线浏览器检查通过: ${data.diagrams.length} 张图，全部锚点可定位`);
  } catch (error) {
    console.error(error.code === 'ERR_MODULE_NOT_FOUND' ? '浏览器检查需要 npm ci && npx playwright install chromium' : error.message);
    process.exitCode = 1;
  } finally { await browser?.close(); }
}
