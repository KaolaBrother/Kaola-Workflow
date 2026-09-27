// Regenerate the Codex retirement catalogs (#1101; see ../PROVENANCE.md). Not run by any suite.
// Usage: node codex-catalog.js <repo>  -> JSON { profiles: {name: [sha256]}, blocks: [sha256] }
// Codex retirement catalogs (#1101): every historical blob of plugins/*/agents/*.toml (installed
// verbatim by every installer era) and every historical managed-block body — config/agents.toml
// trimmed, plus the variant with its top-level [features] table removed (the pre-#775 installer
// wrote that variant when the user's config already had a [features] table).
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const repo = process.argv[2];
const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', maxBuffer: 1 << 28 });
const commits = git('log', '--all', '--format=%H', '--', 'plugins/*/agents/*.toml', 'plugins/*/config/agents.toml').trim().split('\n');
const blobs = new Map();
for (const c of commits) {
  for (const line of git('ls-tree', '-r', c, '--', 'plugins').split('\n')) {
    const m = line.match(/^\d+ blob ([0-9a-f]+)\t(plugins\/(kaola-workflow(?:-gitlab|-gitea)?)\/(?:agents\/[^/]+\.toml|config\/agents\.toml))$/);
    if (m) blobs.set(m[1] + ' ' + m[2], { blob: m[1], path: m[2] });
  }
}
const isTable = (l, t) => new RegExp('^\\s*\\[' + t + '\\]\\s*(?:#.*)?$').test(l);
const isAnyTable = l => /^\s*\[[^\]\n]+\]\s*(?:#.*)?$/.test(l);
function removeFeatures(content) {
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex(l => isTable(l, 'features'));
  if (start === -1) return null;
  let end = start + 1;
  while (end < lines.length && !isAnyTable(lines[end])) end++;
  return [...lines.slice(0, start), ...lines.slice(end)].join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const profiles = {}; const blocks = new Set();
for (const { blob, path } of blobs.values()) {
  const buf = execFileSync('git', ['-C', repo, 'cat-file', '-p', blob], { maxBuffer: 1 << 28 });
  if (path.endsWith('config/agents.toml')) {
    const t = buf.toString('utf8').trim();
    blocks.add(sha(t));
    const v = removeFeatures(t);
    if (v !== null) blocks.add(sha(v));
  } else {
    const name = path.split('/').pop();
    (profiles[name] = profiles[name] || new Set()).add(sha(buf));
  }
}
const out = { profiles: Object.fromEntries(Object.keys(profiles).sort().map(k => [k, [...profiles[k]].sort()])), blocks: [...blocks].sort() };
process.stdout.write(JSON.stringify(out));
