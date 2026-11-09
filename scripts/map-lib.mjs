import { readFile } from 'node:fs/promises';

const DIAGRAMS = new Set(['overview', 'sequence', 'flow']);
const KINDS = new Set(['module', 'package', 'class', 'interface', 'method']);
const STATUSES = new Set(['new', 'modified', 'reused', 'external', 'warning', 'error']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const identifier = value => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_-]*$/.test(value);

/** Validate data and cross references without evaluating any supplied code. */
export function validateMap(data) {
  const errors = [], warnings = [];
  const counts = { diagrams: 0, treeNodes: 0, docs: 0, tour: 0, anchors: 0 };
  const fail = message => errors.push(message);
  const result = () => ({ errors, warnings, counts });
  if (!object(data)) { fail('地图数据必须是 JSON 对象'); return result(); }
  if (data.schemaVersion !== 1) fail('schemaVersion 必须是 1');
  for (const key of ['title', 'project']) if (!nonempty(data[key])) fail(`${key} 必须是非空字符串`);
  if (typeof data.scenario !== 'string' || !/^S[1-5]$/.test(data.scenario)) fail('scenario 必须是 S1–S5');
  if (data.subtitle !== undefined && typeof data.subtitle !== 'string') fail('subtitle 必须是字符串');
  if (data.stats !== undefined) {
    if (!Array.isArray(data.stats)) fail('stats 必须是数组');
    else data.stats.forEach((s, i) => {
      if (!object(s) || !nonempty(s.label) || !['string', 'number'].includes(typeof s.value)) fail(`stats[${i}] 需要 label 和 value`);
    });
  }
  const arrays = {};
  for (const key of ['diagrams', 'tree', 'docs', 'tour']) {
    if (!Array.isArray(data[key])) { fail(`${key} 必须是数组`); arrays[key] = []; }
    else arrays[key] = data[key];
  }
  const diagrams = new Map(), docs = new Map(), nodes = new Map(), referencedDocs = new Set();
  if (arrays.diagrams.length < 1 || arrays.diagrams.length > 3) fail('diagrams 必须包含 1–3 张图');
  arrays.diagrams.forEach((d, i) => {
    counts.diagrams++;
    if (!object(d)) { fail(`diagrams[${i}] 必须是对象`); return; }
    if (!DIAGRAMS.has(d.id)) fail(`不支持的图 id: ${d.id}`);
    if (diagrams.has(d.id)) fail(`重复图 id: ${d.id}`);
    diagrams.set(d.id, d);
    if (!nonempty(d.title)) fail(`图 ${d.id} 缺少 title`);
    if (!nonempty(d.source)) { fail(`图 ${d.id} 缺少 Mermaid source`); return; }
    if (d.source.length > 100000) fail(`图 ${d.id} 超过 100000 字符，请拆分主题`);
    const source = d.source.replace(/^\s*%%[^\n]*\n/g, '').trim();
    if (d.id === 'sequence' ? !/^sequenceDiagram\b/.test(source) : !/^(flowchart|graph)\s+(TB|TD|BT|LR|RL)\b/.test(source)) fail(`图 ${d.id} 的 Mermaid 类型不正确`);
    if (/%%\s*\{/.test(d.source) || /^\s*---/.test(d.source)) fail(`图 ${d.id} 不允许覆盖渲染配置`);
  });
  arrays.docs.forEach((d, i) => {
    counts.docs++;
    if (!object(d)) { fail(`docs[${i}] 必须是对象`); return; }
    if (!identifier(d.id)) fail(`说明卡 id 不合法: ${d.id}`);
    if (docs.has(d.id)) fail(`重复说明卡 id: ${d.id}`);
    docs.set(d.id, d);
    for (const key of ['title', 'summary']) if (!nonempty(d[key])) fail(`说明卡 ${d.id} 缺少 ${key}`);
    if (d.file !== undefined && typeof d.file !== 'string') fail(`说明卡 ${d.id} 的 file 必须是字符串`);
    if (d.status !== undefined && !STATUSES.has(d.status)) fail(`说明卡 ${d.id} 的 status 不合法`);
    if (d.details !== undefined && (!Array.isArray(d.details) || d.details.some(x => typeof x !== 'string'))) fail(`说明卡 ${d.id} 的 details 必须是字符串数组`);
  });
  const seenObjects = new WeakSet();
  function walk(list, depth = 0) {
    if (depth > 30) { fail('工程树超过 30 层，请简化'); return; }
    list.forEach((n, i) => {
      counts.treeNodes++;
      if (!object(n)) { fail(`tree 节点 ${i} 必须是对象`); return; }
      if (seenObjects.has(n)) { fail('工程树包含重复对象或循环'); return; }
      seenObjects.add(n);
      if (!identifier(n.id)) fail(`树节点 id 不合法: ${n.id}`);
      if (nodes.has(n.id)) fail(`重复树节点 id: ${n.id}`);
      nodes.set(n.id, n);
      if (!nonempty(n.name)) fail(`树节点 ${n.id} 缺少 name`);
      if (!KINDS.has(n.kind)) fail(`树节点 ${n.id} 的 kind 不合法`);
      if (n.status !== undefined && !STATUSES.has(n.status)) fail(`树节点 ${n.id} 的 status 不合法`);
      if (n.docId !== undefined) {
        if (!docs.has(n.docId)) fail(`树节点 ${n.id} 引用了不存在的说明卡 ${n.docId}`);
        referencedDocs.add(n.docId);
        if (!Array.isArray(n.anchors) || n.anchors.length === 0) fail(`有说明卡的树节点 ${n.id} 必须提供 anchors`);
      }
      if (n.anchors !== undefined && !Array.isArray(n.anchors)) fail(`树节点 ${n.id} 的 anchors 必须是数组`);
      if (Array.isArray(n.anchors)) n.anchors.forEach(a => {
        counts.anchors++;
        if (!object(a)) { fail(`树节点 ${n.id} 的锚点必须是对象`); return; }
        if (!diagrams.has(a.diagram)) fail(`树节点 ${n.id} 引用了不存在的图 ${a.diagram}`);
        if (!identifier(a.node)) fail(`树节点 ${n.id} 的图节点标识符不合法: ${a.node}`);
        if (a.label !== undefined && !nonempty(a.label)) fail(`树节点 ${n.id} 的锚点 label 必须是非空字符串`);
        if (a.diagram === 'sequence' && !nonempty(a.label)) fail(`时序图锚点 ${n.id} 必须提供 label`);
        const source = diagrams.get(a.diagram)?.source;
        if (identifier(a.node) && typeof source === 'string' && !new RegExp(`(?<![A-Za-z0-9_-])${a.node}(?![A-Za-z0-9_-])`).test(source)) fail(`树节点 ${n.id} 的锚点 ${a.node} 不在图 ${a.diagram} 源码中`);
      });
      if (n.children !== undefined) {
        if (!Array.isArray(n.children)) fail(`树节点 ${n.id} 的 children 必须是数组`);
        else walk(n.children, depth + 1);
      }
    });
  }
  walk(arrays.tree);
  if (arrays.tree.length === 0) fail('tree 不能为空');
  for (const id of docs.keys()) if (!referencedDocs.has(id)) warnings.push(`孤立说明卡: ${id}`);
  if (arrays.docs.length === 0) warnings.push('没有说明卡');
  counts.tour = arrays.tour.length;
  if (arrays.tour.length < 6 || arrays.tour.length > 10) warnings.push('导览建议 6–10 站，可按主题调整');
  arrays.tour.forEach((t, i) => {
    if (!object(t)) { fail(`tour[${i}] 必须是对象`); return; }
    for (const key of ['title', 'text']) if (!nonempty(t[key])) fail(`tour[${i}] 缺少 ${key}`);
    if (!diagrams.has(t.diagram)) fail(`tour[${i}] 引用了不存在的图 ${t.diagram}`);
    if (t.treeId !== undefined) {
      const node = nodes.get(t.treeId);
      if (!node) fail(`tour[${i}] 引用了不存在的树节点 ${t.treeId}`);
      else if (!Array.isArray(node.anchors) || !node.anchors.some(a => object(a) && a.diagram === t.diagram)) fail(`tour[${i}] 的树节点在图 ${t.diagram} 中没有锚点`);
    }
  });
  return result();
}

export async function readMap(file) {
  const text = await readFile(file, 'utf8');
  if (/\.html?$/i.test(String(file))) {
    const match = text.match(/<script\b(?=[^>]*\bid=["']map-data["'])(?=[^>]*\btype=["']application\/json["'])[^>]*>([\s\S]*?)<\/script\s*>/i);
    if (!match) throw new Error('HTML 缺少 application/json 类型的 #map-data');
    return JSON.parse(match[1]);
  }
  return JSON.parse(text);
}

export async function buildMap(data) {
  const validation = validateMap(data);
  if (validation.errors.length) throw new Error(validation.errors.join('\n'));
  const [template, bundle] = await Promise.all([
    readFile(new URL('../assets/code-map-template.html', import.meta.url), 'utf8'),
    readFile(new URL('../assets/vendor/mermaid.min.js', import.meta.url), 'utf8')
  ]);
  const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const bundled = bundle.replace(/<\/script/gi, '<\\/script');
  if (!template.includes('__MAP_DATA__') || !template.includes('<!-- MERMAID_BUNDLE -->')) throw new Error('模板缺少构建占位符');
  return template.replace('__MAP_DATA__', () => json)
    .replace('<!-- MERMAID_BUNDLE -->', () => `<script>\n${bundled}\n</script>`);
}
