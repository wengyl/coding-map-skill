#!/usr/bin/env node
import { mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { buildMap, readMap } from './map-lib.mjs';

const [input, output, ...extra] = process.argv.slice(2);
if (!input || !output || extra.length) {
  console.error('用法: node scripts/build-map.mjs <data.json> <output.html>');
  process.exitCode = 1;
} else {
  let temporary;
  try {
    if (resolve(input) === resolve(output)) throw new Error('输入与输出文件不能相同');
    if (!/\.html?$/i.test(output)) throw new Error('输出文件必须使用 .html 扩展名');
    const html = await buildMap(await readMap(input));
    await mkdir(dirname(resolve(output)), { recursive: true });
    temporary = `${resolve(output)}.${process.pid}.tmp`;
    await writeFile(temporary, html, { flag: 'wx' });
    await rename(temporary, resolve(output));
    console.log(`已生成离线单文件地图: ${resolve(output)}`);
  } catch (error) {
    if (temporary) await rm(temporary, { force: true });
    console.error(error.message);
    process.exitCode = 1;
  }
}
