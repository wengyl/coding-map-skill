import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildMap, readMap, validateMap } from '../../scripts/map-lib.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const cli = (name, args, cwd = root) => spawnSync(process.execPath, [resolve(root, 'scripts', name), ...args], { cwd, encoding: 'utf8' });
const fixture = () => ({
  schemaVersion: 1, title: '订单入口', project: 'test-order-service', scenario: 'S5',
  diagrams: [{ id: 'overview', title: '全景图', source: 'flowchart LR\n  API[HTTP入口] --> Service[订单服务]' }],
  tree: [{ id: 'orders', name: 'orders', kind: 'module', children: [
    { id: 'api', name: 'OrderController', kind: 'class', status: 'new', docId: 'api-doc', anchors: [{ diagram: 'overview', node: 'API', label: 'HTTP入口' }] }
  ] }],
  docs: [{ id: 'api-doc', title: '请求入口', summary: '转换输入并调用服务', details: ['检查参数', '交给领域服务'] }],
  tour: [{ title: '从入口开始', text: '请求首先到达控制器。', diagram: 'overview', treeId: 'api' }]
});

async function temporary(t) {
  const directory = await mkdtemp(join(tmpdir(), 'coding-map-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('a complete map with one diagram is valid', () => {
  const result = validateMap(fixture());
  assert.deepEqual(result.errors, []);
  assert.equal(result.counts.diagrams, 1);
  assert.equal(result.counts.treeNodes, 2);
  assert.equal(result.counts.docs, 1);
  assert.equal(result.counts.anchors, 1);
  assert.ok(result.warnings.length > 0, 'a short tour can be valid while receiving guidance');
});

test('missing documentation, diagram, and tour references are rejected', () => {
  const map = fixture();
  map.tree[0].children[0].docId = 'missing-doc';
  map.tree[0].children[0].anchors[0].diagram = 'flow';
  map.tour[0].treeId = 'missing-tree';
  const { errors } = validateMap(map);
  assert.ok(errors.some(message => message.includes('missing-doc')));
  assert.ok(errors.some(message => message.includes('flow')));
  assert.ok(errors.some(message => message.includes('missing-tree')));
});

test('duplicate identifiers are rejected across nested tree nodes, docs, and diagrams', () => {
  const map = fixture();
  map.tree.push(structuredClone(map.tree[0].children[0]));
  map.docs.push(structuredClone(map.docs[0]));
  map.diagrams.push(structuredClone(map.diagrams[0]));
  const { errors } = validateMap(map);
  for (const id of ['api', 'api-doc', 'overview']) assert.ok(errors.some(message => message.includes(id)), `duplicate ${id}`);
});

test('each tour selection must have an anchor in the selected diagram', () => {
  const map = fixture();
  map.diagrams.push({ id: 'flow', title: '流程图', source: 'flowchart TB\n  API[HTTP入口] --> Done[完成]' });
  map.tour[0].diagram = 'flow';
  assert.ok(validateMap(map).errors.length > 0);
});

test('sequence anchors require participant display labels', () => {
  const map = fixture();
  map.diagrams = [{ id: 'sequence', title: '时序图', source: 'sequenceDiagram\n  participant API as HTTP入口\n  API->>API: 受理' }];
  map.tree[0].children[0].anchors = [{ diagram: 'sequence', node: 'API' }];
  map.tour[0].diagram = 'sequence';
  assert.ok(validateMap(map).errors.some(message => message.includes('label')));
  map.tree[0].children[0].anchors[0].label = 'HTTP入口';
  assert.deepEqual(validateMap(map).errors, []);
});

test('unexpected JSON shapes produce validation errors instead of TypeError', () => {
  const badMaps = [null, true, 42, 'map', [], {}, { ...fixture(), tree: [null, 1, []] },
    { ...fixture(), diagrams: [null], docs: [null], tour: [null] },
    { ...fixture(), tree: [{ id: 'bad', name: 'bad', kind: 'module', children: {}, anchors: [null] }] }];
  for (const map of badMaps) {
    let result;
    assert.doesNotThrow(() => { result = validateMap(map); });
    assert.ok(result.errors.length > 0);
  }
});

test('cycles are rejected when programmatic callers supply non-JSON objects', () => {
  const map = fixture();
  map.tree[0].children.push(map.tree[0]);
  assert.ok(validateMap(map).errors.length > 0);
});

test('map source cannot override the renderer security configuration', () => {
  const map = fixture();
  map.diagrams[0].source = '%%{init: {"securityLevel": "loose"}}%%\nflowchart LR\nAPI[入口]';
  assert.ok(validateMap(map).errors.length > 0);
});

test('build and read preserve data while escaping script-closing text', async t => {
  const directory = await temporary(t);
  const map = fixture();
  const payload = '</script><script>globalThis.__INJECTED = true</script><img src=x onerror=alert(1)>';
  map.title = payload;
  map.docs[0].summary = 'A\u2028B\u2029C & <tag>';
  const html = await buildMap(map);
  assert.ok(!html.includes(payload), 'data must not be able to close its JSON script element');
  assert.ok(!/<script\b[^>]*\bsrc\s*=/i.test(html), 'standalone output must embed its JavaScript');
  const file = join(directory, 'map.html');
  await writeFile(file, html);
  assert.deepEqual(await readMap(file), map);
});

test('readMap extracts only JSON and never evaluates other HTML scripts', async t => {
  const directory = await temporary(t);
  const file = join(directory, 'untrusted.html');
  globalThis.__MAP_TEST_EXECUTED = false;
  await writeFile(file, `<script>globalThis.__MAP_TEST_EXECUTED = true</script><script type="application/json" id="map-data">${JSON.stringify(fixture())}</script>`);
  assert.deepEqual(await readMap(file), fixture());
  assert.equal(globalThis.__MAP_TEST_EXECUTED, false);
  delete globalThis.__MAP_TEST_EXECUTED;
});

test('missing or invalid embedded JSON is rejected', async t => {
  const directory = await temporary(t);
  const missing = join(directory, 'missing.html');
  const malformed = join(directory, 'malformed.html');
  await writeFile(missing, '<script id="map-data">({ title: "not-json" })</script>');
  await writeFile(malformed, '<script id="map-data" type="application/json">{broken}</script>');
  await assert.rejects(readMap(missing));
  await assert.rejects(readMap(malformed), SyntaxError);
});

test('invalid maps cannot be built', async () => {
  await assert.rejects(buildMap({ ...fixture(), tree: [] }));
});

test('CLI accepts shell metacharacters as literal paths without execution', async t => {
  const directory = await temporary(t);
  const input = join(directory, 'data-$(touch INJECTED).json');
  const output = join(directory, 'result-`touch INJECTED`.html');
  await writeFile(input, JSON.stringify(fixture()));
  const built = cli('build-map.mjs', [input, output], directory);
  assert.equal(built.status, 0, built.stderr);
  assert.deepEqual(await readMap(output), fixture());
  await assert.rejects(access(join(directory, 'INJECTED')));
  const validated = cli('validate-map.mjs', [output], directory);
  assert.equal(validated.status, 0, validated.stderr);
});

test('failed CLI generation does not overwrite an existing deliverable', async t => {
  const directory = await temporary(t);
  const input = join(directory, 'invalid.json');
  const output = join(directory, 'map.html');
  await writeFile(input, JSON.stringify({ schemaVersion: 99 }));
  await writeFile(output, 'previous deliverable');
  const result = cli('build-map.mjs', [input, output]);
  assert.notEqual(result.status, 0);
  assert.equal(await readFile(output, 'utf8'), 'previous deliverable');
});

test('CLI rejects same-path generation and invalid validation input', async t => {
  const directory = await temporary(t);
  const file = join(directory, 'same.html');
  const original = '<script id="map-data" type="application/json">' + JSON.stringify(fixture()) + '</script>';
  await writeFile(file, original);
  assert.notEqual(cli('build-map.mjs', [file, file]).status, 0);
  assert.equal(await readFile(file, 'utf8'), original);
  assert.notEqual(cli('validate-map.mjs', [join(directory, 'missing-$(touch INJECTED).json')], directory).status, 0);
  await assert.rejects(access(join(directory, 'INJECTED')));
});
