import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rename, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../../scripts/extract-diff.mjs', import.meta.url));
function git(repo, ...args) {
  const result = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function extract(repo, ...args) {
  const result = spawnSync(process.execPath, [script, repo, ...args], { cwd: repo, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}
async function repository(t) {
  const directory = await mkdtemp(join(tmpdir(), 'coding-map-diff-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const repo = join(directory, 'repo $(touch INJECTED)');
  await mkdir(repo);
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.name', 'Code Map Tests');
  git(repo, 'config', 'user.email', 'code-map-tests@example.invalid');
  await writeFile(join(repo, 'service.txt'), 'first\nsecond\n');
  await writeFile(join(repo, 'rename-source.txt'), 'keep these lines\nfor detecting a rename\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-qm', 'base');
  return { repo, base: git(repo, 'rev-parse', 'HEAD') };
}

test('reference comparison reports committed modifications and rename paths exactly', async t => {
  const { repo, base } = await repository(t);
  const unusual = 'new\tfile\nname.txt';
  await writeFile(join(repo, 'service.txt'), 'first\nchanged\nthird\n');
  await writeFile(join(repo, unusual), 'one\ntwo\n');
  await rename(join(repo, 'rename-source.txt'), join(repo, 'renamed-target.txt'));
  git(repo, 'add', '.');
  git(repo, 'commit', '-qm', 'change');
  const result = extract(repo, base);
  assert.equal(result.mode, 'refs');
  assert.equal(result.baseCommit, base);
  assert.equal(result.headCommit, git(repo, 'rev-parse', 'HEAD'));
  const modification = result.files.find(file => file.path === 'service.txt');
  assert.equal(modification.status, 'M');
  assert.equal(modification.added, 2);
  assert.equal(modification.deleted, 1);
  const added = result.files.find(file => file.path === unusual);
  assert.equal(added.status, 'A');
  assert.equal(added.added, 2);
  const renamed = result.files.find(file => file.path === 'renamed-target.txt');
  assert.match(renamed.status, /^R/);
  assert.equal(renamed.previousPath, 'rename-source.txt');
  assert.equal(renamed.added, 0);
  assert.deepEqual(result.untracked, []);
  await assert.rejects(access(join(repo, 'INJECTED')));
});

test('default excludes working changes; --worktree includes staged and unstaged with untracked paths', async t => {
  const { repo, base } = await repository(t);
  await writeFile(join(repo, 'service.txt'), 'first\nsecond\nstaged\n');
  git(repo, 'add', 'service.txt');
  await writeFile(join(repo, 'service.txt'), 'first\nsecond\nstaged\nunstaged\n');
  await writeFile(join(repo, 'untracked.txt'), 'untracked content\n');
  assert.deepEqual(extract(repo, base).files, []);
  const working = extract(repo, base, '--worktree');
  assert.equal(working.mode, 'worktree');
  assert.equal(working.head, null);
  assert.equal(working.files.length, 1);
  assert.equal(working.files[0].path, 'service.txt');
  assert.equal(working.files[0].added, 2);
  assert.deepEqual(working.untracked, ['untracked.txt']);
});

test('--merge-base models a feature branch without including later main changes', async t => {
  const { repo, base } = await repository(t);
  git(repo, 'checkout', '-qb', 'feature');
  await writeFile(join(repo, 'feature.txt'), 'feature\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-qm', 'feature');
  git(repo, 'checkout', '-q', 'main');
  await writeFile(join(repo, 'main-only.txt'), 'main\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-qm', 'advance main');
  const result = extract(repo, 'main', 'feature', '--merge-base');
  assert.equal(result.mode, 'merge-base');
  assert.equal(result.comparisonBase, base);
  assert.deepEqual(result.files.map(file => file.path), ['feature.txt']);
});

test('binary files are reported without treating binary stats as numeric lines', async t => {
  const { repo, base } = await repository(t);
  await writeFile(join(repo, 'asset.bin'), Buffer.from([0, 1, 2, 3]));
  git(repo, 'add', '.');
  git(repo, 'commit', '-qm', 'binary');
  const result = extract(repo, base);
  assert.equal(result.files[0].binary, true);
  assert.equal(result.files[0].added, null);
  assert.equal(result.files[0].deleted, null);
  assert.equal(result.summary.added, 0);
});

test('unknown refs and incompatible flags fail without shell execution', async t => {
  const { repo, base } = await repository(t);
  const run = args => spawnSync(process.execPath, [script, repo, ...args], { cwd: repo, encoding: 'utf8' });
  assert.notEqual(run(['$(touch INJECTED)']).status, 0);
  assert.notEqual(run([base, 'HEAD', '--worktree']).status, 0);
  assert.notEqual(run([base, '--worktree', '--merge-base']).status, 0);
  assert.notEqual(run([base, '--unknown']).status, 0);
  await assert.rejects(access(join(repo, 'INJECTED')));
});
