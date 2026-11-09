#!/usr/bin/env node
import { build } from 'esbuild';
import { mkdir, readFile, readdir, writeFile, appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(new URL('../assets/vendor/', import.meta.url), { recursive: true });
const bundled = await build({
  absWorkingDir: root,
  stdin: { contents: 'import mermaid from "mermaid"; window.mermaid = mermaid;', resolveDir: root, sourcefile: 'mermaid-entry.js' },
  bundle: true, minify: true, format: 'iife', platform: 'browser', target: 'es2024',
  legalComments: 'inline', metafile: true,
  outfile: fileURLToPath(new URL('../assets/vendor/mermaid.min.js', import.meta.url))
});
const license = await readFile(new URL('../node_modules/mermaid/LICENSE', import.meta.url), 'utf8');
await writeFile(new URL('../assets/vendor/mermaid.LICENSE', import.meta.url), license);
const packageDirectories = new Set();
for (const input of Object.keys(bundled.metafile.inputs)) {
  const match = input.match(/^(.*node_modules\/(?:@[^/]+\/)?[^/]+)/);
  if (match) packageDirectories.add(resolve(root, match[1]));
}
const notices = [];
for (const folder of [...packageDirectories].sort()) {
  const manifest = JSON.parse(await readFile(join(folder, 'package.json'), 'utf8'));
  const files = (await readdir(folder)).filter(name => /^(licen[cs]e|copying)([._-].*)?$/i.test(name)).sort();
  const texts = await Promise.all(files.map(name => readFile(join(folder, name), 'utf8')));
  notices.push(`${manifest.name}@${manifest.version}\nLicense: ${typeof manifest.license === 'string' ? manifest.license : JSON.stringify(manifest.license)}\nSource: https://www.npmjs.com/package/${manifest.name}/v/${manifest.version}\n${texts.join('\n')}`);
}
const noticeText = 'Bundled third-party licenses\n\n' + notices.join('\n\n' + '='.repeat(72) + '\n\n');
await writeFile(new URL('../assets/vendor/THIRD_PARTY_LICENSES.txt', import.meta.url), noticeText);
await appendFile(new URL('../assets/vendor/mermaid.min.js', import.meta.url), '\n/*!\n' + noticeText.replace(/\*\//g, '* /') + '\n*/\n');
console.log('已打包 Mermaid（保留第三方许可证注释）');
