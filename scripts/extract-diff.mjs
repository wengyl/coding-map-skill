#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const usage = '用法: node scripts/extract-diff.mjs <repo> <base> [head=HEAD] [--worktree | --merge-base]';
try {
  const options = process.argv.slice(2);
  const flags = options.filter(a => a.startsWith('--'));
  const args = options.filter(a => !a.startsWith('--'));
  if (args.length < 2 || args.length > 3 || flags.some(f => !['--worktree', '--merge-base'].includes(f))) throw new Error(usage);
  if (flags.includes('--worktree') && (flags.includes('--merge-base') || args.length === 3)) throw new Error('--worktree 比较 base 与当前工作区，不能同时指定 head 或 --merge-base');
  const [folder, baseRef, headRef = 'HEAD'] = args;
  const repository = resolve(folder);
  const git = (...gitArgs) => execFileSync('git', ['-C', repository, ...gitArgs], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  git('rev-parse', '--show-toplevel');
  const commit = ref => git('rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`).trim();
  const baseCommit = commit(baseRef), headCommit = commit(headRef);
  const worktree = flags.includes('--worktree');
  const comparisonBase = flags.includes('--merge-base') ? git('merge-base', baseCommit, headCommit).trim() : baseCommit;
  const diffArgs = [comparisonBase, ...(worktree ? [] : [headCommit]), '--'];
  const tokens = git('diff', '--name-status', '--find-renames', '-z', ...diffArgs).split('\0');
  const files = [];
  for (let i = 0; i < tokens.length && tokens[i];) {
    const status = tokens[i++];
    const previousPath = tokens[i++];
    if (/^[RC]/.test(status)) files.push({ status, path: tokens[i++], previousPath });
    else files.push({ status, path: previousPath });
  }
  const stats = git('diff', '--numstat', '--find-renames', '-z', ...diffArgs).split('\0');
  const byPath = new Map();
  for (let i = 0; i < stats.length && stats[i];) {
    const record = stats[i++];
    const first = record.indexOf('\t'), second = record.indexOf('\t', first + 1);
    if (first < 0 || second < 0) throw new Error('无法解析 git numstat');
    const added = record.slice(0, first), deleted = record.slice(first + 1, second);
    let path = record.slice(second + 1);
    if (!path) { i++; path = stats[i++]; } // rename: empty path, old path, new path
    byPath.set(path, { added: added === '-' ? null : Number(added), deleted: deleted === '-' ? null : Number(deleted), binary: added === '-' });
  }
  for (const file of files) Object.assign(file, byPath.get(file.path));
  const untracked = worktree ? git('ls-files', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean) : [];
  console.log(JSON.stringify({
    repository, base: baseRef, head: worktree ? null : headRef,
    baseCommit, headCommit, comparisonBase,
    mode: worktree ? 'worktree' : flags.includes('--merge-base') ? 'merge-base' : 'refs',
    files,
    summary: { files: files.length, added: files.reduce((s, f) => s + (f.added ?? 0), 0), deleted: files.reduce((s, f) => s + (f.deleted ?? 0), 0) },
    untracked,
    notes: worktree ? ['未跟踪文件仅列路径，不计入 diff 行数；需按需阅读。'] : ['仅包含两个提交的差异，不含未提交工作区。']
  }, null, 2));
} catch (error) {
  console.error(error.stderr?.toString().trim() || error.message);
  process.exitCode = 1;
}
