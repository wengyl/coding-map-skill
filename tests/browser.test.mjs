import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { buildMap, readMap, validateMap } from '../scripts/map-lib.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = await mkdtemp(join(tmpdir(), 'coding-map-browser-'));
const browser = await chromium.launch();
const context = await browser.newContext({ offline: true, viewport: { width: 1440, height: 960 } });
const externalRequests = [];
await context.route(/^https?:\/\//, async route => {
  externalRequests.push(route.request().url());
  await route.abort();
});

function flatten(nodes) {
  return nodes.flatMap(node => [node, ...flatten(node.children ?? [])]);
}

async function openMap(file, { expectErrors = false, expectMissing = false } = {}) {
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => window.__CODE_MAP__?.ready === true, null, { timeout: 30000 });
  const state = await page.evaluate(() => ({
    errors: window.__CODE_MAP__.errors,
    missingAnchors: window.__CODE_MAP__.missingAnchors
  }));
  assert.deepEqual(pageErrors, [], `uncaught JavaScript errors in ${file}`);
  if (!expectErrors) assert.deepEqual(state.errors, [], `diagram render errors in ${file}`);
  if (!expectMissing) assert.deepEqual(state.missingAnchors, [], `unresolved anchors in ${file}`);
  return { page, state };
}

async function generated(name, map) {
  assert.deepEqual(validateMap(map).errors, []);
  const file = join(directory, name + '.html');
  await writeFile(file, await buildMap(map));
  return file;
}

function minimalMap() {
  return {
    schemaVersion: 1, title: '单页签地图', subtitle: '不依赖额外资源', project: 'minimal', scenario: 'S5',
    diagrams: [{ id: 'overview', title: '全景图', source: 'flowchart LR\n  API[请求入口] --> Done[完成]' }],
    tree: [{ id: 'api', name: 'RequestController', kind: 'class', status: 'new', docId: 'api-doc', anchors: [{ diagram: 'overview', node: 'API', label: '请求入口' }] }],
    docs: [{ id: 'api-doc', title: '请求入口', summary: '只展示一个主题。', details: ['单页签无需改引擎。'] }],
    tour: [{ title: '入口', text: '从请求入口开始。', diagram: 'overview', treeId: 'api' }]
  };
}

let checks = 0;
try {
  for (const name of ['order-request', 'pr-change']) {
    const file = join(root, 'examples', name + '.html');
    const map = await readMap(file);
    const { page } = await openMap(file);
    assert.equal(await page.locator('[data-tab]').count(), map.diagrams.length);
    for (const diagram of map.diagrams) {
      assert.equal(await page.locator(`[data-diagram-id="${diagram.id}"] svg`).count(), 1);
      await page.locator(`[data-tab="${diagram.id}"]`).click();
      assert.equal(await page.locator(`[data-diagram-id="${diagram.id}"]`).isVisible(), true);
      for (const other of map.diagrams.filter(item => item.id !== diagram.id)) {
        assert.equal(await page.locator(`[data-diagram-id="${other.id}"]`).isVisible(), false);
      }
    }
    checks++;

    const nodes = flatten(map.tree);
    const selected = nodes.find(node => node.docId && node.anchors?.some(anchor => anchor.diagram === map.diagrams[0].id));
    assert.ok(selected, `${name} needs a documented node for its first diagram`);
    await page.locator(`[data-tab="${map.diagrams[0].id}"]`).click();
    const row = page.locator(`[data-tree-id="${selected.id}"]`);
    const card = page.locator(`[data-doc-id="${selected.docId}"]`);
    await row.click();
    assert.equal(await row.evaluate(element => element.classList.contains('is-active')), true);
    assert.equal(await card.evaluate(element => element.classList.contains('is-active')), true);
    assert.ok(await page.locator('.map-highlight').count() > 0, 'tree selection highlights a diagram node');

    const graphNode = await page.locator(`[data-diagram-id="${map.diagrams[0].id}"] .map-highlight`).first().elementHandle();
    assert.ok(graphNode);
    await page.locator('#clear-selection').click();
    assert.equal(await page.locator('[data-tree-id].is-active').count(), 0);
    await card.click();
    assert.equal(await row.evaluate(element => element.classList.contains('is-active')), true);
    assert.ok(await page.locator('.map-highlight').count() > 0, 'card selection highlights a diagram node');
    await page.locator('#clear-selection').click();
    await graphNode.click({ force: true });
    assert.equal(await row.evaluate(element => element.classList.contains('is-active')), true);
    assert.equal(await card.evaluate(element => element.classList.contains('is-active')), true);
    checks++;

    await page.locator('#tree-search').fill(selected.name);
    assert.equal(await row.isVisible(), true);
    const unrelated = nodes.find(node => node.docId && node.id !== selected.id && !node.name.includes(selected.name) && !selected.name.includes(node.name));
    if (unrelated) assert.equal(await page.locator(`[data-tree-id="${unrelated.id}"]`).isVisible(), false, 'search hides unrelated leaves');
    await page.locator('#tree-search').fill('');
    checks++;

    await page.locator('#tour-start').click();
    assert.equal(await page.locator('#tour-panel').isVisible(), true);
    assert.ok((await page.locator('#tour-title').innerText()).includes(map.tour[0].title));
    await page.locator('#tour-next').click();
    assert.ok((await page.locator('#tour-title').innerText()).includes(map.tour[1].title));
    await page.locator('#tour-prev').click();
    assert.ok((await page.locator('#tour-title').innerText()).includes(map.tour[0].title));
    checks++;

    const zoomBefore = await page.locator('#zoom-label').innerText();
    await page.locator('#zoom-in').click();
    const zoomAfter = await page.locator('#zoom-label').innerText();
    assert.notEqual(zoomBefore, zoomAfter, 'zoom controls change the visible scale');
    await page.locator('#zoom-fit').click();
    assert.ok((await page.locator('#zoom-label').innerText()).includes('%'));
    checks++;
    await page.close();
  }

  const single = await generated('single-diagram', minimalMap());
  const singlePage = (await openMap(single)).page;
  assert.equal(await singlePage.locator('[data-tab]').count(), 1);
  assert.equal(await singlePage.locator('[data-diagram-id] svg').count(), 1);
  await singlePage.locator('[data-tree-id="api"]').click();
  assert.ok(await singlePage.locator('.map-highlight').count() > 0);
  await singlePage.close();
  checks++;

  const unsafeText = minimalMap();
  const payload = '</script><script>window.__INJECTED = true</script><img src=x onerror="window.__INJECTED=true">';
  unsafeText.title = payload;
  unsafeText.tree[0].name = payload;
  unsafeText.docs[0].summary = payload;
  const textPage = (await openMap(await generated('plain-text', unsafeText))).page;
  assert.equal(await textPage.evaluate(() => window.__INJECTED), undefined);
  assert.ok((await textPage.locator('body').innerText()).includes(payload));
  assert.equal(await textPage.locator('img').count(), 0);
  await textPage.close();
  checks++;

  const broken = minimalMap();
  broken.diagrams[0].source = 'flowchart LR\n  API[broken';
  const errorPage = await openMap(await generated('invalid-mermaid', broken), { expectErrors: true, expectMissing: true });
  assert.ok(errorPage.state.errors.length > 0, 'real Mermaid syntax errors are surfaced');
  await errorPage.page.close();
  checks++;

  const unresolved = minimalMap();
  unresolved.diagrams[0].source += '\n  %% Missing exists only in a comment';
  unresolved.tree[0].anchors = [{ diagram: 'overview', node: 'Missing', label: '不存在的节点' }];
  const missingPage = await openMap(await generated('missing-anchor', unresolved), { expectMissing: true });
  assert.ok(missingPage.state.missingAnchors.length > 0, 'source text alone cannot prove that an SVG anchor exists');
  await missingPage.page.close();
  checks++;

  assert.deepEqual(externalRequests, [], 'all examples and generated maps work without network requests');
  console.log(`Browser checks passed: ${checks} groups (offline rendering, three-way selection, search, tabs, tour, zoom, single diagram, text escaping, and error reporting).`);
} finally {
  await context.close();
  await browser.close();
  await rm(directory, { recursive: true, force: true });
}
