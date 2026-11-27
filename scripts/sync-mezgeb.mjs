#!/usr/bin/env node
// Copies the docs and the OpenAPI contract from the mezgeb repo into the site.
//
// The mezgeb repo is the source of truth; nothing this script writes is
// committed here. By default it checks out the ref in `mezgeb.version`
// (a release tag) into `.cache/`. Set MEZGEB_DIR to a local checkout to
// preview unreleased docs instead:
//
//   MEZGEB_DIR=../mezgeb pnpm dev
//
// What it does to each Markdown file:
// - the first `# ` heading becomes the Starlight `title` (and is removed);
// - `README.md` becomes the folder's index page;
// - relative links to other published files become site routes;
// - relative links to anything else (crates/, migrations/, ...) become
//   GitHub links at the same ref, so they never break.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_URL = 'https://github.com/atronsa/mezgeb';
const SITE = path.join(ROOT, 'apps/site');
const CONTENT = path.join(SITE, 'src/content/docs');
const GENERATED = path.join(SITE, 'generated');

// Files outside docs/ that are published, with their route.
const EXTRA_PAGES = { 'SECURITY.md': 'security' };

// ---------------------------------------------------------------- source

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
}

function resolveSource() {
  if (process.env.MEZGEB_DIR) {
    const dir = path.resolve(process.env.MEZGEB_DIR);
    let commit = 'unknown';
    try { commit = git(dir, 'rev-parse', 'HEAD'); } catch { /* not a git checkout */ }
    console.log(`sync: local checkout ${dir} (${commit.slice(0, 12)})`);
    // A working tree may hold unpushed changes; link to the commit it is on.
    return { dir, ref: 'local', linkRef: commit === 'unknown' ? 'main' : commit, commit };
  }

  const ref = readFileSync(path.join(ROOT, 'mezgeb.version'), 'utf8').trim();
  if (!/^[A-Za-z0-9._\/-]+$/.test(ref)) throw new Error(`mezgeb.version: invalid ref "${ref}"`);
  const dir = path.join(ROOT, '.cache/mezgeb', ref.replaceAll('/', '_'));

  if (!existsSync(path.join(dir, '.git'))) {
    mkdirSync(path.dirname(dir), { recursive: true });
    git(ROOT, 'clone', '--quiet', '--depth', '1', '--branch', ref, `${REPO_URL}.git`, dir);
  } else {
    // A branch moves; a tag should not, but fetching is cheap and catches both.
    git(dir, 'fetch', '--quiet', '--depth', '1', 'origin', ref);
    git(dir, 'checkout', '--quiet', '--force', 'FETCH_HEAD');
  }
  const commit = git(dir, 'rev-parse', 'HEAD');
  const isTag = (() => { try { git(dir, 'ls-remote', '--exit-code', '--tags', 'origin', ref); return true; } catch { return false; } })();
  console.log(`sync: ${REPO_URL} @ ${ref} (${commit.slice(0, 12)})`);
  // Tags read well in links; a branch is pinned to the commit we built.
  return { dir, ref, linkRef: isTag ? ref : commit, commit };
}

// ---------------------------------------------------------------- routes

function walk(dir, base = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full, base);
    return [path.relative(base, full).split(path.sep).join('/')];
  });
}

// Repo-relative path of a published Markdown file -> site slug (no slashes at ends).
function slugFor(repoPath) {
  if (EXTRA_PAGES[repoPath]) return EXTRA_PAGES[repoPath];
  return repoPath.replace(/(^|\/)README\.md$/, '').replace(/\.md$/, '').replace(/\/$/, '');
}

// ---------------------------------------------------------------- transform

const FENCE = /^\s*(```|~~~)/;

function rewriteLinks(text, repoPath, ctx) {
  const fromDir = path.posix.dirname(repoPath);
  const rewrite = (target) => {
    if (/^([a-z][a-z0-9+.-]*:|#|\/)/i.test(target)) return target; // absolute, anchor or site-rooted
    const [p, hash = ''] = target.split(/(?=#)/);
    const resolved = path.posix.normalize(path.posix.join(fromDir, decodeURI(p)));
    if (resolved.startsWith('..')) {
      ctx.warnings.push(`${repoPath}: link leaves the repo: ${target}`);
      return target;
    }
    const asReadme = path.posix.join(resolved, 'README.md');
    if (ctx.pages.has(resolved)) return `/${slugFor(resolved)}/${hash}`.replace('//', '/');
    if (ctx.pages.has(asReadme)) return `/${slugFor(asReadme)}/${hash}`.replace('//', '/');
    const full = path.join(ctx.dir, resolved);
    if (!existsSync(full)) {
      ctx.warnings.push(`${repoPath}: broken link: ${target}`);
      return target;
    }
    const kind = statSync(full).isDirectory() ? 'tree' : 'blob';
    return `${REPO_URL}/${kind}/${ctx.linkRef}/${resolved}${hash}`;
  };

  let inFence = false;
  return text
    .split('\n')
    .map((line) => {
      if (FENCE.test(line)) inFence = !inFence;
      if (inFence) return line;
      return line
        // inline links and images: [text](target) or [text](target "title")
        .replace(/(\]\()([^)\s]+)((?:\s+"[^"]*")?\))/g, (_, a, t, b) => a + rewrite(t) + b)
        // reference definitions: [id]: target
        .replace(/^(\s*\[[^\]]+\]:\s+)(\S+)/, (_, a, t) => a + rewrite(t));
    })
    .join('\n');
}

// "0017-authentication-and-authorization" -> "0017 Authentication and authorization"
function labelFromFile(repoPath) {
  const name = path.posix.basename(repoPath, '.md');
  const m = name.match(/^([0-9][0-9.]*)-(.*)$/);
  const words = (m ? m[2] : name).replaceAll('-', ' ');
  const label = words.charAt(0).toUpperCase() + words.slice(1);
  return m ? `${m[1]} ${label}` : label;
}

function transform(repoPath, source, ctx) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const h1 = lines.findIndex((l) => /^# /.test(l));
  if (h1 === -1) throw new Error(`${repoPath}: no "# " heading to use as the title`);
  const title = lines[h1].slice(2).trim();
  lines.splice(h1, 1);

  const isIndex = repoPath.endsWith('README.md');
  const front = [
    '---',
    `title: ${JSON.stringify(title)}`,
    `slug: ${JSON.stringify(slugFor(repoPath))}`,
    'sidebar:',
    `  label: ${JSON.stringify(isIndex ? 'Overview' : labelFromFile(repoPath))}`,
    ...(isIndex ? ['  order: 0'] : []),
    `editUrl: ${JSON.stringify(`${REPO_URL}/edit/main/${repoPath}`)}`,
    '---',
    '',
  ];
  return front.join('\n') + rewriteLinks(lines.join('\n').replace(/^\n+/, ''), repoPath, ctx);
}

// ---------------------------------------------------------------- main

const src = resolveSource();
const docFiles = walk(path.join(src.dir, 'docs')).map((f) => `docs/${f}`);
const nonMarkdown = docFiles.filter((f) => !f.endsWith('.md'));
const pages = new Set([...docFiles.filter((f) => f.endsWith('.md')), ...Object.keys(EXTRA_PAGES)]);
const ctx = { dir: src.dir, linkRef: src.linkRef, pages, warnings: [] };

rmSync(path.join(CONTENT, 'docs'), { recursive: true, force: true });
rmSync(GENERATED, { recursive: true, force: true });

for (const repoPath of pages) {
  const out = EXTRA_PAGES[repoPath]
    ? path.join(CONTENT, `${EXTRA_PAGES[repoPath]}.md`)
    : path.join(CONTENT, repoPath.replace(/README\.md$/, 'index.md'));
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, transform(repoPath, readFileSync(path.join(src.dir, repoPath), 'utf8'), ctx));
}

// Images and other assets next to the docs keep their relative paths.
for (const f of nonMarkdown) {
  const out = path.join(CONTENT, f);
  mkdirSync(path.dirname(out), { recursive: true });
  copyFileSync(path.join(src.dir, f), out);
}

mkdirSync(path.join(GENERATED, 'openapi'), { recursive: true });
copyFileSync(path.join(src.dir, 'openapi/mezgeb.v1.yaml'), path.join(GENERATED, 'openapi/mezgeb.v1.yaml'));
writeFileSync(
  path.join(GENERATED, 'source.json'),
  JSON.stringify({ repo: REPO_URL, ref: src.ref, linkRef: src.linkRef, commit: src.commit }, null, 2) + '\n',
);

for (const w of ctx.warnings) console.warn(`sync: warning: ${w}`);
console.log(`sync: ${pages.size} pages, ${nonMarkdown.length} assets, 1 OpenAPI contract`);
if (ctx.warnings.length && process.env.CI) process.exit(1);
