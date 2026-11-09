#!/usr/bin/env node
import { readdir, writeFile } from 'node:fs/promises';
import { buildMap, readMap } from './map-lib.mjs';

const folder = new URL('../examples/', import.meta.url);
for (const name of (await readdir(folder)).filter(name => name.endsWith('.json')).sort()) {
  const html = await buildMap(await readMap(new URL(name, folder)));
  const output = new URL(name.replace(/\.json$/, '.html'), folder);
  await writeFile(output, html);
  console.log(`已生成 examples/${name.replace(/\.json$/, '.html')}`);
}
