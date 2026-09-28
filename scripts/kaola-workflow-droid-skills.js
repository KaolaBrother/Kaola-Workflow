#!/usr/bin/env node
'use strict';

// Ownership-proven install, check, uninstall, and former-root retirement for the Droid
// edition's Skills (#1112). Global Skills moved from ~/.factory/skills to the shared
// personal-compatibility root ~/.agents/skills, which Droid still reads alongside
// ~/.factory/skills (the former Kaola-Workflow install root, still a supported Droid personal
// root). Its docs call duplicate names within one source bucket invalid and the owner observed
// Droid flag same-name pairs across the two roots, so a same-name pair is never left behind:
// the former root is swept, never just abandoned.
//
// Proof, per <dest>/<name>/SKILL.md (never a path built from a record row):
//   record    the dir's ownership record lists the skill name with the sha256 the file
//             still has;
//   source    the file's bytes equal the render staged this run;
//   catalog   the file's bytes are a render some Kaola release installed (LEGACY_CATALOG
//             below, frozen from the release history that shipped install-droid.sh).
// Anything else under a Kaola skill name — a foreign skill, an owner-edited copy, a
// symlink, or a dir holding more than SKILL.md — is a CONFLICT: install refuses the
// whole batch before writing anything, uninstall/retire-legacy preserve and report it.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function lstat(file) {
  try { return fs.lstatSync(file); } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
}

const isPlainBasename = name => typeof name === 'string' && name !== '' && name !== '.' && name !== '..'
  && !name.includes('/') && !name.includes('\\');

// A TSV ownership record: `<basename>\t<sha256>` per line.
function readRecord(file) {
  const st = file ? lstat(file) : null;
  const rows = new Map();
  if (!st || !st.isFile()) return rows;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line) continue;
    const [name, digest] = line.split('\t');
    if (!isPlainBasename(name)) continue;
    if (digest && /^[0-9a-f]{64}$/.test(digest)) rows.set(name, digest);
  }
  return rows;
}

function writeRecord(file, rows) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const body = [...rows.entries()].sort().map(([n, d]) => `${n}\t${d}`).join('\n') + '\n';
  const tmp = file + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, body);
  fs.renameSync(tmp, file);
}

// The staged skill names: plain-basename directories of --src holding a SKILL.md.
function stagedNames(src) {
  const st = lstat(src);
  if (!st || !st.isDirectory()) return [];
  return fs.readdirSync(src).filter(isPlainBasename)
    .filter(n => { const d = lstat(path.join(src, n)); return d && d.isDirectory(); })
    .sort();
}

function srcSha(src, name) {
  const file = path.join(src, name, 'SKILL.md');
  const st = lstat(file);
  if (!st || !st.isFile()) return null;
  return sha256(fs.readFileSync(file));
}

// Classify one destination entry: 'absent' | 'owned' | 'conflict'.
function classify(destDir, name, record, srcDigest, catalog) {
  const dir = path.join(destDir, name);
  const st = lstat(dir);
  if (!st) return 'absent';
  if (st.isSymbolicLink() || !st.isDirectory()) return 'conflict';
  const entries = fs.readdirSync(dir);
  const skill = path.join(dir, 'SKILL.md');
  const skillSt = entries.length === 1 && entries[0] === 'SKILL.md' ? lstat(skill) : null;
  if (!skillSt || !skillSt.isFile()) return 'conflict';
  const digest = sha256(fs.readFileSync(skill));
  if (record.get(name) === digest) return 'owned';
  if (srcDigest && digest === srcDigest) return 'owned';
  if ((catalog[name] || []).includes(digest)) return 'owned';
  return 'conflict';
}

const CONFLICT_LINE = p =>
  `Refused: ${p} is not a Kaola-Workflow Droid Skill (foreign, owner-edited, or not a plain one-file dir); move it aside and rerun`;

// preflight: read-only conflict scan of every staged name against the shared dest root.
// installSkills calls it before writing; install-droid.sh also runs it as the standalone
// `preflight` command so a refusal exits before ANY artifact — support scripts included —
// is written.
function preflightSkills({ src, dest, record, catalog = LEGACY_CATALOG }) {
  const rows = readRecord(record);
  const conflicts = [];
  for (const name of stagedNames(src)) {
    if (classify(dest, name, rows, srcSha(src, name), catalog) === 'conflict') {
      conflicts.push(path.join(dest, name));
    }
  }
  return { ok: conflicts.length === 0, conflicts };
}

// install: preflight every staged name against the shared dest root; write nothing when
// any entry conflicts. Otherwise replace each owned/absent dir with exactly the staged
// SKILL.md and record every installed name atomically.
function installSkills({ src, dest, record, catalog = LEGACY_CATALOG }) {
  const names = stagedNames(src);
  const { conflicts } = preflightSkills({ src, dest, record, catalog });
  if (conflicts.length) return { ok: false, conflicts, installed: [] };
  fs.mkdirSync(dest, { recursive: true });
  const installed = [];
  const newRows = new Map();
  for (const name of names) {
    const dir = path.join(dest, name);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const bytes = fs.readFileSync(path.join(src, name, 'SKILL.md'));
    const file = path.join(dir, 'SKILL.md');
    fs.writeFileSync(file, bytes);
    newRows.set(name, sha256(bytes));
    installed.push(file);
  }
  writeRecord(record, newRows);
  return { ok: true, conflicts: [], installed };
}

// check: per-name only — the shared dest root legitimately holds other tools' skills. An
// honest verdict distinguishes three states: the skill is absent (missing); its bytes differ
// from the render but are provably a Kaola copy — the record or the released-render catalog
// owns the digest — so a rerun restores it (stale); or the entry cannot be proven ours at all
// (conflict), which install would refuse rather than overwrite.
function checkSkills({ src, dest, record, catalog = LEGACY_CATALOG }) {
  const rows = readRecord(record);
  const problems = [];
  for (const name of stagedNames(src)) {
    const dir = path.join(dest, name);
    const skill = path.join(dir, 'SKILL.md');
    const dirSt = lstat(dir);
    if (!dirSt) { problems.push(`check: missing skill ${skill}`); continue; }
    const srcDigest = srcSha(src, name);
    if (!dirSt.isSymbolicLink() && dirSt.isDirectory()) {
      const entries = fs.readdirSync(dir);
      const st = entries.length === 1 && entries[0] === 'SKILL.md' ? lstat(skill) : null;
      if (st && st.isFile()) {
        const digest = sha256(fs.readFileSync(skill));
        if (srcDigest && digest === srcDigest) continue;
        if (rows.get(name) === digest || (catalog[name] || []).includes(digest)) {
          problems.push(`check: stale skill ${skill}`);
        } else {
          problems.push(`check: conflict ${dir} is not a Kaola-Workflow copy (install will refuse; move it aside)`);
        }
        continue;
      }
    }
    problems.push(`check: conflict ${dir} is not a Kaola-Workflow copy (install will refuse; move it aside)`);
  }
  return { ok: problems.length === 0, problems };
}

// uninstall: remove each staged name only when the installed copy is a one-file SKILL.md
// dir whose bytes are proven by the record or the staged render; preserve and report
// anything else. The shared dest root itself is never removed.
function uninstallSkills({ src, dest, record }) {
  const rows = readRecord(record);
  const removed = [];
  const preserved = [];
  for (const name of stagedNames(src)) {
    const dir = path.join(dest, name);
    const st = lstat(dir);
    if (!st) continue;
    let owned = false;
    if (!st.isSymbolicLink() && st.isDirectory()) {
      const entries = fs.readdirSync(dir);
      const skill = path.join(dir, 'SKILL.md');
      const skillSt = entries.length === 1 && entries[0] === 'SKILL.md' ? lstat(skill) : null;
      if (skillSt && skillSt.isFile()) {
        const digest = sha256(fs.readFileSync(skill));
        const staged = srcSha(src, name);
        owned = rows.get(name) === digest || (staged !== null && digest === staged);
      }
    }
    if (owned) {
      fs.rmSync(dir, { recursive: true });
      removed.push(dir);
    } else {
      preserved.push(dir);
    }
  }
  try { fs.unlinkSync(record); } catch (err) {
    if (!err || err.code !== 'ENOENT') throw err;
  }
  return { removed, preserved };
}

// One legacy entry: 'absent' | 'removable' | 'preserve:<reason>'. A dir is removable only
// when it holds exactly one regular SKILL.md whose bytes are a released render (catalog)
// or the render staged this run — ownership-proven before anything under ~/.factory is
// removed.
function classifyLegacy(dir, name, catalog, staged) {
  const skillDir = path.join(dir, name);
  const st = lstat(skillDir);
  if (!st) return 'absent';
  if (st.isSymbolicLink() || !st.isDirectory()) return 'preserve:non_regular';
  const entries = fs.readdirSync(skillDir);
  const skill = path.join(skillDir, 'SKILL.md');
  const skillSt = entries.length === 1 && entries[0] === 'SKILL.md' ? lstat(skill) : null;
  if (!skillSt || !skillSt.isFile()) return 'preserve:not_a_plain_one_file_skill_dir';
  const digest = sha256(fs.readFileSync(skill));
  if ((catalog[name] || []).includes(digest) || (staged !== null && digest === staged)) {
    return 'removable';
  }
  return 'preserve:foreign_or_owner_edited';
}

// Droid reads both ~/.factory/skills and ~/.agents/skills, and the owner observed Droid flag
// same-name pairs across the two roots (its docs call duplicate names within one source
// bucket invalid) — so no same-name pair is ever left behind or hidden.

// retire-legacy: sweep the former ~/.factory/skills root of ownership-proven copies.
// check=true mutates nothing and reports what a rerun would remove or preserve. When --shared
// names the live shared root, an entry name present in BOTH roots that is NOT a Kaola name
// (catalog ∪ staged) is a same-name pair Droid will flag — reported as an advisory `note:`,
// never removed, never counted against the exit code.
function retireLegacy({ dir, src, shared, catalog = LEGACY_CATALOG, check = false }) {
  const dirSt = lstat(dir);
  const result = { removed: [], preserved: [], duplicates: [], notes: [], dirEmptied: false };
  if (!dirSt) return result;
  if (dirSt.isSymbolicLink() || !dirSt.isDirectory()) {
    result.preserved.push({ file: dir, reason: 'non_regular' });
    return result;
  }
  const kaolaNames = new Set([...Object.keys(catalog), ...stagedNames(src)]);
  if (shared) {
    for (const name of fs.readdirSync(dir).filter(isPlainBasename).sort()) {
      if (kaolaNames.has(name)) continue;
      if (lstat(path.join(shared, name))) {
        result.notes.push(
          `note: same-name skill ${name} in both ${dir} and ${shared} — not a Kaola-Workflow skill, left untouched`);
      }
    }
  }
  for (const name of [...kaolaNames].sort()) {
    const skillDir = path.join(dir, name);
    const verdict = classifyLegacy(dir, name, catalog, srcSha(src, name));
    if (verdict === 'absent') continue;
    if (verdict === 'removable') {
      if (!check) fs.rmSync(skillDir, { recursive: true });
      (check ? result.duplicates : result.removed).push({ file: skillDir, name });
    } else {
      result.preserved.push({ file: skillDir, reason: verdict.slice('preserve:'.length) });
    }
  }
  if (!check && !dirSt.isSymbolicLink()) {
    try { fs.rmdirSync(dir); result.dirEmptied = true; } catch (_) { /* non-empty stays */ }
  }
  return result;
}

function retireReport(result, check, shared) {
  const lines = [];
  if (check) {
    for (const d of result.duplicates) {
      lines.push(`check: conflict ${d.file} duplicates ${shared || '~/.agents/skills'}/${d.name}`
        + ' (ownership-proven Kaola copy; rerun ./install-droid.sh to retire it)');
    }
  } else {
    for (const d of result.removed) {
      lines.push(`Removed former-root Droid Skill copy: ${d.file}`);
    }
  }
  for (const p of result.preserved) {
    if (check) {
      lines.push(`check: conflict ${p.file} (${p.reason}) — not proven a Kaola-Workflow copy;`
        + ` Kaola never removes it, move it aside`);
    } else {
      lines.push(`Preserved ${p.file} (${p.reason}) — not proven a Kaola-Workflow copy;`
        + ` Kaola never removes it, move it aside`);
    }
  }
  for (const note of result.notes || []) lines.push(note);
  return lines;
}

// The sha256 of every Droid Skill render a release ever installed: tags
// kaola-workflow--v12.1.0..v12.3.1 (every release containing install-droid.sh), rendered
// per tag per forge (github, gitlab, gitea) by that tag's own sync-droid-edition.js.
const LEGACY_CATALOG = {
  'kaola-workflow-finalize': [
    '10fea45bfdb2cfbd8649de9073a71e9784e9dbcbf2200c1eec7fbe426e84ea49',
    '1fb80b1c5175b4956414b95d18402c7a855d7ac201a93ea76b8cfbf9343cad02',
    '3129bd6979469d282f299f8b2423f40beee88885bf5d96f575f07698673453ad',
    '5f8e29e784e9e7632c6f3da9da201a5f0ac34cf24bfcee656462dda17e601cb1',
    '5fd04ae1d4b298b4476df262694ca12fa1f794b695fb58541b39dc5ebe7d8c97',
    '7a854a42257883560be67568dc8e3c7e3c7c81d324fb7843f27411ac51ddcb83',
    '92b17f767a58e37d4cab4e784ac353f31ff9b11c43188432ff66bd45da30520e',
    'bca69584267292070ba43559788bcc31c42cce4eea4cedfae19216b4b0343274',
    'bdb0ac2a27638e03582ca3d9db3533aae641610b914b8f502ca9392de689b14a',
    'c1a908b0921c168c84045bbee868564e156682370ab4fb071d5fd8247385a5df',
    'd0ae95de8a38f8ab0a27e69b51121ce38208c624aee921e52556b5a3d0f28e82',
    'ebe41f79d7e8cb9696867a691a4ebe40ccbae73775babbbee24f3e81d2d41ee5',
    'f7aeb769a2365fa07d36b65bc86cdb58f2e6a68ae929228351e1e1f36959ec7a',
    'fbe20bf86e2d4f17902e51edc4c635913c67456f0d81bd5f4951fca8ad42ad18',
    'ffc0e2f1b3cfe0fe3678191f6477ecbe9d581fed09f3ee69d84c9cf1e5f49b07',
  ],
  'workflow-init': [
    '013a6f34b2d8ea4d2091ed73b06f7a7c79b6948a24e11ed4d2042292aa4fa8eb',
    '07278d0c200e4b838268a44829bd1815641ff4ae502facda3951a6161aa0517e',
    '42d1bbb5dbe5afe826518ea421cd493859cdfdf804ed2f309813f5e3f1eabdd6',
    '53ee218a92aaf7b258a64a7378434da13464f6ff778541fd34275398418c4734',
    '70e6ace28f21f391889b8125784757588c396b132a797e4185079c18a650e046',
    '7f5aef04544f834518d0db23ddad104b88e02ad59bb903bc647fba31b37078bb',
    '8dbcd90b817b45c687333f52a9b5a96cb6cd0bae722c1041fedb83113d91e2ba',
    '968464fd872e603ce08055ff4a772a8f937d5a5aeaefbdfcafff17df2d8b31a7',
    'a0fbd24fa214a4d48d6bcecf6267ac8d2f2c7a36735498b1a3edef6bebd53ba1',
    'b481dbf2aa849a2a07154b496b1642a6f9003f8f2ce4bb80de6e4bb514780663',
    'd22bf2f8bf39c205f6a3d5211de83590bd80902bc4c59e4ef2c79303de4d615d',
    'd99e638f73dd68c69d2866b1857e4ea9483cae157982fe7308f256ef4572d217',
  ],
  'workflow-next': [
    '3b656306298878c2a980dff089f4a170f75cb91053347dec110225e5e26abbeb',
    '4687a6d45c6fad63148effd4b8b94d8b65f7fbbd92392acef7b6274566d97093',
    '5edd08db08d1cbcee2ad6ef62925f0077bacb9b5be12fbfde03c3cf72a927617',
    '7486843d6063c9427dae2929cd36c31ad5c02a7c1d20470a4fd9747a509fbe5d',
    '895c3adef0927b623d3a583a9dfc33b39799c2956603d02d4c484b228a6534ed',
    'a1ff3fa83e9e4c8ffa2b2d354ef1007bc75fc18720b880ce65c4f77b683ad75c',
    'a265bd55a199d7f53771d9d1dfa5fbf7360f4b8a995f3d07cfe57cb762ef268d',
    'a91097e26ce28351638e8572a6a5f27dd032119de93a5708aa7293c84ce23c04',
    'aa1bdf3b7fcb390b4841c0fd61a183f2813e6c6d4316080069cb7e85cfeb2125',
    'aa9aac78056a7f8193ea8a2ed9242fe9aaa1ed4c3d206c884153618e149f9e7f',
    'b0dcfd14f30c322e3acb4aa65d35938db7c3f5f9dc963c1e1948e73f0d4ec500',
    'fe5fcff50900e239762749afa286516a968748a69fe826e994c8e992e6d2843a',
  ],
};

function parseArgs(argv) {
  const opts = { check: false };
  const args = argv.slice();
  opts.command = args.shift();
  while (args.length) {
    const a = args.shift();
    if (a === '--check') opts.check = true;
    else if (a.startsWith('--src=')) opts.src = a.slice(6);
    else if (a.startsWith('--dest=')) opts.dest = a.slice(7);
    else if (a.startsWith('--record=')) opts.record = a.slice(9);
    else if (a.startsWith('--dir=')) opts.dir = a.slice(6);
    else if (a.startsWith('--shared=')) opts.shared = a.slice(9);
    else if (['--src', '--dest', '--record', '--dir', '--shared'].includes(a)) {
      if (!args.length) throw new Error(`${a} needs a value`);
      opts[a.slice(2)] = args.shift();
    } else throw new Error(`unknown argument: ${a}`);
  }
  const need = {
    'install': ['src', 'dest', 'record'],
    'preflight': ['src', 'dest', 'record'],
    'check': ['src', 'dest'],
    'uninstall': ['src', 'dest', 'record'],
    'retire-legacy': ['dir', 'src'],
  }[opts.command];
  if (!need || need.some(k => !opts[k])) {
    throw new Error('usage: kaola-workflow-droid-skills.js install --src <dir> --dest <dir> --record <file> | preflight --src <dir> --dest <dir> --record <file> | check --src <dir> --dest <dir> [--record <file>] | uninstall --src <dir> --dest <dir> --record <file> | retire-legacy --dir <dir> --src <dir> [--shared <dir>] [--check]');
  }
  return opts;
}

function main(argv) {
  let opts;
  try { opts = parseArgs(argv); } catch (err) { console.error(err.message); return 2; }
  try {
    if (opts.command === 'install') {
      const r = installSkills({
        src: path.resolve(opts.src), dest: path.resolve(opts.dest),
        record: path.resolve(opts.record),
      });
      if (!r.ok) {
        for (const c of r.conflicts) console.error(CONFLICT_LINE(c));
        return 1;
      }
      for (const f of r.installed) console.log(`Installed Droid Skill: ${f}`);
      return 0;
    }
    if (opts.command === 'preflight') {
      const r = preflightSkills({
        src: path.resolve(opts.src), dest: path.resolve(opts.dest),
        record: path.resolve(opts.record),
      });
      for (const c of r.conflicts) console.error(CONFLICT_LINE(c));
      return r.ok ? 0 : 1;
    }
    if (opts.command === 'check') {
      const r = checkSkills({
        src: path.resolve(opts.src), dest: path.resolve(opts.dest),
        record: opts.record ? path.resolve(opts.record) : undefined,
      });
      for (const p of r.problems) console.error(p);
      return r.ok ? 0 : 1;
    }
    if (opts.command === 'uninstall') {
      const r = uninstallSkills({
        src: path.resolve(opts.src), dest: path.resolve(opts.dest),
        record: path.resolve(opts.record),
      });
      for (const d of r.removed) console.log(`Removed skill: ${d}`);
      for (const d of r.preserved) {
        console.log(`Preserved ${d} (not a recorded Kaola-Workflow install)`);
      }
      return 0;
    }
    const r = retireLegacy({
      dir: path.resolve(opts.dir), src: path.resolve(opts.src),
      shared: opts.shared ? path.resolve(opts.shared) : undefined,
      check: opts.check,
    });
    for (const line of retireReport(r, opts.check, opts.shared && path.resolve(opts.shared))) console.log(line);
    if (opts.check) return (r.duplicates.length || r.preserved.length) ? 1 : 0;
    return r.preserved.length ? 1 : 0;
  } catch (err) {
    console.error(`droid-skills failed: ${err && err.message || err}`);
    return 2;
  }
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = {
  sha256, lstat, isPlainBasename, readRecord, stagedNames,
  installSkills, preflightSkills, checkSkills, uninstallSkills, retireLegacy, retireReport,
  LEGACY_CATALOG,
};
