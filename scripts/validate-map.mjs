#!/usr/bin/env node
import { readMap, validateMap } from './map-lib.mjs';

const [file, ...extra] = process.argv.slice(2);
if (!file || extra.length) {
  console.error('用法: node scripts/validate-map.mjs <data.json|map.html>');
  process.exitCode = 1;
} else {
  try {
    const result = validateMap(await readMap(file));
    for (const message of result.errors) console.error(`错误: ${message}`);
    for (const message of result.warnings) console.warn(`提示: ${message}`);
    console.log(JSON.stringify(result.counts));
    console.log(`${result.errors.length} 错误，${result.warnings.length} 提示（静态数据校验）`);
    if (result.errors.length) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
