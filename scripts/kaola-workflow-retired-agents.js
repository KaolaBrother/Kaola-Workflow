#!/usr/bin/env node
'use strict';

// Ownership-proven retirement of the subagent profiles earlier Kaola-Workflow releases installed
// (#1101). Kaola-Workflow ships no subagent roles; upgrade, reinstall and uninstall remove only what
// the evidence proves Kaola wrote, and report every other file that carries a Kaola role name.
//
// Proof, per regular file in the agents dir (never a path built from a record row):
//   record    the dir's ownership record lists the file name with the sha256 the file still has
//             (and, where that runtime stamped one, the file still carries the managed marker);
//   catalog   the file's bytes are a render some Kaola release installed for this runtime, listed
//             below by role name (frozen from history; scripts/fixtures/issue-1101/PROVENANCE.md).
// Anything else with a Kaola role name is preserved and reported:
//   modified_since_install  recorded, but the bytes (or the marker) changed since install;
//   no_ownership_record     not recorded and not a released render;
//   non_regular             a symlink or non-file entry (never followed), or a non-directory carrier.
// The record is retired once read: a preserved file is its owner's from then on. A name outside the
// runtime's role list is not Kaola's and is neither touched nor reported.
//
// CLI
//   node kaola-workflow-retired-agents.js retire --runtime <runtime> --dir <agents-dir>
//        [--record <file>] [--root <scope-root>] [--check]
//   --root: a symlinked or non-directory component below the scope root (for example a symlinked
//   <project>/.grok) keeps the whole agents dir, reported non_regular; nothing is retired through it.
//   node kaola-workflow-retired-agents.js retire-skills --runtime kimi --dir <skills-dir> [--check]
//   node kaola-workflow-retired-agents.js report-bindings --runtime opencode --config <opencode.json>
//   --check changes nothing and exits 1 while a proven retired file or a record is still installed.
// Every other outcome exits 0; a usage or I/O error exits 2.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MANAGED_AGENT_MARKER = 'kaola-workflow-managed-agent: true';
const REMOVED = 'Removed retired Kaola-Workflow agent: ';
const REMOVED_RECORD = 'Removed retired Kaola-Workflow agent record: ';
const STILL_INSTALLED = 'Retired Kaola-Workflow agent still installed: ';
const preservedLine = (reason, file) => `Preserved retired Kaola-Workflow agent (${reason}): ${file}`;

// Every role name a release ever installed, per runtime (censused from git history).
const CURRENT_ROLES = ['code-explorer', 'code-reviewer', 'doc-updater', 'implementer', 'investigator',
  'knowledge-lookup', 'tdd-guide'];
const NARROWED_1062 = ['adversarial-verifier', 'build-error-resolver', 'code-architect', 'metric-optimizer',
  'planner', 'security-reviewer', 'synthesizer'];
const EARLIER = ['contractor', 'docs-lookup', 'issue-scout', 'workflow-planner'];

// requireMarker: the runtime stamped MANAGED_AGENT_MARKER into every file it recorded, so a
// recorded file without it was edited.
const RUNTIMES = {
  claude: { names: [...CURRENT_ROLES, ...NARROWED_1062, ...EARLIER], requireMarker: true },
  grok: { names: [...CURRENT_ROLES, ...NARROWED_1062], requireMarker: false },
  cursor: { names: [...CURRENT_ROLES, ...NARROWED_1062], requireMarker: false },
  zcode: { names: [...CURRENT_ROLES, ...NARROWED_1062], requireMarker: false },
  devin: { names: [...CURRENT_ROLES, ...NARROWED_1062], requireMarker: false },
  kimi: { names: [...CURRENT_ROLES, ...NARROWED_1062], requireMarker: true },
  opencode: { names: [...CURRENT_ROLES, ...NARROWED_1062, 'contractor', 'issue-scout', 'workflow-planner'], requireMarker: false },
};

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

// A TSV ownership record: `<basename>\t<sha256>[\t…]` per line (the Claude, Kimi and OpenCode
// manifests). Rows that are not a plain file name are reported and never used.
function readRecord(file) {
  const st = file ? lstat(file) : null;
  if (!st) return { state: 'absent', rows: new Map(), unsafe: [] };
  if (!st.isFile()) return { state: 'non_regular', rows: new Map(), unsafe: [] };
  const rows = new Map();
  const unsafe = [];
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line) continue;
    const [name, digest] = line.split('\t');
    if (!isPlainBasename(name)) { unsafe.push(name); continue; }
    if (digest && /^[0-9a-f]{64}$/.test(digest)) rows.set(name, digest);
  }
  return { state: 'regular', rows, unsafe };
}

// Decide one dir. Pure apart from the reads and (when apply) the unlinks it reports. `rows` (a
// Map of file name -> sha256) replaces reading `record` when the caller owns a non-TSV record
// (the Cursor receipts); the caller then retires that record itself.
// A symlinked or non-directory component strictly below the scope root `root`, on the way to
// `target` (exclusive), or null. The scope root itself is the caller's choice and is not judged.
function symlinkBelow(root, target) {
  if (!root) return null;
  const relative = path.relative(path.resolve(root), path.resolve(target));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  let current = path.resolve(root);
  for (const segment of relative.split(path.sep).slice(0, -1)) {
    current = path.join(current, segment);
    const st = lstat(current);
    if (!st) return null;
    if (st.isSymbolicLink() || !st.isDirectory()) return current;
  }
  return null;
}

function retireAgentDir({ runtime, dir, record, rows, root, apply = true, ext = '.md' }) {
  const spec = RUNTIMES[runtime];
  if (!spec) throw new Error(`unknown runtime: ${runtime}`);
  const catalog = CATALOG[runtime] || {};
  const result = { removed: [], preserved: [], warnings: [], recordRemoved: null, dir };
  const carrier = lstat(dir);
  if (!carrier) return result;
  // Nothing is retired through a symlinked parent below the scope root (#1101 N5).
  if (symlinkBelow(root, dir) || (record && symlinkBelow(root, record))) {
    result.preserved.push({ reason: 'non_regular', file: dir });
    return result;
  }
  if (!carrier.isDirectory()) {
    result.preserved.push({ reason: 'non_regular', file: dir });
    return result;
  }
  const rec = rows ? { state: 'absent', rows, unsafe: [] } : readRecord(record);
  for (const name of rec.unsafe) {
    result.warnings.push(`warning: ignoring agent record entry that is not a plain file name: ${name}`);
  }
  if (rec.state === 'non_regular') result.preserved.push({ reason: 'non_regular', file: record });
  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.endsWith(ext)) continue;
    const role = name.slice(0, -ext.length);
    const recorded = rec.rows.get(name);
    if (!spec.names.includes(role) && !recorded) continue;
    const file = path.join(dir, name);
    const st = lstat(file);
    if (!st) continue;
    if (!st.isFile()) { result.preserved.push({ reason: 'non_regular', file }); continue; }
    const bytes = fs.readFileSync(file);
    const digest = sha256(bytes);
    const markerOk = !spec.requireMarker || bytes.includes(MANAGED_AGENT_MARKER);
    const provenByRecord = recorded === digest && markerOk;
    const provenByCatalog = spec.names.includes(role) && (catalog[role] || []).includes(digest);
    if (provenByRecord || provenByCatalog) {
      if (apply) fs.unlinkSync(file);
      result.removed.push(file);
    } else {
      result.preserved.push({ reason: recorded ? 'modified_since_install' : 'no_ownership_record', file });
    }
  }
  if (rec.state === 'regular') {
    if (apply) fs.unlinkSync(record);
    result.recordRemoved = record;
  }
  return result;
}

// Kimi shipped each role as a one-file Skill dir, skills/kaola-role-<role>/SKILL.md, with no
// record. A dir is removed only when it holds exactly that one regular file and its bytes are a
// released render (SKILL_CATALOG); any other kaola-role-* entry is preserved and reported. Names
// outside the role set (the workflow Skills) are never touched here.
const ROLE_SKILL_NAMES = {
  kimi: [...CURRENT_ROLES, ...NARROWED_1062, ...EARLIER].filter(r => r !== 'docs-lookup').map(r => 'kaola-role-' + r),
};

function retireRoleSkills({ runtime, dir, apply = true }) {
  const names = ROLE_SKILL_NAMES[runtime];
  if (!names) throw new Error(`no role Skills for runtime: ${runtime}`);
  const catalog = SKILL_CATALOG[runtime] || {};
  const result = { removed: [], preserved: [], warnings: [], recordRemoved: null, dir };
  const carrier = lstat(dir);
  if (!carrier) return result;
  if (!carrier.isDirectory()) {
    result.preserved.push({ reason: 'non_regular', file: dir });
    return result;
  }
  for (const name of fs.readdirSync(dir).sort()) {
    if (!names.includes(name)) continue;
    const skillDir = path.join(dir, name);
    const st = lstat(skillDir);
    if (!st) continue;
    if (!st.isDirectory()) { result.preserved.push({ reason: 'non_regular', file: skillDir }); continue; }
    const entries = fs.readdirSync(skillDir);
    const skill = path.join(skillDir, 'SKILL.md');
    const skillSt = entries.length === 1 && entries[0] === 'SKILL.md' ? lstat(skill) : null;
    if (!skillSt || !skillSt.isFile()) { result.preserved.push({ reason: 'no_ownership_record', file: skillDir }); continue; }
    if ((catalog[name] || []).includes(sha256(fs.readFileSync(skill)))) {
      if (apply) { fs.unlinkSync(skill); fs.rmdirSync(skillDir); }
      result.removed.push(skillDir);
    } else {
      result.preserved.push({ reason: 'no_ownership_record', file: skillDir });
    }
  }
  return result;
}

// OpenCode: earlier releases could seed live `agent.<role>` model/variant bindings into
// opencode.json from the user's environment, and recorded no ownership evidence, so nothing can
// prove a binding is Kaola's. Report each Kaola-role binding; never edit the file (#1101 H5).
function stripJsonc(text) {
  let out = ''; let i = 0; let inString = false;
  while (i < text.length) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (ch === '\\') { out += text[i + 1] || ''; i += 2; continue; }
      if (ch === '"') inString = false;
      i++; continue;
    }
    if (ch === '"') { inString = true; out += ch; i++; continue; }
    if (ch === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (ch === '/' && text[i + 1] === '*') { const end = text.indexOf('*/', i + 2); i = end < 0 ? text.length : end + 2; continue; }
    out += ch; i++;
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

function agentBindings({ runtime, config }) {
  const spec = RUNTIMES[runtime];
  const st = lstat(config);
  if (!st || !st.isFile()) return [];
  let doc;
  try { doc = JSON.parse(stripJsonc(fs.readFileSync(config, 'utf8'))); } catch (_) { return []; }
  const agents = doc && typeof doc.agent === 'object' && !Array.isArray(doc.agent) ? doc.agent : {};
  return Object.keys(agents).filter(role => spec.names.includes(role)).sort();
}

function report(result, check) {
  const out = [];
  for (const w of result.warnings) out.push(w);
  for (const file of result.removed) out.push((check ? STILL_INSTALLED : REMOVED) + file);
  if (result.recordRemoved) out.push((check ? STILL_INSTALLED : REMOVED_RECORD) + result.recordRemoved);
  for (const p of result.preserved) out.push(preservedLine(p.reason, p.file));
  return out;
}

function parseArgs(argv) {
  const opts = { check: false };
  const args = argv.slice();
  opts.command = args.shift();
  while (args.length) {
    const a = args.shift();
    if (a === '--check') opts.check = true;
    else if (a === '--runtime' || a === '--dir' || a === '--record' || a === '--config' || a === '--root') {
      if (!args.length) throw new Error(`${a} needs a value`);
      opts[a.slice(2)] = args.shift();
    } else throw new Error(`unknown argument: ${a}`);
  }
  const known = ['retire', 'retire-skills', 'report-bindings'].includes(opts.command);
  if (!known || !opts.runtime || !RUNTIMES[opts.runtime] || (opts.command === 'report-bindings' ? !opts.config : !opts.dir)) {
    throw new Error('usage: kaola-workflow-retired-agents.js retire|retire-skills --runtime <runtime> --dir <dir> [--record <file>] [--root <scope-root>] [--check] | report-bindings --runtime <runtime> --config <file>');
  }
  return opts;
}

function main(argv) {
  let opts;
  try { opts = parseArgs(argv); } catch (err) { console.error(err.message); return 2; }
  try {
    if (opts.command === 'report-bindings') {
      const config = path.resolve(opts.config);
      for (const role of agentBindings({ runtime: opts.runtime, config })) {
        console.log(`Preserved retired Kaola-Workflow agent binding (no_ownership_record): ${config} agent.${role}`);
      }
      return 0;
    }
    const result = opts.command === 'retire-skills'
      ? retireRoleSkills({ runtime: opts.runtime, dir: path.resolve(opts.dir), apply: !opts.check })
      : retireAgentDir({
        runtime: opts.runtime, dir: path.resolve(opts.dir),
        record: opts.record ? path.resolve(opts.record) : null, apply: !opts.check,
        root: opts.root ? path.resolve(opts.root) : null,
      });
    for (const line of report(result, opts.check)) console.log(line);
    return opts.check && (result.removed.length || result.recordRemoved) ? 1 : 0;
  } catch (err) {
    console.error(`retired-agent sweep failed: ${err && err.message || err}`);
    return 2;
  }
}

// Released renders, per runtime and role: the sha256 of every agent file some Kaola release (every
// commit from the runtime's first to 46fbe12d, all three forges) rendered for that runtime's
// installer, which copied it verbatim. Frozen; never extended by a future render.
const CATALOG = {
  // Claude: every blob tracked at agents/<role>.md (the earliest installers copied it verbatim)
  // plus every file each historical install.sh wrote into an empty ~/.claude/agents
  // (tools/claude-catalog.sh; 80244600..46fbe12d).
  claude: {
    'adversarial-verifier': [
      '03ab5987135985cd8b1bc179ae205b71fe2dbbfd8ddb377f83687bb66fad10e6',
      '1c4b21eddee501f78cdf3e5731195f10910ac77e871d167d54e5226616c627a7',
      '1ca02e0a8c3bf701b4a0ceec67d6cef590d946e6f39d6fa2fdb0af6bcecc01e3',
      '1f79936449b44f6ef3fa6274d46e571c5c1be4d1392f972a26dc9ea663ad6730',
      '249885a491e32e0c75613be2bb1973f82fea4d15e6d25c5141d8058bf46c23bc',
      '2d40d52edf02eb6da6aea60306e35ecf6490f4b217c314ec5b8e971a83197016',
      '367b50cbd19f2f93e1bb607da982c4642b892c338247aadd217ce15c17f1c8dc',
      '4077c098d46f54e3a7f38da9b5b3ac2dc0a7af7ee7da0feba4ea05dcb1f8b02c',
      '424442bb4e774876f012b11fd34c2b916f5266b77c1487f2113a5e06768e1412',
      '4f6bbd54abf9032206f0aeb552f80ab1b117f8c746e5cfb93067e9a5a19bfd3c',
      '5445524d7cafaa354a5c1b92f0852954fc5bb3f35ba8191e921e2a34471c7485',
      '5cb15e1dd5a5cf67daf4f2eb3058e56157ca0dd09e97c0f426886b459ff5ca8a',
      '6554c61a6edaed07d0bd94e30b1c8bd98de0220b8aad4948a062ac128d6c7a10',
      '66e34820ea870915ef0c9e6f3d00c9f5684de5e878725f2fda756d99c2d802d3',
      '6a451010f40dbaac53cdcb0db660ddbb3e247532a4bdd9fdad34da0ba61ef587',
      '6b5b8a7a7bc76795d7ddd22d14db5e6c07c3687e7e738f682480d3b4c82ddd14',
      '6d05e710a02577f1dac0081cbf5e216000e4db44f98e196ef2b5f0202387e4b6',
      '754d8e504b1786068b767afb08fcdf8a5fcc61b679072c3dd494e3faac21c6d6',
      '7a3452932bcb65c0b81499951d73cf9ca2ec8543112b2e0f1a03f9e2b26ed7db',
      '7f8ba9c0f283c4e5a631ddbfcf3ee71929c5cecb169d4430d0833f9d9366139a',
      '8e390f29e9f7b391c5913f64862260066eafb0063f826208185cf5ddba1558c9',
      '99cdbe9276014cde2931cb74539e574f6a7b703773bf04e2fcc60ad575532ad8',
      'a4093577422f0df2541156c955789f4dc156c92b9950a31e2643414fe934f87f',
      'a97ca2f0176d4993c94a2a8c143ba24985c8176b58563444688d48a44410ad55',
      'b2c24b74e9ab69fab4ab6638dfa35ad56be1c484c3b5016cfa9a716739ce945b',
      'b2ce772540f248e31a24304f36ff56aac679698208668ec98ebe1e8d06bd0bfa',
      'bcded949ecb8e2f1fece9e3f86b98cda58025cb3e689b8344bbc9c1df39e9c18',
      'be56b0cfcd45e640cd47850ebb62ca8dc8e98a406ac2b812fa7ff6478df3f6bd',
      'dcf41ab31d3f3342a61046ca6a743a85c04baca2be045d5c086c98cdf102e03e',
      'e078f3604a68d0c28e4172241a4f3ee265b313abd3009661172ce286b5d8325c',
      'e96798b4ae44bafdb8cdf44dd06541720063baa76f11351caf2cc9133f54d4c9',
      'eba51420c7478827545f8a6f8b9b625f0e239aaf905f168a3743a771984c22a9',
      'ec7341724137fd2605db9da08c690fa5de888dd8f026f14adc78294d4f26cace',
      'f2aa1f216a6b765c0d4ecb9483df97b610fa9c2e372ba69bdc3b8a0abc2dee03',
      'fde69779a669505fc7fac950093a9b10b27f7f76077728439e8c6ced1e857622',
    ],
    'build-error-resolver': [
      '2b92c794a046d9ed3522140af87f0b73046fc13042ff48f5010e6dc6a3b1bbc0',
      '6ea3571d24c484913765800b40dd02e6bcdc1d77cb30e6fd68138da1902c96f3',
      '77dbb04597596574ae91bd952213057fbacee05cd88defcec23dd855a586b6b8',
      '83b15dd6a023306d0300d1cc1864ec06621959e6269c1c621dfa7887d3f77818',
      '89bf0f23c5959bf61f9ecae30436f61283d04c1c422a0f04c3b00a4a2fa1dc70',
      '8dc28805ce688c24dce58f1f3c444397b8e08ab0f985c43bedb2e09ddeadc100',
      '9970e47022fd1b83f91d646c906e228fad9a596afbce845e378993aabb176f52',
      '9a11c281ec11370a6ef348c415080005142094b3ad6e893de497eb23a58ea67b',
      'a0d2d9b71cf6ad915b2baf236284ad3c53527a7294539b6fe4d4c7eab53f2681',
      'b3b07f5eca131cffaa435022fc9cf88385c497701929cda0140fcc0c64481983',
      'bb696ca6a5dadad0242904c3fb444924ce94d3fab4436e8b4d09fe566e756e41',
      'bec5af7a37337174e944e9bd91d5c46930ca0cbee82cd6e40abfe7c6bcef3878',
      'd12a1ac1d93de1211aca7156a327dc41fa74434c3b47710cce612587a170927e',
      'd3c0a0e21df191698cd12f3ea0ed21bf255c6304ef8829225ce90dfe7006cd5c',
      'e7253938c59d87329a010ae493e8150d18b9ab14aa42d5bd17134be57f6d47fd',
      'faeb66fee448507ab5a03f994541e2cf2c5c412e0e3df6cc7959424fa3eb75e9',
      'fdbfec675c1c8d8fc7c60c373c70fb3a6ee6f621c722fa0ab7c287259d23777e',
    ],
    'code-architect': [
      '0c0fcf71782377577b21921992fa449708778e80471a4de2d1ec9483f4594278',
      '17f1b733e6fc37bf5f2398b810d6e28dafe99d1b4cd434100ac8f3f455a2276a',
      '2c7959201c611c2662587efab26bc9e553e4d9e919206846cbb1f3edcefb2dc6',
      '39fe32a4d7c5a95c0530a64caecfe9281903111d93e41ddfbe01f016aba4e49e',
      '599ed25a86a2e1a6cbf7e018ab905ff97cb934f024582ad4ba69f90374bf5f92',
      '713f97c5ead2a9441406f94fb79041d729d61ba07554b7ba747711ccba052716',
      '723d229b723fb65a6089b53d9370a28c331b2ff893e9280ff0262f67b9bd9801',
      '758c52cc2505e36418f20fa64cb47c2597da4645bde52dbdcff76b2ebd4ca8d3',
      '7d3519a153fd62f10db81d34e8b00e05a9bbd6cb136c220a14524f5b1e0bb3e8',
      '8dd9111a39c15978f86b302448f8b17058a856a43749d1b108046b538726a710',
      'ab1ca7cc8bc31ce34d6c7d70866b1c0ee516affa4c57286b0641ea07766d4c1b',
      'af29cd5d562aa93f23da167b1a2f07bed4fc816b9e04cd8ef8d2d877ae56965a',
      'c13d40bc93edc3f855d98515917f8724e564dd989990208fdb7dbb448bca0552',
      'c9e85ce9ad8387cf1fbecc03448c81e1f03c49b2f4c5b968f100dfecfa49bbfb',
      'd623665ed271994afa7e13f80dbfb4aa8445a4205b2ca5d400ec6ebc85923215',
      'dabb65eed9cacd3fcde48c1212ca6cc1d7479c99c54dc8c3ec25bb2e335d6311',
      'e4e95f58b0567e9212ca10aea19ae2696ad6fa80a6ed18e6fd8481f02768ea8e',
    ],
    'code-explorer': [
      '0a7d2932a655764f2f107862d49dc1f45a6e09a47b53c81fc85605b136d85097',
      '0b2113a4c3eef2e510a2f8e86b49c4f2fb219d18f8e315915d9cf8f4a800f7d4',
      '0bcb131f97060dcddb0ded5e382684aec150b464bd37f9c8eeb57fe8cea378e7',
      '13163bf60721049ccea106729efbc481b78e7d27b588d64dbb1e793dfd4bc45b',
      '3f041ee66013ffe8c266c8bebec0dd1cd608665f1e24a2afa2166c74d9cc09e6',
      '3f7be7ca12eedeabb5558b39e970064d6ceef012030d00532bb3e5fb6eee9044',
      '4c7eb112684a23ef8738acf8f2aee3822a07be6c0bd878d8aaecfa8eb9ad481a',
      '5efe4a6dc255429a12d8353ac80b160dd8ef66c35d56b29039faaafbd4e953b7',
      '6212eae1f1f2094dddaccc52ce185cbf1a39d573e2b673d01a764a65b747bce8',
      '6c9345803a078695529f961129aaa4767d97d511cf212fde74fec70a8585022c',
      '7d5e1572ebe238a1f94a7291ed03607b5f299b033d4f1389a3655afe008509dd',
      '9b563f9546b3481a0a409fa97b9a07ed66b102415c4efcb71d7ce247c617ef9f',
      'aa557ee2f5b02ea7ad078ae58b437fb439a2a59ee189711f2c81e6268684cc2a',
      'b66e0078d2f50ea79021f58330ad7724dbff75088d4a113f8d199ed49cf3392b',
      'cb86ca6569dd27769eaf66b76b5bca9f425b1e6ebd9fc100b4e328dd8f96e168',
      'cd0a35d507ae10b2e087c9e3dc41c1aafe67e924c21a53284da7a8911f372c73',
      'e6d76c8a3a2c5408b7ec09c775d00aaf0075999e1af4d8d332689539ca410158',
      'eb64d85bebf228a157184acf79668db1eabe2ad947a001ce14bb7b640c274125',
    ],
    'code-reviewer': [
      '0085f6b9bcb11299a8e542c9d700fe7d48924e7cc1b42c5c0b7f6ae39ba948ea',
      '036cb8e6f74069d5933bd53a1e29e33dfd87b028eddebc71ef1b5efac44748f5',
      '067b6decb0c09b32e014015bca3868541bee6367b4dc9afe200f135dd86227d8',
      '0933bdd3a7c06c28b9635a6e53a15ae1d41e7774669206863b12423f507a14cd',
      '0c1fccfa30d89a441375dc539a772a61df9f67d195d1e0db927fb62144e4cb19',
      '15f2f536f7a1e8b3fc9f44003ad39cfacf757df7f89181e4f2020ab69a0a107c',
      '253fb92c9e8f85f238c589f9de4624e49ec76cb41bea0f380e73223c32ea56f8',
      '3853eff78d888da9581f8ea2dc286f51c113877e9144938e8279b7eb45461e74',
      '4222099a3772fbcbadda994c914035c6b432028aeb942392a9de4a50431e37e1',
      '46c15e830da3fb9b56ea8082d5c92ab26274976ca1231d3dba93fc6468aa626d',
      '4c62dd2d206b77da1538ae1158163d79a28079de67e50dd057d356e357827791',
      '4cd082d8b33275b91927dcc9a1990fba8a39060e3b7344a52a8cdeca1ff84ead',
      '53b3d6435962112ef79dfcb5c1c16920f22dd4b562c7b307f1644e7fc51d2ff2',
      '58ff8b893f3b89725aa2836b77981c13a3a97d142cd9f26826f76895f1a1df51',
      '62470f0b9bb7da28d5d1324bbc11b6a5c8dc23af0acdeb4a3e9ea8817e3481f9',
      '687709e7900c781b13be45e13dc69ce7e0ea67bc13b6b305992e1b215f8644d7',
      '69654b7d2a15fe1c308543fc94dbedcb8bb3546205a89a3a1bb22f38363002ed',
      '6ec81b7c50c6e774c1bb8f4e85eefe88734a8972f036591daf72d9aff8a32332',
      '763818dd8bb4c4acb5d16baf9d7d812314ca84c47571296f268a9ece97bea9ea',
      '774fd4df0a41ce0a5fc4eef80492f178b300f7c6aac5230806c011e15a70a350',
      '7c034403b79f84e3851b5156567870072f2b2abe344180835c4b717ded1d26a8',
      '7d962b9baa67191aaf2ab4d30a131983508206125d5118459f665af0d9202bfb',
      '830148f059c0edd5d5648e6138b87895fd3643091c6e7e19d5c2fe172b140e74',
      '85053bc742609c83a5725e33c78705cf23aa20aa03d3011cdecfe516848c6a24',
      '894df3c0fb730743c07bb742442f52e078c2f539f58eb9027e6fd2ea0d725789',
      '8d5096d97da696f8364803c4f299c1a4c4633c0992516ed12cbe01d369fa1e6e',
      '9206bb46420c160925772d74ddd13810c171b185fa4aa497fe2bcd28a5503003',
      '977953478789946ffef98be057dde3c61331a9651321325154943f4a09328f66',
      '99eafb519ad3199976dcf8dbd88ee9648c85722164b3066da16306216a35d219',
      '9b84676797a2ae36d307b9dde904e83398de5911fa6cfad245a2057eb0eff7b9',
      'a3d48e3b5febfb61adbabc8ab42b41111b21687d5436deaa022704692e5e0f72',
      'ba8ad1e2b43b1692d078cc33b9034c899662348bacbfffb1434c6cc7791c7c9a',
      'c5b9c7215c1effc451e1e20f25be29aca46b9d49a24b656787cd132705a833d6',
      'd3044ca8922ed38a308728820a11f2722cf6b83dc697e3bdd581cc16fc6c2def',
      'd9a830586613a1ae2f2778bb52c64ce070c8d35bb70bf8f279b9d289af18f73f',
    ],
    'contractor': [
      '0075c878217094d6c8fbcc9add68ca7cd2bba457d0728048e0799f5d1c1ebe71',
      '00b3acb2f23edad03e80aab8c9f40a2b24645d2cdfa84e449bc84643b56b71eb',
      '076c20a77cadc6a0f144a711aedaeba48c0655147836e4f7a4c6043787c1f6db',
      '078e1841b3eb15e52357066d6d4bf63cfb3780079e8aa7fc54aff53376353e08',
      '07a73a7e0756b177cf88acc6bda274f4562737c9e4b1973717ad30ddcf7a73c7',
      '0b08340bcb067eda60704d801c96df13eb747490d5c99a58bd0e6c8bc3a2eb06',
      '18b2c8fad83886e648fcb276ef4e8f94396805425cda731a3bef63a096f5d1b9',
      '1e6bcdeb851eb0d4568dd29b2e5e31f4ad751bf6885cd23c986e1285a852d76e',
      '20de5bf7775ab24055ddd607ef08ec8a3e4bce74d5439619ff82500702082d52',
      '243470bdd9277976ed7441b0ad5c973411c5b660bb78576b40af6075241f7cc8',
      '2a092e44511d8a45564659aa9a8525b3730d8c7d25fd040b3b74a919b6a0b5d1',
      '31ea45a7414d939375361e0541bc87e496540aa00028efa4e4d393f201ad66a3',
      '41e0d9b0856962bf766e06528c29aa9f1b629ddaf38045716782fef46945b92d',
      '4e78112401210b22c4834398bb900b297e729f5c821b40b7034f524a24e2eecb',
      '5a3754d8ea9b14078635f14b6d42c9764e1924cb5702b4aa6281b2c3d5ea7ba6',
      '5f696081c1aa18a6a6d31321cfc11bf5767339a0042e77fc724310a4b579c831',
      '606b6b8590bec088791c5be73e4bd0fb5037eab281794d69726ef3031b9cb2d9',
      '608659878728eba84ae0247aa9a233fc5fae5f54d6344b90d3873e08ed0df8cc',
      '60cc99a758c46d53aaaeffc9d753b9281f6f7dc36f40062ef057b7d94b57e0c6',
      '73a624c2ee9ede65a416d5284e12e529d9a18703ed88e7b806822444dba7aa58',
      '7843df593d94bdc6da68aa7da0e6cfa006a5f892623fe283a99173896848f4ab',
      '78f0f31059162acce35648d8c58ef4b0ff3b3145e56266f3c25cfc350b1d97a3',
      '78f54a46a772eeba1e900a5e2dcbf540dd0ed4e61ae2b5b0adc149c0fd3f9584',
      '8997e3dcbfc7ba3c2de2b360b37c41d9c63e1e7aad73e4bf6882b6779a5ea776',
      '89e06f5758d655a2879dfb234e538dc2bb308194e9cb10639af28484e6068cd6',
      '934dc86c1fac245f5624dccfb990a14151a5078ad7c0ff6439d2dd5bd9d37b9f',
      '96322666049ee213a6013a1d6897653739acd5525418237ce03d83847b919757',
      '96ebc8bb44cd86bb02a7afa15fec8e5e80192aa736adb7498ac7b3517e6861b9',
      '981a4f0bc88801681720647498a5520f69611fbbca4e94cbe38f03e4c64fcf6d',
      '99dfe9c62adc10e7da97892e973997efdc7f9b1e9482515b13003a33c2f04535',
      'a024457bf9c1417245ad68e44ed8f221f25ea6c49d999fa4f6a04b25eae3a101',
      'a3d729727520900919d73b1eccd94cf72307e63d802fa7e224e3f42432bb4e11',
      'b11032b2395c1abaf840e6f27b838456b97c72c09bc8594a238f705b982a4e4c',
      'b7cca188e3f175db933a100e02f005c8cc73e1b71ce115c15392265c7a7c0bc5',
      'c0fb9ad5f2c7b0e920b3554db27e4af431bca35da9276bfd3e0d74a00b1154d4',
      'c46d37f567f52760be9a170fd09d1669506bcb6dbdab991cfbb7ee6368d5c252',
      'c56d38df85ee999ca7b2b28081d288b5c19e47fda28595477799f7a5a6307a8b',
      'c9658d8eec41ada2fb107669ea3ef6ab75c56f3c1931ec57dab67c3210f4d5cd',
      'cd918615e0f8f4fbc0c5e1c0b323ba2545cb1ff91cb46fcb7a27e9a7f9e29c5a',
      'd3160e9a6a7ed9ad026e3af56b8e4253403f9174e17c3a69bd48faedc04c4829',
      'd54ae37b0c6d759e9ab40c87a2f4b617a1eacfe19f0ce9a30c54d76fc5dac762',
      'd5e92aba7953f70b5d1f2567874098d9e82f352e19d2beb9b3fcd656a8498b3d',
      'e18e862cdad4690c44c759999bb632f14a555244f34c9330bcbb2858fbaa3dfb',
      'e27417b0085809194b8e25907348616c68584d82fad9f3defc2edd75635b27bd',
      'ece5f842be1a0b4d03e325c5489b7ef68c92ab9c692864931b6c2677beae3634',
      'fd0deff1e1d902165c7f6ffdd6a06a2e2577cd0dd4d58798867fae593172031f',
    ],
    'doc-updater': [
      '01a9aa54e704839d6ad822c664225b7874569dd9465437cdfb31173695b9d7da',
      '06b45c856b6f75ab2c2aa88642fe5043f0be5911b343c58a5c79efefce1d27f5',
      '075d504a3c7fe60e3c11626097b7491896941ff88970643c5d22836b62484b29',
      '0d8bce4700966f620ff98a5a1346645b8b0589871be4a4a957660a2d4143580b',
      '20d33592aa49fbdd5797383b669d4cc60a42f56f86e5ce0311748d42e7958f4d',
      '21311deec70f213d2a86e62eee9ccd435bb2ef3302d711f616835aaa11799243',
      '303ae5970d80bc7c3631b710cda5e0e7506a9d6f18ff93bd4b125eee345f7f75',
      '39b73dcf07e015b10403d8cd81dc8237ca2b11f6d332b29910f43729725ffe54',
      '4a8eb2058ce82b475d7f0e3829bbe81f21dfbf3701c26150bae6fe431e2e3ef2',
      '4d3b8ae2a069e573e04961e5c33e8e33d8721bee5fa6d51129e1fa8e1f87cc50',
      '56f03bef467588d83ec019d6dbfd24062dbac0c43d3a8c6cd95e72a394bfd7e1',
      '63993d13b8008a669bde0119e39efb7b0c59c67c36635129f7b41073da56fc83',
      '6661a6f9853ed6f86d49dbf5b6a8c1dcafb573ae390da41903625e56d5952f70',
      '69c06a5d40a5ba8fa5a1a41daf0340bb0717f76f61c17359c4671cb9a30b6734',
      '7126cc5fc54d44a6b909def112ca28970dd1b8ef50c6fa4a504f722afefbbaff',
      '7a7f78183b469d088a0a0ed12a96082f50c70743c6660876214d1d0ac7b292be',
      '88bda5fb0fbb35670082de95ebc8febd07e1abca3427d802ab5dc74699f050a9',
      '9560f78a15e353ef7775724e26679a3520e66ca4bdb4a6940d9f41f81104679c',
      '9b680ba8b69ec09588eb100a9c1936f2dce86d1033e3c4c6e3f1593b5351c802',
      'bdedaa72e80eb38e1ac664276b2d0399a966710e8a90eb7871586331aef007f8',
      'c948124734fd8a3624ea1f97e648a22277f39c3e88cccc81896cca55477b1f81',
      'da298ec31f58024746a7f9dc6e9900f09042ecdbff64d3c3fee373804474ca50',
      'f46783bc71ab36dd2d8a27cd027b8ae31e4f3bb2b53d611d801d92a636c353bb',
      'f6906d623eb8b31cc11615f590d2ae8fd5c1ba9da0aa937ae339e248945f49df',
      'fbadd912cee307cb085caae077b18333ead9ab45c356d5e6fa4fea2f56fc04a3',
      'fdf03f841d3e5af204c3289d7146bac96273614dd38c0ab664edeac1f7d722e1',
    ],
    'docs-lookup': [
      '6192056e92b1eb311239c551b14861de37924e8e6725f8f2d4899b251793ce01',
      'a58b45c23267ab59ba1de18abd27f26fe3e9083a3161d7df41d0f1831e8f9bac',
    ],
    'implementer': [
      '0955760870ec17fb961e144cf170110402b53698be36ec18d060b0c3955fba6c',
      '0df3526e64655c57c165fa1333950e0f3729bc201c8c8110d5bb13884a9eab86',
      '111a0bc7ac03eb513078c008a81f6f402652a0e554e3bd68b3151c42f6f41f35',
      '1161d99bb4c8dce7bfa73616b8930c35cdd441570ade5a4bfa31767d33976202',
      '1499d23fc61931b88dcc562de8f2abd4710dd04ffe9dc442ac7feb2712208b6b',
      '16873f976a720886c2083cd655332d005e58b1b9a4d4c109c4535e24c7d21487',
      '2e56d3823313bf98f009624aeea7698166a100e4690804140d471e583cdb49c4',
      '3302cf89cfdbebc181a9b31ab528cdde74eb7c5e1606439154e97d124baf908a',
      '35f5745343e3834b9995694157ebb56a6c8da16b49ae6b9933c15f4d5669914f',
      '4108c8ff9ea05db51852cdc4f1e4145d867e30e1e9e27efc8d6c0f3aa3c7d5bd',
      '43eaa44099c02e9beb68486eace5fd6447dee9e44b0f59d8b9e757071a0f0104',
      '43f73e0df8e1ca32ead4585ac8b3300df130f1e651c76dfd99ae397ab4de4156',
      '46ae11e4c06c878a6c9b139f37bd3b7b84bde1a6038c5c4498b489e535335b51',
      '492466493b8d5c7dfd921936052b3db66665356be189381a4ba6dc9a04b774cb',
      '4d2cd1140697a6a861c67e8eac6fffe16e63e8b9b765c085d863e099efce8abc',
      '54919ed8f2b5849704172e79c96075cbd143812a820e1b8e4917135d6e261e29',
      '6d50b3b061f858c1c7b6066127b37ebc7e879be02d7ef9ab1ce5aa51d976faa7',
      '706cb6d4c0bf682677c2fa9ca1eb340a5ab2f502079f84f1f17fa12edcd4d66c',
      '74c6119daa7a0f580b5645d4dbb062b47de8de23a6ca7acfc3ca5827e626c2fd',
      '77dc885329a39a58aff18dda0081f23a073d8e3a85845eb5cd751022aa5bfb09',
      '7a5dadc0e2b05281dbd221f17fb6e8485c588a63c3514cd1241777429e05798d',
      '859690fda57262e9811a46503e51a1a74b1fc928fda2345b703ebe7064a258a6',
      'aaa37f1e515b0f2aa0c3e2470d68653e3c09f31c8564c3ed1cc00d32d509c13f',
      'bfe7ce9ac862bc8ccc01ea259832aceb0827e3d8128077aa39ead817457b068f',
      'c0396f27f5c65646b48c399855d3308af310fb96ae4dbb62268c8f54e147d00b',
      'cb29f363f9ed75761dd46d39172ad0cd7c6b6ad99934696667f51d2f07c8458d',
      'cba3024e73f40ff34fc62d4bec6a3d8d886a3f2622b0eb495d46e110a59b5f6b',
      'd18029f3018804bc508b33f0cae4bc4265625be304c8724c57b036a3085b3760',
      'df9a1ead3336108dbb19792a580cedc29df95f7341d0486be9d9ab6a9e94e569',
      'e0bd2e6d306c5a2fc1b84d43d828da132307e0ee1bad0884a63fa75d8431f9c1',
      'e22aba2305e590ddd6fddb98b4e906d8a482600491e6dffaa9089fd3bae90941',
      'fa23dfefd7f9d06afacb003a3d0de62e2a5cf2ad8f25f2a9e2ce958a4e22c827',
    ],
    'investigator': [
      '070b2b78fd210222ead9a478828f5cf92835e0158dc8612bdcbe5bb1650aa4aa',
      '0fd6ebdd4a40014efeb3f28c23c0100434f5842a5dd312ef41f66cc77d922197',
      '284819ef6d073527894404cd00eddaaa786c6824d3b382c38339fa10ad9983f0',
      '2c2ab0ad3a2ea9d458a9359668c0e2b3c656c880eb8ce1a80788714c9bf98ca4',
      '2d858cc7550001e6fce688d897505d4d23da7bf45ef90f1d2c4e9e048f134cb4',
      '692d5a82f02183e677bbb82bb3720e7111f7815a140c5235042e84631bf99711',
      '9a58d2bca39bc76631926a2de317f028c5aeaed0be2e06d21fad162c44ca69e9',
      'b07f0ec55d2649709c80755af3927e77f71802117ee955002871b539c9182257',
      'b2ba7e0faa0125ffca6642cf58af9d2569d73eef739df08c1dab9d3de8319ddf',
      'c9942a111084b7dd72ae2393d0ab58344ac2fa007ced82907d1a84b3967adecc',
      'ce3492da507f8eda1b5746b96a1552189002f942c178fa16e607c3bc25a61fde',
      'fe04670bfa9a0a92f333245590a3491f8c8762bd50e5419108e3a94d7ab52144',
    ],
    'issue-scout': [
      '3ebeac55db0952059d88558fbcf44ecffaa395a4d4ca88b69f04c9d8f9f44980',
      '3fc50add6616bd7c315899fcb5dff5cd444236c4cd0d57fd017105c34d6c98af',
      '4183587272a8c411fd6e0e7dcde64ef990eca8e1f870e6eed730b0a43969e951',
      '466c1dc112df8d9a9f43d1d7da64cbc2c068fbac7ad8597b2ad7843f0424053f',
      '470d87af93668cffbbddcb9d8937d66f62e245d2a5706a9c1c8b7632035cc729',
      '623cbedeb3c368cdb416b2d38007fbf8dd7198965bdceafcf33f019f54cdf5a1',
      '68702c03ca2dc321932cae3bf375252c809fc3ab7f0fb15aefdb6e0e49d57a9c',
      '6cdf5e99c28341473d4a1794b772aa984c97e9121454d447d236f4a9197b1070',
      '7029ec10c00c8eeb0a68804a4591f6c711b6a4996a0d99ab8ce719b724df8b51',
      '7c09cc771870e536fa29a5d36c75a8ea3f632e535be436017778ad292a553d27',
      '842195d991b60af4e2620a04c10005db8ad01872c49b37eda30b9e870408c552',
      '89cac6b32de98a352ad958d026777d3d653a698db4a8d883710f20460c32ca7c',
      'a37b59cc0be5af6f68b1f0e80786e9c49f85195e2875c8a0fbccf3dad5c1f529',
      'ad6a3f1bec07f4d5ed287c874adc2285ec162248de7747bd149808a9212a5f98',
      'be3b19913650f7c02087f562832841323d202f750cd3523e4a11c3206057c747',
      'c0d255b05a10fe47c67b706242158eaa959464e4a28b56562e4712cfc643b835',
      'd5acfb78c2bc8c218600003d801be238eb6f163bd66bf74d455bc200d51f8a78',
      'f9200ca40afbf63eba32c53d6cd9bdf8c05cdff20c085a3a695683b651971394',
    ],
    'knowledge-lookup': [
      '0f4545c9dcbaa41e9a51e9423fcfd48ac53b8264b7b3666ac6f897b992abca4e',
      '2032d4dd420554a412ce19bf1cbbdef39bfdc0673e18075bb1d8172267686825',
      '2d56fa0c30744bc2b5a42e56cef7fb54c89e91e304ea6a53ea2bcceadbe9c49a',
      '31ae47a92e92ffb0445c02aa0fc2a494df978dede1a7d71ab372466e30f5e8f4',
      '3cf7fd97dfd84ed2cd27220da3d505339fdcf0f85e7891dcde68eff8ec6ce147',
      '3f1da720ad9c3999954c3655fe7860156728013b389b390cf5fe9661710669b9',
      '532662ae02c1e97ae4aff7e46b97499ca3b53c7da14605e2c4ea5d8d70d6d837',
      '5b9434ddb86075d071858a8b80aa5fc9e4ad1f48960b96a0416cd5a9428e2717',
      '5e3badb6de6902fe0effdec5a41defad086818871663b696078ae2dc86baa8f3',
      '64e72abfd900ff8f4510986b804470625d736aa8d7e5010ae206668d817282f8',
      '7d6c5a22549a766bd240eaa59344fef309defa3a3522305835faa81ee9759a81',
      '7e776520d3fc44694a0b07590e2c855130ce38e7c49f8d3fc1fbdd7006c28e6f',
      '87ccc54bd8bc71cc0a039dcc68526c4046660fe892da2e7136fdd3f6027ecd37',
      'a16d3c683cfb59bbc8a28597981fbc8ea1eb733360053af4da1294e31ae480c4',
      'c537e184dcf2ceb65b409ea1bee52ae3e4f66c92d97c1cc8fe7c4ce9bbcea9d7',
      'e935261fb8dda1eee093ef901476d80d78eed38579c2b764580b960f7aa86020',
    ],
    'metric-optimizer': [
      '025d2e428517ac7efa3210f4b605e78bdfe34ac7d5bc12a5b642f61c74c948df',
      '117a6f49e6e846474f1eafc9b0d6e21f1c764bb87156d3f8a580fd90efaf2f1f',
      '2855bea8d8eb4c4c96b663d6e0e5ec1f61b68fb6af06c89e71a95d87c63dfe3b',
      '33779af029f91bb98929ef96802b327898d9e1b1160610e772f5525627a18b5c',
      '3460798979b45d68d5c09e91397a074aa3dd7ec72dc6d4960f98143c84c81c01',
      '3ea8de03f66c46d1498477b1f401c0bf49e68adfec258268ff00cef435c082e1',
      '41631cc7d319c808e3f299640e8b78fd795952935e099dd61f86a2178bc15b16',
      '550dad9e8e114e2f75cf340db1b214075d7931c7a1b5352662820ea5a0f28649',
      '80d27e89389a0d5fc0c661ba107ae2e4cfc2cc1fb5d6362fa082fdb90ea8047a',
      '9ca1f416ee14c6cbfae7a64c3fabdc25b65adf32c37a963598bfff22ce7e7765',
      'a1578dffdde92566eeaa20c69c97c903dce14b9bbc1cd656979d87ad9db86e5d',
      'ce5f8079b5857f7525dd5237ba8b932499642df3b4d8f7161a67f75b90512036',
      'db14dad93e54e48a1122d1746dd0c9b198cac60dc61a12f768aa9e8856103312',
      'dd38d7bc1209715343ce9f051e52480bb4eac1bfb7f1fd6deb5cea5964db561b',
      'e70a7821e7d86d350a6437d8890dcbce0417d94788472a9eb2223f4566327f16',
      'eca87d2d3cfe55c47afdfcd61ba67304d182d56de7d13470ab71d28063706dd0',
    ],
    'planner': [
      '0a3937499df4f2a46f084549b2e57dfd6b36bfb8861a443fd6c7bc9582e01fe3',
      '180850350f2059b520c8d056642335cf21f9720e95b4542598cc60cc9c0fae0a',
      '1f3ea42def86634193d639507bc4a5dd067b399034983241109f217d60a194f2',
      '4717c227539db46ac9a37e50d7d00682dba170c08fac1ebe85fab1c2baa7a428',
      '524e7696c76f46a7e5103363eb409e9636ecd380b3164a35ea51c7269868b68a',
      '5a7f15b8f11086ecea60bcb78e160372911bf6b0bbeb09c3cd80f39a6fcde96f',
      '5b88cfa4d8e3567f9273261916ccf6fa355b58f7a6d7051abad3733315eb16be',
      '5c6fbc340fe68794ed3c3b2daab283d7380398559dc56635c6063050abfe9644',
      '789ad72c5b60c61510411c8fb35597267b4fc477befcec27d2e5b458d7a88f36',
      '8ab78460f2615c59a8cffc1d004eb6261938d15ab1a64fa840372d56cb38a5d0',
      '984193a9ec9260d0076128e6a9c91a43d22145396b3942d995233cc230ae086b',
      '989c26d2d8e84cf29deece08c2d1307e276b194359e10e542ae9d944fe524ace',
      'a1b44be795c88e68ed2f2a113baeed2d926c6b5857cb2f9446cd45ce0c9cfa4e',
      'c3338f6098e64778a1d0718948bdabc8b58d00932a472c8ced9c1bff6aca0191',
      'd331738c872bf4c1c687c766357ab08bde309fd0935474ad2f44de8c2fd6343b',
      'd58f620b081b5378f048bb4d042bf68804eaca371d02f3ea35714d44fce6e4c3',
      'fc5aeb7ca3ab5c7367133765f063ba146bca7fa098c899827e9b22e23a84d3a3',
    ],
    'security-reviewer': [
      '092992f73ae2d92066fae9995b65c718bd88230e83e7747d09fe52fa2d3f2149',
      '098477aa4ae8f19c8d472bc043c640d19292523aa636eba846f79891e5f8c56b',
      '13c55bd2babd25da359643a1287892011dcf3a588ffef5be10d176f2b0e04be9',
      '1fbd1895d8023a29e4bcf52c40725d0ab08c17139407cd39463527d076933aad',
      '24b87e087a521fe04526d0970302c3cb319d66a68f05eb3ddd47bc3e2d80bd13',
      '275147330461caf6c1e3915df9e30263d2ac9a42fa7973ea937356b8a119861d',
      '2ba2be72a5bdbd71a35875210da31d0857b8095ae95269276ab95cb2a31b529f',
      '2c69e5c83da23309154261d6584865a0638c62320fa0f520f876c7fd19466fe8',
      '2dc88c9d1004c5d80032c8f314ccf228f2592fefadfc76749e1e4ff90856eefe',
      '31ad9910dc076ce2ae3d4e65e95cc7e9bd9e150d7bf84a1820a512e9725e421f',
      '4e9184da36e758d1fdaf547300820aeecef36259659b5a4e3b85e96013d2936d',
      '52d653c15f3ca5dedb054dd045cc64213d2312bd76d9439946e8aed9ad3d32d7',
      '55d7c90f789b40e3724c74839d5e7e35b90c9ce95d2b3b58c71f013e71f44e27',
      '5a7b231a3c5c1aae909fc3f2bc56e00daa4a7b5b98ac45c7c2ea4747904a5dad',
      '5b75121d93759c6334f155abf47d86f48097ef5accf3df2d05cc4877b5b91565',
      '65f942a0af147017cb47be3983d010a4462a49888065f45837af1dc2d70fab8a',
      '6719d8cbcbf1cd45aebd5f0bd98012004ee08c382c4290f91482c5cc4a5fa3cf',
      '72baca3c703cdb89cef91d4ae73d12156688f6db949de2c970ab4dad51aca485',
      '7830b381eacef7813200377c84389d46947b22a687a63b96785fe5cac37a4b27',
      '80f9981f23edbde7ec372ee701719a2f21fd094e56b0f6898c1f431ec11fc8bc',
      '987bb2c2a399c578b3c7c935311f96a5de046e57493de0a923b003f7fa7c9870',
      'c8e4f717afeb16e1cebedd3f434f748dd4447bc38e4173e762ca4da8c07c269d',
      'caafebc939dcc92bce732c5a9cb76169e6a449b64180d9a045a8f005c28bdf99',
      'd182ff2067a3872c0ec295fd729624cf739eaeef741f86499df4512871b625de',
      'd3d0fa073148f3bb0ac2cc231db5f0923abea59a92d8ec8f4d607b2509f2ae0d',
      'd4da5970c03efc3ed8a366eb7687ac40ef50e54e13b7dc244253653a1ab42ab5',
      'd8657e34959d4a0cc58d171d5034699f83810d5d1776d2f3ea52c2b5a2632f8c',
      'ef8fadd2bd4c44247616b42923a0c36618409597f5903740831b1ac13791a37c',
      'f0070a5d7b936572d7da2bdb150f08b4afe566ef0fac68fe7a1ab52885dd44dc',
      'f0c4ffa6c8b78d3584a0dc495f1609394779d9a5899e1728ae2b25e2ac4c4d05',
      'f184f9c1180d6526698fb9f89bb115299f3d913a5a0d2a10f7598cacdb547b1c',
    ],
    'synthesizer': [
      '05d2a3587edb46983aaf35926035b827c7a8195c5e9d62530c9ec45a0a2fa4ec',
      '14acbb5c946a4db72b33838462f996c88e505aab54e8ba4202ff6a456b2e1982',
      '161077a298621389c8fefda002d86b1352f259ff30981c4db7d0e3b080a82259',
      '2ee306dd8e479b89ca8bd9f3116ee76aeac9c691baffd027192cfebe48c6d8a9',
      '31bf395f7f1cc5690fa3fbfc1d9822c24ac49fe1b3c85bd20277f49d947f00e5',
      '3f711de7d6ffb98287b0c78db189d533f114988744de1504ffa2d6714ba28b66',
      '469a9204c88a3ab2f014dc4dbc894cc5e21047670cc2fd0f65efeeea8d0b6eb2',
      '4bdc4eb1f2ea5999ae1db3575abef837f2cee34458b3d3a29772a972df67d627',
      '552629f3682d442db2fec52f21dd72b7e69d80beb6fe38a19366038325d31336',
      '63614c77b4904246c4b74adc566cb8a2e64c00b5a26a11d95699b0da4b12a2ba',
      '8944dc68cd21c544490372414dd32201956108712e45addc3152f665b66b4699',
      '93425b6979c41130d8bb263ae51ad0dbd080708f3ecd20e2a8dd32edb086fef6',
      '9cf855aa74cf0abccaf50cd9702586e015b7c3e3b313f8c87c2bdb4423b664b1',
      '9e5731215417821298fc7e9911ba794385754b575c2ab14eb45c104f1fbb0563',
      'a9143b368961e6740bfc34b24fcbbfb0ed30c7be0284ce84c1a97019c84a182f',
      'aa62c42355e3f6d511c28753f94dce57d19d218fba736750cc6e0843ea49d8ee',
      'ac7a3e7589e57c86ec799c3d45c13af3e4379e7775d869ebbb49f24831542296',
      'ca1d9680a2a9f96a6fcefb0f56c722365ef5ea9897e65377cd8d885761bbb9fb',
      'fef74f483469fb3a0cc9470910ce17b40a4bd2606ef578101279e74e6237b8d1',
    ],
    'tdd-guide': [
      '24983cca33ae9bcf834971fd278dd5f3f5c1c2ba0f2cf0d04c6b4dce5483ce7f',
      '250c3dff3f1dae615128911fb2388c9decc79d2e99c36ee2668cfdc699dac298',
      '2a31968fb83fbf95bccb5c850e487440965746876c7a7a7d245d3574f7ea85c5',
      '36588a2a8f426ef71175c0d99820a29a1cd8318f2e4e0a36ddb1bcf8612f29af',
      '45350968e9b031694091f6ab8f37737970e6bcf5ec31389b16e0d6f95719536a',
      '5c044feb69b9394e3883318c2c79e9b749360b026bf1199c5204b7fb5ed96275',
      '5e9f5dcfaa859eb7d8d407a1574a59027d621ab40fccbb172934a8d6b4ee62ff',
      '6d7a42ea1d911307bc4d5d0cdb1bea86de59394656d8bbddd0a927b0f5fb809d',
      '78163b01d11c5d50f82cdd9906856e6a23145c88338a54caff52373e3f7b790f',
      '80d75c0a48ea9b435d1f2fa34dbc34f84391f7eac90ccbc225b91ca9a51cbc45',
      '9aeb347d8dea4c140b0a8083c4e55f1053310d5191eeb8b026771127b6e206ff',
      'a776df154c17f4dd542e1411a0c9e0006c5b9048da91d25d52f4e2f2796257ef',
      'acbc05b9d1c6574e07c7bef22e91d8ba3a9de252f817b5594679a5914f139a23',
      'b100f7bb1f29acfdfe5c97e339a42194c0b8d7e0d5c6232a832d935868e3d2bb',
      'b819bacd3237a6e7bd1e483f06f0d556c55ed24067ee616db97d42551f62ba53',
      'b873c7e4c2678111d1f67d7f50d0020b24554aebcbd04bcca35a052de3ead03e',
      'ba5d6f23e18522f16efae9ee77631a45645bd321d47260d9f2641c5079de86ad',
      'c08e513ed4deaed6d5f59a77c60ef9b398c2eb98f3575a61ebcda91f31c95019',
      'c1f4eeb63065f2121f939b10d3473d767f9e930aa7e79230a252923837787323',
      'c90233b8d990254f66d04412ec341d6916da579692ad516c975a4081a0caeb07',
      'ca25d0a8eea17d23b445a6cc9e0d3e03e51bd7730ecf813f3ceb8780ccb44638',
      'ce5e25bff01cb5a095f1b61e2fae594241628f7f86f5a1ae592b44922628b595',
      'd155d682bdca3de5ac054843131f367c79bcd551fd3a9a6021d85b37ef62aa0e',
      'd19947c542fc9174c4daef572bc28dd6f8058c44a147412ecf082984d319b3d2',
      'd72dc5ecf011b245b0b86a5426441eed2fef9b6820deff3cef89e930e06010ee',
      'ec2cb92453661173b6413be87e2412bafca279e0d52c75956985ecaeb356eda7',
      'ec47f8d570fa622b3ff853e8da2c7530842458c9ac4ebd95e0b8063cac456b51',
      'fff39ac79e326f68fdb112db52ff798243cccd1a2f9f6a929db4fe32cce05dbd',
    ],
    'workflow-planner': [
      '0055b7355a595d35e5036e193afa561e8577634e6957ebb92635ee466d50eb31',
      '00615cba1e1c384a835cc8521ea261e9a504db78947b2ce24f54592814305eda',
      '00e5d303af408b1e3ffbce112ced263326296b1f9a1f2306d62ab06f242ecba1',
      '011844354129ae0a0609cd936f204b432e825998548955f87aeaf374543f6c20',
      '01c8664bea17330fda1019975b87ec818251b58129c3c81ca31647670b2328eb',
      '0367419615258f89f27391305001703976ea72c8bcab2592f317e02bdd7629b4',
      '09c8696b49646f373a90a2c8a3ff5259387c2026232e0d10bbeddaf0a3bf84de',
      '0a5f4bc7c5b3a94aeee6732fbf41aa6e2469371851e72119aa14f2c398a363f6',
      '0bd5790ef38314a30a61bcff894c625f1c987becb9400d00c567ac7f673cf4c7',
      '0cbe7724ea84c221229b88d66e4945bb7114a7c448dbd0a9040ba33054178461',
      '1271d1944f604704988a0d85e645bad3c610122c6f97b19572463990d2155f02',
      '13f2feb2fcdc15e8d43e03b9d2f002f9ce090f36a1c72d42eb5dbcd5a2ec1ff9',
      '1442bd3d6c27c8c0b07aaee592d7bd4c9b35d1bd9f97d625688249951cab2ff0',
      '144953d1732099476af369c4200def9512acc2e8ac3a89d6647744b33f05f617',
      '171c64104ce9d62a8e4b9dbcdf94bb16f76d523e8dcc4522016ff64222856938',
      '17719b80bbca65d74e85131b0eb37328bd3c35c119fdf81807e3073e204c1577',
      '187fb2094526007b34e38bce0cb2aaa2dc93a8f638ee60ef52ec9f52af7c5fc2',
      '18a8900510b9cc64914cce7db98109605fbf0fe37e8d27dba77aced56f2ac124',
      '1cd1764a6752d4b3c51ee8eb952ff79a939a2766bcfc53b839ded061e557c58b',
      '1d36c8873ebdc63f7570f53f98305caf3379c506a9df28d50a5669496482521b',
      '244cc2f9bd36b2624f07e63474f69415766c249b685b04056c25c46a71f72d34',
      '2ab9d23065cd257279db5145b6609543d9b19b12ff2e22a22eba38ee872cc9e8',
      '2b3cba0cd3bd66267ad2061353de17472146ff16b92e01b794f3b5ccb3e5c5df',
      '2df01abaa487a06a2043c7cc5f6f073b42f328517ddd4ee89c30c571b62b6ec6',
      '2eab3c80af32e2a2258d25527b8b9c43c00e81874ef3cde9725e041919c89dcd',
      '30684382ec297ff217d77222070175646d5a241cbfe06d03328a00fb4f3615ef',
      '334b87a99f3bb561179bd396766e53a8fe5f2ae4f3d19839d5749ed541bf9ad1',
      '33e18c649a32118fda63f98d5de2b7cd8d250acf18fa80a758c04926d77f367c',
      '3668ef8b3e21a0a27a7ae2ed2d2bbbf53793b6b6b7110c1d3590485114b7a505',
      '37c5fb262cf76cb5290f856f6f220486a0be6e33d4d3aec86c77c5bf80b8345a',
      '37ede37be426fe9b7142c8a52082233dffeb55c5ae6d9601d79c90e1a6892716',
      '39254d0cc9fa7607dc8206108535d1ea6f41fb29ac01d89b4aa44a09f19b6b38',
      '39ac3913472c8f348af96d1dd327c018e8869e278983ea63961c8877be1bb7c0',
      '3bf07b03a21440eb7057d1945f6ce9b74de0bd42799cbaa437fd6a7cf307eb32',
      '3d9f33e45c6f963c2a1d56d6fb3de45ab976671088c509dedcdd6ce3a8ae6c75',
      '3ea4df91d13c8a15d7b90898c25aade24f57195cc8660035f6958c5e48b28be1',
      '40b773cf2f2261fde1a211bfa373d94fac1b9f5465ff6ef5efcd6a6fddf97270',
      '40b8f1803ee454864183205fe66bfb752940fb75c522903dc3bda0c9a48c89fe',
      '4366bd544863be4900ff62bc1b5f5e17d59559e6e5ffeb7bdadbc06948f680c4',
      '45001c5328113be4ad79d2b2388533eda387cbcd98223c78169cf0cc5f17af9c',
      '450302d5429e8db835e9d0d4ae2dbf0682dd4f7135ccd5a362187735ce5bd692',
      '450bdc9e4f6a446eea9eab6cdbbd697b257ea6d57a83a103977d98433c392a11',
      '48aaf949f64a328936de0c03b2bda34e35792881a78c30f0902d77298b19078f',
      '48d5ef111ea72de801eadd16b851492086d83b72f4bbc080c791088e61b2f4b7',
      '4954ace55d5f83b65c0f892061860ee5919429788c223583f5e73e4bed449918',
      '4bbf7aeb439ccf62d986bc9385918c3878d730f1ab81ac9d9843cca10ba5bada',
      '4dc90d96b54763d9a3d9b21529f75c365c712871b7e17c393a1af7d3eb129326',
      '5612c1cc9414db66c1f6c9cee2b0808ff5fcf2a094e90eeb2af06caae1ef340d',
      '56ee6bbe97d895143f0a6fd776b58c5607d7e80577f2a316fc1212b2da338285',
      '584d57e1d3d4fd10fcdf46b297564b9c9372a5573315fb119f0d7f82dda75c9f',
      '58ec4b7d90def02aa631c5ac0fdf0c7d39f1432cb64ec8b6dc7d3b765980aea4',
      '5913f78127171dbcd19410884967ce9351ad58e479fb25e56d1beeddbf5da7a2',
      '596bb4a360d1ca00a15ef480207100d53fce8454c4967990ce24ce9818cadc0f',
      '5a853a63ad9417e68bb5273443f79bb11ef4acea744b51380fb4f6558b765e25',
      '5c196a554a9c34c003b88fb384c6adbfd0abe29be178025d2d9477ae4edff0f7',
      '5d237954c902b4a36bfdd5737be8aef3f76dabb09af004e44bc954d919990593',
      '5d48f28ce3777ff946cdae298e79e9440c22e288554bce02f2370d302b1a4f0c',
      '5f27b2258ce06bec93a6436e7f0ded4f24230d8bfe90a30a62d8481d2215f377',
      '5f888616a07ebae8aeb77e0bfb6e950a5bc4268b2faab36e6e7853475d1060d0',
      '631d6d977e28adbd949c4d646059b488e4e0ab6d12a353073123e2bd00380b7a',
      '63672ead12fac1cd2695ae5521e59a0699138ccdd3cefc682e999ef0bfc75fc6',
      '63c8df9793d60395dc9d16800c82249e24a7365658021aac0e3503b3186a70e5',
      '64981ff4e61dcadb4bd6b20d8d41a3ab6d7628b7814827e198b58db9251833a9',
      '73082466177ab51d03ffc927843455a7b066852571eba627cc3b129eac9c5d31',
      '735949582e96947ed2850b6c37bb0ccbbd30f6dd100069cc3eafde93885d8c1f',
      '74bc22009e2e13c0edd583d7f7287394d11ed4f82680e67e2a39a3223b917cbe',
      '756e2b17984f2a57151756fb2c7b60bd4b248327e829f8b2fa44a77fbf7d515d',
      '77be80c245b02a11fb0c2aececc44d87bdcdb6cf4f314539d1f8bb4aee2b7255',
      '77c6b30094156ccebc5280e007313aad4960a3f6e970abe104227048a0585fe6',
      '791ffb1243344812e00639d113bb9aea619d0d9bddf3df30b93c1a087c0c6f75',
      '7e84c03f169b4f06f566ff2ae3846e73d029f17d2e9332347c83d47a49f481fa',
      '810af05658459abfc5021402f30bbb94ff56d1e863bf67bfb02ad048f301db9d',
      '841e6f1b480a3d2974387f5f7e8c5464e94455d5c6ebba547896b007c8ba378e',
      '86dff9795639335484d83adc7560f3b31d1914e8211c0bfd69a9e4bd20f51c7f',
      '8772ee585882fb751adcffb0abec02cf49d70d1a25fa0452dd8c208fe4e5a63e',
      '89131fc6ca7fd89cf5ae74ea64abe3badc7d33ffa93ac06c5a6ed77e3a6a6057',
      '89667041b5dd38479c186ea360272e5e038292fa8bbbd4fadbd72ea611f35ffd',
      '8a24841b2c53b8e4d84360ed066200454f524de791fd785c8213008cc43a553c',
      '8bbc9e329cf5361a48d821d34578c79f775b626ddab2f3978d4da67ad594c52a',
      '8cdcf25349db25cfb9555dfbb66b4e6df0e5978a276691b47d43419cabd7f8bc',
      '91d34db95d676b1622781d2e75b231bbbac36cba4ad2df7de0444ad537267297',
      '9394032521b1ee9a613a058ac07bbb628a90bb8aec3e5cb26d9644e76a8a95c4',
      '954fafe0a08a4e1e6b4eb38a8cb8b59ecba6241bc94a88546474248e0dd7304a',
      '95c05a8f7f1616e00aef762abe717c807324b94ec8ba807fb5502f09419b2e55',
      '983c681f812e7004a3220c7b0c513b2c05ec4345d563f14220f3bbb949d33bd5',
      '99b2244de92fdec088b8db6f734e80e6a10304176990685f42da84489df40163',
      '99cb91f9034669ed40325d78348d6953f2dc32bb147da13f8bd7fdb2c9fbb2a3',
      '9c0925297855b1b35937c3db403f6c9df2b61f799f9b0a236cd541b4e70fd1d4',
      '9cf83b43cfb2acd0e578ebe1a1e8771a04f6b5d34b4d9ad7f91213305d83483b',
      '9fab4190789c50761840e20cc9247832a17e1a912eb64026088aa39d8c43f4c5',
      'a169bb1bde5bc2b57ed26f5d3bfa0aed2aa4b5f55beca5409bcb2ecab058032e',
      'a200210ae88b02886c4210e55bb8ddd226a1e50343f07af0ea7cabb6af159ec1',
      'a2212ec4defeb6d1425cced43b03c33a8a0948305b6ddb65e9d6844ff0c6da0b',
      'a278d7cbd6002444a342242eac34b4de1aa4c9d9afec814f2fc3483b8eaa5fd5',
      'a42bb64c4829e18a97a604f40fda8417a7ec40605787283b159797646d8261d4',
      'a50275e03ed6a518fcdcfa29c4725a2e8868382a4eaf68b82d967a1105eaba52',
      'a581f0ffc42115f4cac5eb3e9dd9f1e30d701c71a07cc8697ee125f70cc68051',
      'a65603741ebbd142ee0d5a258cc7ec68bad38bc77c41b15227ac1679e780a691',
      'a6ca5f6d1533e92562393df1b638c4c5e69f5c3f98366ddf3a6444a08200c740',
      'a7429dec7e5322ea57c610cf5cbe97e6d1ba99575658d2a3f35ec8e0170d3326',
      'a8ccef90ad6c72680549018c6a0f2471e870c2c2dc2332c3d9beea2c20a3735d',
      'a9c88c70742f42d17109f26015f7e524ea6a9f59a0580cb8108b1e279d5fc43e',
      'a9cf24fba21a1ba86433341ab9da5b990ace7aef46200e0c3ccaa581944c7833',
      'ab9354b607f09b553d7141b0214f11cd3c3fc60da26e9faeba17604259daf127',
      'acf1a5bfe9333e48c223fe61d2759069ec3f3ceda63f777062ecaee4c1a48a86',
      'ad9a7d5ec5d5a6abbb6e5e7ace2631af5a4dda3e0103c190abfbfdd1fbbec290',
      'aeb1cf51d2357f1dd3937aa28ee14bd1a84764797cfcb639c6fe320ae2437c8e',
      'af23afaf7981695d9113bba90d2744a5565170e923f3fd0e54a6f730103becc1',
      'afc3b7b0db95244ea0063f8c923efd6ca638e1352334513f1c0ed8eb0f762a7d',
      'afdbbbd44001d43d18db0c87625ffd42bc490d0b382c61f4bc6ed4a7c1d99509',
      'b0d7018e986b4e00afbd3a90046a3adc085acabeae4b4d5ab087690e3d6caad5',
      'b2a4584caedb5cde4fbc5b53d88be625dd9117b724ead627166a591aa610945e',
      'b39d012407078584280e33c2325395a4033c84dc50c19ee4fd7bb341a9aa9af3',
      'b5a9d1bb3ed8e45f9ea9fb0776c50e9aba5f504fc12d1b040156a5102a690ea3',
      'b80c088106d60c13046116703e0c91de1ff95d8c99cde659b684fdd1e0f6176e',
      'bb35ba14bdc0684159c5df7305352b49253f74d39569af60188cbfcfc74cede2',
      'bb5c788476d3e03b0ede2aa4c43f8f8a298df4ab48bc344222e2a3bb042e5bcc',
      'c33cc18ccc4a96e79514b52bd968bbb95f2dc243f6f5e93602ae253644794729',
      'c48bd5d3dfa0ac30a78c5b2c53f142bdeb6edff0ce676c9c22fe811325a3dd18',
      'c54a71bb95bcfcd74eefb37d16ae084385b4c41aaeeb86deb8519e7880a5513a',
      'c6e7824e1ca65bef251abda3e2ee0f55c8e941ed30fa2e60c0f1fbb83ac331a4',
      'c72b2a57dd373cff214ca0488a12ce49d5bf7035277a0a49383f08e3bda9fb3f',
      'c758cda02b83df910da898887a1cf47c2b381a104fbf16820ac6ac5967918608',
      'c7f650b9b1c542454058a3e62671af7d3f9bfef10c35dd3aee3ca90efd61c561',
      'c9ac53b3476c72f2c792d41923df2b17062ad5c0d0e7178c52aab9bee416eabb',
      'c9e0b18999cb8c5e328486b8aca24626dc64c51599693b30bf551e9f1d1d82d6',
      'ce088dc7ffb0ced761f6528a4311719317c49271f2ef07cc40a0c0d90ef5e5e5',
      'cf0d13fa9003c2d5bafe2fa164d5c7d7e846b8e80664d37577e10733b33ac315',
      'cf9c196d5ff5adb64d23950156bb256c6a6e7c3224ce99d0bcac63c3784bcb6c',
      'cfbd458a1bf2920976dd6c2abb748790935e16297c73824984ca1863ecab9a80',
      'd132d069e7885f4636d7601b89e0573974ee5b56e7e4f4cc244afb4887f9f7d2',
      'd15289b752941e2b34e64b421a1109fdeae7b3a4226f994e08dcc46d0a66c76d',
      'd62163f93ef66ac4cc51d999bc63447325c6549b7507063fec16bef571441184',
      'd6b7cee142b114570bba00652b30a14a1c65fe9b308e34d22036bbfccd1e0c0b',
      'd7f4e608dd16c91951b4bf50a9074c1ce1953c8b53b1d95dceeccfac3989cf2d',
      'da63e030914055f75453e8998ba7ec25273f93726cad0de52e9d0ac7138e0af6',
      'dcbca85aa4947191594e425fa474525742b27de90b09f90a9fffca011a52bd1e',
      'dd80866bb6511aeea5bbde16591e9efbe63f51d5c40fce9e0abb09713489bf96',
      'de20641ebfc4d93e77b8619930d297cebd80c504254c1afbb0def38f98625674',
      'de65a3334d9a422c3396aea06ba226cbae7f6b16ee9321769819d41f9eca949b',
      'df2cea0fc493cf7bee133b9638fdea7e83f22343cc5f4583c743a14fa6c156fb',
      'df3d39f11a1ff19afdc9842d1147d2f5346ea01bec60c8beef24a84d64130e41',
      'e206855f2044f7b997450e7a4d15511b3b98e04991683954cf488f7b820e9d06',
      'e249722f64f15235110e25289ad92f3c853853d885535dfbceea9c05f9aaf6ac',
      'e26dde185a38aa44e9d455bef61928b9ef2e8066fc6a45e539832c33859895e9',
      'e484ad0f06294dbb127790aac97ba72952118026c45b796cd579d28754338aae',
      'e76eddef5b56c63557a9e597c793f70ed8533411acf07aff7ae8da2ccb48612b',
      'e9c99547ffb98e4122049140cd7df69b2c1588956ef5759f4a51ddddb7bdeefc',
      'ea018591a1207ac5ef8d9527d56cc1735fa0f8bc231df993a3c8f3e1322ec1b2',
      'edecc53f044487b92beb3f3ae2fa4e461f583bb2e52d203a781ab6dbcd276593',
      'eea1611015986138e67d016280827913315fd0e04442e7ba8062ae8473adeef5',
      'f6ca16bc13069978d83238367282d2d2930a557d89899c60a4540a960279304c',
      'fb94e8da911e66cebb1e7f2cfbd70252976b023a9e3022db0265e6bf09e4d94f',
      'fd63af3733abe55f6ea093a82af0fff504a284e3f50dd30dabc10c297da8ceb3',
    ],
  },
  grok: {
    'adversarial-verifier': [
      '2e5f74dcab6672f0c076b58e63f63d7c4ff5a8e0e0a2b73811eb7e3a4906b637',
      '51b7e2647c0ea5a97792bf2837facbc6bdcd661eb85d7ed7f761ab10d87f767f',
      '6098ea4230542a79e2b25d31e7f558031b3b4cd691b470e3e366608476128a30',
      '99de7157a1d76edee3c6bb5e45d9f1cd441797e29844a29ae11d9c8ab3fa2d04',
      'd8256ee2bb117e21a72e92d2b5db9ffbd489ab2faccb6886d58a9a3fc379ffca',
    ],
    'build-error-resolver': [
      '1f50ea54df2b587328edb04382d22a17bbb564dfbf87c3bbf8352562e18c5659',
      '307f4b58d5865360420895f53bbcc884ac0343f106ad5d42034d1f17cb7b0f07',
      'c9b31902d2aeb9487c9ccda4de81d5ee9d6dd7a58730bd0ec3958eb96cb2bf90',
      'e1081725aa04a676836226ae233c5eca06a79cbdccc71e632224f831e3999c3f',
    ],
    'code-architect': [
      '6186c05af29c6df6c283c2d73281d6042b67b78379d443ab74665d668728751b',
      '650af3d09ad427c5007858d1d884613b85e798a0fb8118ad349e40925704cfb9',
      '8e387576866f286bc959109735a5e207bc2f2313564eb1f793bf6a44898cc8af',
      '93c693aca2f38aa69e494094599efa9adf7466de12e461a7b1dd9a579ff188c8',
      'c1d2a627ea5a87a230c5315903d5873ac1bb2d41770c2f8a70801e678a3188f9',
    ],
    'code-explorer': [
      '08e63f85afd126c9a4b7c9ee3932bf9cc03297a4685def861c92c5ee5c3f5f14',
      '5df9dde3c02210893e9a0d8a627cb78bacd0bc60d1ce8bb23be93756fbf742f1',
      '626908a10d0f78ccb0b482b21dac44d0fbb2a277cc041730d54f17ef24402c5c',
      '7b79de8270b16f5f21f002b0aab0e850bbddac76751dcb5cc9ec8f9203616803',
      '9c01303e7c3096f6828229a219231b7830ca8764f8faa0b8e592486bb2b7aad2',
      '9f2904cbed9aed599a163fb058c3eeffafdbb6c368bc96b3d010a1ff50805f9f',
      'e35a189e6706d4c1127c5babc73363ab5f4513546d15b2201138f0aa04e758b7',
    ],
    'code-reviewer': [
      '5f4c3bb06dbcf43e619c62360a624a229f33fad608c97e489b3eeefa1a27af0e',
      '7118db33e43a7923d5bb62e4ac59dd424df6b500c835e38e88629d5af88d993e',
      '83a9eb273709a65c53c71f40c88572768cc168a548d0d9eadbdb7c73a2426b46',
      'a1dd9c6442cf8b64280e6c01d3ce47cd8d21b6e35eb6827db0cd139f39692e36',
      'b010a947bbf4bb1444a369bc45e7a6da7248f750efe8da88358bf0a53374c25d',
      'bd26fc70cc0350be110b3d5bc5a81afcb0abc79b1b83672e9601c55797fe4673',
      'c99fe16b90573cdf711259475b3eec7976fcf118b7037b6fb23ab8c21802baf8',
      'f344655eff85711a2cc3ddd1468cb3c18e42a576bc8406a4ef92fbb53004b6be',
      'fbd5cfd8e009c8ec186e20bf7d9a5338be46bc5d126b089c17459b9185d5e0a5',
    ],
    'doc-updater': [
      '0a915a382523c0ee7e8e570ff3081ae5938c910d20e37bd7005152c42058e573',
      '294a4332a6d2622a6a2a662ca1b5c5d39dd9fef04f8163c4e097ecd1ea438503',
      '390a66ef6e5438b6c8ae5ee5c6343227c378ba5cbe96984baf13f2f37a32d041',
      '730dc38f7a31ed831651fce7b4c6916a78e7fbacdf539a960356dab1fda08677',
      '807f863876e6ffa14c6709ae30070f8ccb31c300e733aafe7e5148b6bb28a080',
      '95ff18c8da10871f2041023cf1ce76718621c4ecd8fe8da2a67ade2602effcda',
      'b9de78d9996280c39931dfc1ce69be997bb79b62f060fe3655dd25729d97115d',
    ],
    'implementer': [
      '25273e689e894c5512649743d3fe7fd9b18591937aa83a6b97a08ffa4b4d53e3',
      '3ba1185ed00f0c7c4983d91bb90a03175dcf31aae007eacf9983697dbcd17af1',
      '43727e6b59d4f30c7575cdf282245da51801b8a48c5648ead45ce93f54a9f53f',
      '53f4631e23cf539e71af3be70bd931c1b1450b5c8ab70c82de59c0eaa49e3611',
      '8913786f71aa35066a31fba421779d63002e1a162c5d48aab0ef55df55a8cff3',
      'abcea691493b62a20b49fafdcd24a064f37e877204d663027e423aaa4f8b6c90',
      'c7e5bd5bf4954bb30250a70cf8591afa1af3b78168edb1a2d365601ceca834bd',
      'd8d420aab0c0f912c93c0359577f026dd8ec7a71a43c2db5b01bf33e632410fa',
      'f8e4f70878212f6264409c060c1b7a35305902378dba733838e6b8218d2a1a0d',
    ],
    'investigator': [
      '025b7759a892c4f054aebf473a3756b8198fbfd07757376e3098defe6cd2ce36',
      '19211cba609fcbd3d0a52ad7a85387e256ece1709be9294fa081696867c4f888',
      '335a1c957a878e4e1e699812a7a66d1c87620e00296850a0dddb8a2572b87388',
      '49da5d7d721a4e58798be6e53c5a1180b94ca65cf5ef2139c3b2b68fc4c7e99d',
      '88a1ff6af55ee05c4b17c47f4cb3f3bdff2cbb6e95226d068e9eefc6517e0fa2',
      '9ab9be79ffd5808c8387794864d39fd8ab458e2b63e58668f18c99f947d87bde',
      'b196098489893b2e83ea2111edcb4c81551be2dc0f0d938fb9e818230ea12a09',
    ],
    'knowledge-lookup': [
      '33e14add1ef27cbe662fc47e3f24aba8286a713262dac53c430f26a175277964',
      '37eef768d9182176c44954838a2b4577e1131a641039d4017e4324e8291e57f5',
      '818e3d0c41462d8a43cb3d6220310be5752630f29f74ec52d545266d29e4e0aa',
      '9c1ecb58c3704d8027389b02cf11bef42c11a31716ff24e67c078cad6d094aef',
      '9c765e771b4d3a5659fc6ab47901e8bc03603c947851be53a46d120d6279c463',
      'eac72a702d82cc3e111f7b1c7f83a8640c33e180bf4926d6cd2697d0c04070d0',
      'ee87c8dd46e51d90678e79cd448ffa7e444e4dae2e7378a8ad0f27ee6a212172',
    ],
    'metric-optimizer': [
      '2b6ab2fc35542307c7dee7d6fc42d780a37cb2f6ee537b850b7e0c223cbcb688',
      '761f0977339aa3cb7dc451dc75b4548171ad18b6ed8b0a6af5d8c7301933bcaa',
      'a9ecdbe8a6140196d27e2853bd0636013d61a2306c9ee7de7eec4b26d11b83a6',
      'ad2852f7a1c29adadd14c40f1de07063e9b55d2f41f8973564ab9011641c4b37',
      'c752f7391f4122c2d7a6d62143254395bc44a4373f02febc8e26991ff51e4893',
      'd7d15faa97a5ea1c2823c4434a50c0e23a69af1157ba7500569a8ff9ad4f1e00',
    ],
    'planner': [
      '12d39a03e0ec4ad5ff50dec7868b73b3d8f4d23351161f64a61a90bac83bc987',
      '5b1a1ff83307ccdd046b8a9eb1c56755aad0b41cc2817b385c991fe9b84a46fb',
      '9a4fcef0e659f208f6cedf746662c4f509618f8e954852a23d0ee71490d7ff28',
      'a78f7422bb5624c28739ad7656f7ca948468131bc3ada349013686f6d9bdde98',
      'd6bb3b86561e0bee3cf11e26e9893ed54a78b59f317fc3142eec8fb3c7923023',
    ],
    'security-reviewer': [
      '611a58f530aa1609b3789195a795e889799e13a7df91c3003887c0df87fe52d2',
      '73e3d4deca55839a0c76dfcaa440b42986fe2cda61c336f5e0efb8040c08f140',
      '75882ef4251fb9b655aaf8bfc1820b9e59cf6e56df3bf6b52f3e48f70dfd9830',
      '99e35ff007489ae66d67833571b53a0be9d19f2cb30ad8bf7bbb2512dc96ebaa',
      'be8123dc9a5809d38eb235b0e9afa6f0b0064a427fef45087dcb4f7f4b54503c',
      'fa53a64be48741dc18099d7485674b13c31188dcef1ac11f6ffbb0fad467845e',
    ],
    'synthesizer': [
      '4df58097ca16c9a846fe1098b6c4e0dc015d4e7f537e13f3121d32cc8b8efed2',
      '4edd4bdea3be84a341bc98a94991e7f25e0b1833e3062456eb88589f1c6e883a',
      'a7ad7082b1b7a511a41a4df7d86b015dfa4eb1ae32b76310e2e574b18e8af38a',
      'd20d5617f295e8139c63a95a6d4fb3a3081903f45b2d9912b24bc340af8ea0be',
    ],
    'tdd-guide': [
      '1fec8386da38e48a1499966a19ee4d677f034dc94d6ff3be0275d47ff4fff772',
      '20787af17543e3f9a3ae4563b8afd21655134ca4942a7f3968bac300e0069223',
      '23f2dce243961c069f07b574cdad94f7c0dbe0ec1accf305dc70445218ee8d05',
      '524693c1cf8ee661ae0aebe8a3038788163efd9a6c49f78c0ef31a5789332730',
      '7cf6d03aae87be4fbbf45934218043cec47b8ca2acb068fedc159df54df6d5ab',
      '82d5e173beed41265662b2ce2ff9a30c14af52c145e05109fddcf04c3b2f5ed3',
      'ebd9661df0e4def9f1373922de59a56e6a6cd9bb75ae03479c964d630edcd2fc',
      'ee31c55290b8dc52ebf9fe617d68b495521189d81e54002f7f4331568a83fa3a',
    ],
  },
  cursor: {
    'adversarial-verifier': [
      '256eaf484d1c7aed4bd3c12b616f0638c479a7955b426830ddb0b9af843a0ac7',
      '3a4418310b802555dc8d2133345f90b1ead8310dc93d74493eedf2eaf6acd10d',
      '54431f435e5e873cdc3318c207a8f51993f49540c709b8b6c6d8b5989290792f',
      'b661c6520ea522f0b1a1c5dc8946ffb4a678fb78959817eced33ca8df9280864',
      'de030068df15a7707ae2da030ffda4ad51f11ed6e4982ceccc2d0b22e8b3016a',
    ],
    'build-error-resolver': [
      '5cd0e49ed6918cd31e6ac7eea3db963eba6ecc5e6f9140a03dba4e2b2db70310',
      '732b64f0b832bb9b274abae3e2d7b1a4dc6d131d6f3bde6782517a40c0c5cd3b',
      '738edf49247e3068989647c20c5cb63e16e6a522bf920d3a7841102fe213258c',
      'faa2048bcbadf007a922ec62ea44897e85f02ae501078560ca994c44aedf37cb',
    ],
    'code-architect': [
      '4789700108833aaed72cb222702903893b6791b72f5f7e2515b1706d1924a706',
      'c0203f287639f8a9a144fd9eb22127a04df8d258a92b92a1089099487a2d822c',
      'c3fe69fdc6a44a694de38c63a7922f2d530d579b81fa6c4ccc67ee2694f7703a',
      'd9bcd32f7b2a2dcdfdc3642c7a588bb28f96842447c477132721bda671b64205',
      'e5ff1e87c6c11445f6433d9572ee41db3b7bca894f83c080b8b71493b9b666a4',
    ],
    'code-explorer': [
      '3304c52cd310203799d0d0a5e6fd931f47a1e6ca11263848b0308806aedab193',
      '4d874a69db4cd49b27c9655b4e40118bced6fe60c3010d50856df9350b478bd5',
      '62435beffd4d76d7809552afeaa78d781282bc357906ee0685f3a6cbafaacf0d',
      '6c23a200c0d1421272167a6d837d6e3571eb93201b7cbfeea8011b054e870fa4',
      '8cda12d588f8bb2d93510cc4120a63608a8a2527c29c4735e55c2f600d509f23',
      '9a84e2e1b3be3e92b0e945573b606629611e1bd547d1a1d29bae991f7ebfe4de',
      'e18e09cc67fecb2c70eb79ed23fbc46757a6a6f213cb842e1f8ea7186e487174',
    ],
    'code-reviewer': [
      '2ec3dbf3a282c724a921c3f45a01d0c2a1ea4d3ea34332aaedc65dad86cbcd14',
      '8119845468d8ed156a4d5e2a69aeb4ab116dfe832ae6e1825aead43847144184',
      'a0e42279f488edc1841d9af7a7747a48ef3c53c138da5864b2204dcc01289302',
      'a6e57f45d4a022cdb0b50f2b6584a4db0238f4d4b24a796bcbb40e83e6f492c8',
      'c4030a7aff64504ae1e43918f8a5f993bd49efd96ac162f28d239440d5e5cf19',
      'd081b27194e551b69c47d567b166bd46b2b50a8389d94227cd26db028a5ee4cf',
      'd29412d4743d80c0ce665837cebb26097e15f06e666608b2e4b94d948858ea10',
      'e0651baf0529a21d3c0476da31b095c201aa5270b4346be3f5b7b548b7daf648',
      'e0b01bba5cb1c36fb55b279017d9d7d422e74dc19e68ab087cde17ce157efe7b',
    ],
    'doc-updater': [
      '0a5147fe7612191df9abdd88dd5c616d41745049e8ff904f03b61540094ecd37',
      '2adc891fee85317f4d154c1de8c3ce7b21f00a78688e77a0c019dc7744067cb5',
      '6b3700e390ab83783a15c10fb03dcf79de5647daefe815edf2aa9ded130fb9a4',
      '70fd109080c85bd138342239fad1347ed14fd9c6bc947b2be076b053bd0dd8ec',
      '88dd06b8111b2583eb28084b05115b5b4114cf3d96d5915c0fd771a7beafee5e',
      '922f6fd6f5fb7af7101b6976ceca5d72fc0f9a040dd9e51e6aad358f20d18c4c',
      'c538f502c827b8f8c9b943149bb24fc473b05de7e91e1eb599dbbd2fa3c48d67',
    ],
    'implementer': [
      '140a8f57f5598b93fde2fc87470c50c3be990bc08f4b2ab70ebd80f7d1df7c64',
      '2375574b15bc4767ee528ce7531bd3d5b2bbed295409f8df66504332612bd31c',
      '263b2aa580436719b04829ac75f896fd62d9aaa0498685c3ead503e374cb692c',
      '36ae6cf5b78059097e9bf34e0d00d6f93b179bb58ee9b94282d7474f8b852ad9',
      '3ebad6162bd03ec5c81fa296768e54c26290599116fb4ecb0833b754f6b144ae',
      '424abe5c7eb142cda55ef4aeca64577264df17d5c07de38ddce9f4ce13bdd4e5',
      '4760f303782f2b376154f6b50eec213d9cb74de1ddb50510405000153a654db4',
      '60223c69ce28c5d0048c72b997c4f3101a2661411803636071716041e9bd8747',
      '75079ecb7cd3c0059d1ec6c67414fa0efa650ed709a530d24356668cdd66db3c',
    ],
    'investigator': [
      '208ae5d58db4f28bd0fe52c76204cb54f0d67964c0bef1711a68051fdf55003e',
      '270580981ee7a5754f64daeb04103136abe0cd023d9598d631c024ad050c6a26',
      '65b01cf1ae9e28512fbc5fe279130a3ca58a2474c97af95be7c9d140879b29ed',
      '71d6cde8d82f951c8d7dbff2b37d66c96d1be1f492d4b309e5116383c79f9d31',
      'a5d0d62c4c0802d8961cb181d2eb788fcaa03d37290312fa8c520122c02b5481',
      'e422c3872e7ccfe79c0c1abf719633d2c4656daeebe33a6ea97e47ccb8d72f76',
      'eb1a43868d0e7773410461df6481338603684e85715f3bdac6be31f19dc3261a',
    ],
    'knowledge-lookup': [
      '0919cc74ebb75e2044c794fd18096db39abcc85bacc29e97fb47a9a25e8a4cd9',
      '2af57644634c44287a28ba8b423136b23fc7e35f1a95c5baf27aca4ffaa7f790',
      '3c131a467db172f0189fcf8fb6a56aeccbae2f8d71ed194c5232d02c70a6c6ad',
      '64a66c3c9ed3f373c8341ec65f2a2f476d5bd6b046755bab119462f66f652a79',
      '7e3ff9685add7c9785a587e3876126ef4cb781755c6eb5414617d669fc5f3a69',
      'b4af580d4ae317a092cb4c562af7a754a9045504289b8d959f1c894dc3c7f691',
      'd11a2472e63add4a2ebd3bb99a4f4f55fc33d5bcfc9d8c883996d24f86203849',
    ],
    'metric-optimizer': [
      '01125e965dffd3f93caf4e114400d842ae95852b1bc666c663f085ca0218f72e',
      '0dc99b54575e0db03607abbd6627af4f274ede30475e11f7deb48f6b2df6b42f',
      '1038a875a85b34e95a3020ae7bd45f29303052c1ea6e42c11be717b3dda040a0',
      '1ff0fd72d5dcd19faff278a6416eb9afdf67d2ce6297e77a8c788ce9f2988ec3',
      '2b98dc3096f9eaba12a5f6d01020b1ab89ba3921bca9f9c2034d9ace7a6dafbc',
      '3113b1af387cf1a8a9c52b3a790a58a1a1912eadbd6f07952c552ec9d0c2eae7',
    ],
    'planner': [
      '62ef5194544b8dbec704685194c573989eb501d3e6d78dfcb50a930ac124df99',
      '7342330f42625e61dfcc053e90ff8d8d7979e6508102a75e01569db13f791dce',
      '90ebb973bb22f49051101414f334b145031c24cfe56363d182a1c76d0db600d1',
      'b433bc64244caf2a9639a5cada48bf3675af2905b039262e3c172af53c203b17',
      'e96a9f4306f399680208cfdad13c3dccb879c34f71bf3ff72ab51348d4a26bd7',
    ],
    'security-reviewer': [
      '190b18fef72c87cf6a372c36ab7c90a938dc7575b09b40d5a0bb521204735683',
      '20ff2b86d7647b4d2a9731d9e6d7a0e3e0c16f3bfcde43eff4b51edf5e4ded78',
      '3fe7ad309626211ba38c6c330f667bddaf1b9cd7ee487c96127fada14e0264f0',
      '4602efe5f788bdfde3727dbd182d474b25ac2ce35fdbd2d96f93d4cf5f5d7c9e',
      '6b89d43ef67a7928a30b3770989924a0772253b21b57502493f15ef9b2ccfecb',
      'ccd69c74032f484f4aac3e7cf64569b3ff7a47ec1b885b5ec6a8074da4b0b942',
    ],
    'synthesizer': [
      '28c1373b4d60ddef176cfc5ba1910e23b8291f29a3859d1d31f18c2007ed771d',
      '5b398222c0e2dac615afd014b6499035a1bb3d99b6286191fe41c95d392d9fe9',
      '6105a44544a2163493b98febb632a8249adfd54bdaace2b3dc1125b687d1f966',
      '69c85405e0012df08756003294a8e90893d5c9a0c0ab860a5ea448ad08cd685c',
    ],
    'tdd-guide': [
      '0826fbd8c5af8c4f9a4dbd0e34c928709393ecb172e87360b83511a18d57a309',
      '2262baa9a6c316cac3a40ca45fbf560c42a015c512b37ffc158ab72186b46b03',
      '3eb23597e88b53812bbdc8229f7f367c5da92300e3527efa729390d2bb9e13f6',
      '4af47c3471d045f69926a7a80fdb00c0e9fd5b7e1f916a7950ea0d6c328bc9b6',
      '50020d30ee49ae2dea809b80fa56535d21885c22698bb2934ae5de8521d62853',
      'ca7b2f3af66303c1f2060afa6d198a997c029f43ad2c05592bc9aca90f8989cd',
      'ce66aeb1e912e55a118e596cef7d2a4afd431023ef6d24c4150fb3b9ee705545',
      'f93b35ff1ca01f0b8631eb6f9ba0debc451f271692cd447bc924536c41d8492b',
    ],
  },
  zcode: {
    'adversarial-verifier': [
      '6cbc99cdce9250e8495d5cc4aa698d59d18e80aa8e2ee10f1d59b11026884794',
      'a308452b96913a4eb8660b48c26399270c82e4f732524d7c1ebc110e17b6b8d7',
      'd488c1c899c0e44aa610f7610781a4d6b241d4e839144c088c38a141fe0937cc',
    ],
    'build-error-resolver': [
      '070162d402f693ecfb76a98d4b62642a6e4106b910001285df12e65f359bd6cc',
      '3385e08e28f079552bd441e723115ba509e2e724b0573c3f369f9d252d57543c',
      '7e29550b56dfa629941cf58390d588678012320f0f474f86a5a02537202c7d04',
    ],
    'code-architect': [
      '91d3a452b0557490779128508db83de71cdb03ee9be1fc00a74b141816345d5f',
      'c00330bf6de5fe5198521791cba9765c12677705e45764448bc7ef05e942ee14',
      'c2b8608607274d05e7d2b819ca7510b827cf52ae82d0bef787e1b07693664c1e',
    ],
    'code-explorer': [
      'd7fdd52169b5ef4687ed6f4ba595982081dda3dbe0318e107fe7df6974dcb071',
      'e7cef27a6b1a285773701a6b32d6c3db32675fc2bb43d49f6df7045cef028e51',
      'faed4d648bd61cf97775ef6dc2729efab4f0f69205469c4c7d7b17cbd33f79c7',
    ],
    'code-reviewer': [
      '3a627697208a666d837b92eae4832bba138668c8946832429f29746d40eefa80',
      '69e59dfa080eda5c66c66468c4780c339b60af3f7960b612fe186170fbd4a1f3',
      '8ed55d37ae197ad961fd3e06491acee04cfed112071a704b751027aeb172a10c',
      'ab04c006f30c2129eafba49fbd4669a010b16b595ba67b283f6a00e6e27406d5',
    ],
    'doc-updater': [
      '047a601ad170cb4d171672a46ac7d8bc0034600f48b33460427cffefe0f07b2f',
      '4d596e41ef329b22b135038a01260309a05792485dfd5d80c3564dbd697f14bc',
      'cedaac77320a386d992e75b0e813c1214a5a8243ff840df6a513ee38dd8b0339',
    ],
    'implementer': [
      '0d0d8daf0d0c0ec82ca1cbc715772c6a520abd6d40e07d2718e1e28847aa5111',
      '1780e0bf5f328d4268dd0d5f183b277059fa27144da4c4e584daa9600b8c66e4',
      '384c9854b0ce846abce68135b81ddb0bf092810a6daac897965606a5aec2b714',
      '89569d377b62ef42b30769c56962aeb2e1095627715685a1afdede9ffcdb03e8',
      '91a3010eba8be490f79a2f52d6de2b8dacb9dde648fdfcf3a0a7f54af25b3548',
    ],
    'investigator': [
      '0b0ed0745c7b47db772408bbf4fb43bcf0be97be1ed6669afd81d26deea86d44',
      '7ee2295bb46a086c7e1359a1e332ef43ac78bbc0e407331642579834d21724b8',
      'f8cc48b4da920faf9e254c35592ff60226b4dd04528904902bc15b7005496bae',
    ],
    'knowledge-lookup': [
      '1c8505a4e006ef3cd80b1c56ed13ff5ffc46c7c9c1614478ec0a43f65b2fd1e4',
      '4e4075c1b692abaeb3dc928a6457badf44101a4198d572d13217250a321c697b',
      '65f240236e2b30fa2fd9d34568dec3d3ce2714ef06512a48f16ce2723ca8b5c2',
    ],
    'metric-optimizer': [
      '0ff2541b79f95dec41380421df75aecdc8d8d92fc234701c4e3dbd61172580bd',
      '351d0befc9991bd223f1d52c378d7fd9cd10d87d3dc105e402339d27b611e6c5',
      '3ede6da630fce9c53b81acae94484905437b39d540dbe7b751128862c481973c',
      '44f40946d07c65118ff677764051e2d33700421a1f38dfe11e9be273bd334e9e',
      'bac98dc916ab1c9ae3081548a17c244c569bada581ad7e43788eb432dcca6b48',
    ],
    'planner': [
      '83aec5c38fe678435467b7c517f4f0d6d714e675d916bd004193c0762688fe77',
      '9a65ce427a5a0ec60d03f3c8051be3c0b0fbfddd15834fb242c40e8d3acb50fa',
      'b60d8f6f95d717742d7d7b8d417e2a8bbf6041ff01a855bf60fc2d8f777d7ac4',
    ],
    'security-reviewer': [
      '290f9bf5fa93e226240f44e0497bedbf8b8f4c8dbc439e61dde35b42dfd6c1be',
      '66415f5e79ba85cb147f9826d9c22d34ca46df78fdae1756c07b4d8a845abe02',
      '7668a1b9e0929536d2f4cf418f1aff61ea5e5126174a0150c4ef88944d2810ec',
      'b8ac51c66d33eacb104b04ddb978f571a2ecdeecf77d328b46d97cb78ffe98d4',
    ],
    'synthesizer': [
      '12edac58d06db988d3716f01098e7a2c3a47a22e8c408ad56e57df2385bbb861',
      '4fed65737c8f30bfd2b47f8d1273778cb2032d660806cd79a76b924a09172dc7',
      'ba6850d2272552dfc23a221eec057dc6e94435376ab01361389f08a6e634d077',
    ],
    'tdd-guide': [
      '48fc2ffb5588a079b59b3693e14194618e7227757e8901c9c2803f7f44f411e5',
      'a8ee1efee3f93a0b59e9c4dc8b167f58b59f0549a7f3e4b5a8e9af7f9ec31b02',
      'cf863191f42fec278f1cc78c402c986c1bda1ccc2a5c1d89a6804f477bee2e6f',
      'f87d0d906077ba5037f3458ce7f9d088f01a61ef1bbd02fe05b34970fb7b21da',
    ],
  },
  devin: {
    'adversarial-verifier': [
      'ca04e15114657c5feefe5fcec7174dc19e8bca1caaa2139fb3ac2a4400c14c3b',
    ],
    'build-error-resolver': [
      '42e8ac8ac3871df7ed2c290d386b1435afdf85ade6bc7dd00b4b9c458d78cd77',
    ],
    'code-architect': [
      '28c28578d0c69a400539423093bff3152d079f15d98439910d33b29d917409ce',
    ],
    'code-explorer': [
      '554a9bb4888b506e7ad2bb54961d9b84b3d0fbbc356fec06073545a4248f08d8',
    ],
    'code-reviewer': [
      '0af9c24fd7a0daa9ad4c705e390c3290ed894fc76a12b600c2b84ac298e317b1',
    ],
    'doc-updater': [
      'b698e57d747704f8c070989f0d21830ec140cf91afee76b5bc9bf8ac495f43c6',
    ],
    'implementer': [
      'b40eedf145bfd551fa4b684e4fb0b53c4240190507f9513d75dabf96ab20d800',
    ],
    'investigator': [
      'a00164febf551228d660361f0b11a47ad3fdee0390a0b7ea44b1194f9f251cbe',
    ],
    'knowledge-lookup': [
      '21db04850349dd8d149ec3e55391679477936fce7b8a96c4c3bac49f7ceb51ce',
      '2e9541d20fac7c7c657898b7d2c4edee852caa30e944b5ee9aba28db0c8b974d',
    ],
    'metric-optimizer': [
      '8df9733db3dddb5ec16da7a11c5b489566f84bd632130adad3a880d54efd6622',
    ],
    'planner': [
      '5dc989adec73befcba11453258016f26c9855d3bf6b943896b29bb9d7c53b4d3',
    ],
    'security-reviewer': [
      'd18a2d2b3242b1ac1b62e6535817f094596091095c83578d146aef5c5d4fb567',
    ],
    'synthesizer': [
      '0202b82388ab1554f5b2503525fb69b8b4319512b4dfef11c02cc98357647ff5',
    ],
    'tdd-guide': [
      '53c1eba63fa055d34367df5b9dabea632b601dc8c243a13fd5acb80ba0f976d3',
    ],
  },
  kimi: {
    'adversarial-verifier': [
      '2d33b0b7dcc04a3cbb66f9005f9590c83cbc1923dbd8352edea26069b1cb42c6',
      'e46b61ed6cbd5c2c4ef096ff5baed906fa0bbc2b2aa42e464d83b000b425a0d9',
    ],
    'build-error-resolver': [
      '3338495785d65c59e532bf549b1d58709ec42fcd63a545a6cc264a534f517e15',
      '4cc4b205fc9b27f6b07120cc90d108d0e56cb75e8ac2f206dcd8d53d6bba34b9',
    ],
    'code-architect': [
      'ba604bd81a501e1c75cbae8d02bd82481504ce1d16cb10dfbab5992f7aa44a05',
      'bedbb5b778311623b7dc804aae3b129cb2aaa4c1a06bd41e6651238a85868698',
    ],
    'code-explorer': [
      '6674e091b3a51cbd78a285768a132b79f8642bad755d90c51043beeac4bc366f',
      'a4965866a81f07f1fc8f16fa32ab4ff7b1faa5be37ef3453a51ba9d199917e83',
    ],
    'code-reviewer': [
      '2b467cc0279cf7e7b8b141d72dff9a5ebb24a7c3a61d9bc31e5ecf659fd14760',
      'dbcb4e292466fd7ce0458654e1371aa4fde40eb4843d73f5ca968abcf05dd447',
    ],
    'doc-updater': [
      'bb167301dcb7a1efbbf0a607c285c39f7192601369063df4cf9430299a0cce2d',
      'bfb4380b0ce11a4869eed499690a5f1c25808c06d002f390580c9a49dc4deb6c',
    ],
    'implementer': [
      '1774a8ed425f3c74a4bbfb97f5bd87c2c7475af5f87d92d3a0bf9a39cc62da7f',
      '7dbf587ee1f5ae63044b7261a3e91bedddadc846b424e90f944746cf68cbef8d',
      '9f54a7a13b0d0ac63e0580c968313bd5b48164664b6e1a3421dc9c8bb512d637',
    ],
    'investigator': [
      '143348928b765d9c79cbdb9479cc139d12b0fb35aeadecf463a8a69ede5b92c3',
      'f376d5e16d6552937a1d10dda614927aa4fb99718116a5587adb90388fbac3d0',
    ],
    'knowledge-lookup': [
      '899fbb2e7921d16c4e424751ebfa35528ce564bf95f56d192f310a3d4ad8d449',
      'd7928ba8feae1e92b86e4fa8e26312264fb1b74966ce7c97d6da0199cce51ea8',
    ],
    'metric-optimizer': [
      '2a4c973103453920a17c709f72e319ee617e9b5c5dd86687c2fa9e9cd98361ce',
      '3189c6494d0dc75e8626c4b3097c53f37e4be240513df613b3fc948fc41c0f64',
      '98e1de52b0bf631668a05c6c063ad4c44bf41ec65d2ae5e1d197bab0b1187a4a',
      'abe879135b3f2e53db5dfd3bed51f0a2b2e23e5d4d38628e13efc474ef658f6c',
    ],
    'planner': [
      '0827c84511e6c6a8001de092b42cf92114af6010d7459a0f5473c90057cca023',
      'e74d450c7a465dc2a204ba0119eee737ce02149c86d8c1f8e93a4e800252cca5',
    ],
    'security-reviewer': [
      '781d2c276b2d2492d1b6d9defc613c72d94eab32f3fe2bf01d905f447497730a',
      '957c2bf16829e008eb5ccda4571bf558fccc999c972f463d27bdedc47bfba294',
    ],
    'synthesizer': [
      '0d0e30ba20ecc62b13f8311cb7b3295601cbcc049a65ff278133483a50124160',
      'ae2d40339eaa03b3a161eeacaa0aae10966463bda235aee096bb5193b48769a1',
    ],
    'tdd-guide': [
      '82fb40d9b0a501c82590df1eea6f46847eff9c485ae5176e20c7fe902e855b5e',
      'bbc7063c9b4d8149687cf16dcd5157c1a290a1437792d267ec7e85e1e1a9f1ca',
    ],
  },
  opencode: {
    'adversarial-verifier': [
      '33c3c5823878b355ece5cffefa5c0393afbe2b67b0a0cb4c4fdc0f766d9704ec',
      '678c61410abb1e77471fe86e5f81a92307542d2089d36f37195d1b9b3879f7a0',
      '70e422c6cb7a430f09ab8b27bcf0a796372760809c3ce5715fef77666ba4a126',
      '72330ecab03378e80a3ab647848754a97efebf91c69e75ffa5d7664b10ae6cd0',
      '75025015349f643af2c0e7ec3613a9ccf7c5eb0d4707ee10e4569607a0806579',
      '9129b0e9ec6a5bfa9933226ec67800c8279b166b21744ff3ee949a407debd655',
      '9eda4d66fd736c5412684a55212df7a64913ee7945aff6b64172f4e090f283ce',
      'd581d61cd2f31a991eabd2c72d424622ab15040dd3793d563d095bb958bc4caf',
      'dc201ce579a1ea57af2b15533994932d53019f9fd98f92109bdbe5b5045ba5a5',
    ],
    'build-error-resolver': [
      '05717445ffb0887c13838a2545a700c5541d9304e2a7c85c0488e84b8a1692ad',
      '1a5d9187851e501caf1a45ab9634a913db629ce01300beeb39441d6cb655c154',
      '2d0155deb794c6628ff8af18a620319fc5c469d1080dc56d78ad7545b05a8f1e',
      'c2dad4d0c48d1cd1f067e28190d0b706edce3d6ab1bd37274efe979140d246cd',
      'e71f198c0fbbc29caebcfec3908221d2e71b1698bcf9b504e02802193ea01115',
      'f695e70e949b25340513f517757dc5b20c1d8f6e2ff0cbce65a2b73025d77e32',
    ],
    'code-architect': [
      '18b094cb6f4df7f7fdaac85552745ff0c513d935518a62c85d6ad70b534e2184',
      '338ce7eaa700bab6150d47f7f9e3fcb17bdfd4a0b25da375f8820f168bf737a2',
      '406438de657838dacd23a57e8a42893d7a64693c158e9a6e01c682e85e095782',
      '43569aa5abab965ee67dfaf761b8f0d1bcc45d0feb72392fbae7217af2fed3fa',
      '49215df1efed07afceaf37dec34cd9893a2ba6a69c25152e79d32e8c5b3183d7',
      '73791491012a5f3d13b0fc13effedbc16db5e2a2fae33a25d6b5517814573d6d',
      'be5b99824af3464841e49b210d0d53155e0b1de02dddbcfeb7ab036d726d7884',
    ],
    'code-explorer': [
      '4020d8977441fec1f6937d9a2253e76ed8b6a0a4a11acd1df9006b02f82f3d13',
      '433fd5f610bb497314f7b7f082f04f3e4b6dfc008cd18a0f1a6ef68d987e8454',
      '74fdc4c480c54823abf914a6a87eb75741a665554a49d113056c9918795ad0e4',
      '8a66e461ea717106b9c0748bf158c0fb7b868525fa81c2bf52f580b4c09b59b5',
      'a255cd0ecb2f0a8b85adaedb4cf403fd57ec9e18159420af47e4d6f1bd75f211',
      'a29821bb83d7a38ec836f07ef79616af41bc41e3cb6c050f7ee0494a8b84f026',
      'fd7c6db3aeba51c57d1fe2ccaca36b34772ab1d36a5edd16b4f4c49ef294f963',
    ],
    'code-reviewer': [
      '03d2c50bca151758bb3ca4f0eb3fe4873535eccdad6195d3765f3cecb8713332',
      '04ea709425d2230d2eebdc403dce46d54d3e5b7065c1aa442ee6111e1305362c',
      '050617c19679d32fb4f31a5d94c1d9946c5637136c8b34fb03e8d00da8256db3',
      '0ed695bf89808eb48d76b42096a9e8c3afe02bad1e791a992b7c512843ca4766',
      '3073c294de3abc05673cb927b88779a95068a20f246764c99e26bdd1f0f0db83',
      '480876da137a55b2bb2f7dc028106056b90f08eb2b05139edbe0fa8b838d77a5',
      '807b0df8b40484eeb534a8d9e6a8b24cc949fdc2895be7a067ea6625bd09798f',
      'b972fea523e31a282a568be184f6f7260426251223054f1e204216a1fa427710',
      'ba7f47de9ede3618c38a464f75caa28ba103746aa3c86d98a562d439cf2b668d',
      'bc80afcf1e81ce110d516c6b8bc2423bd6baef7999a930131729a4143c634500',
    ],
    'contractor': [
      '1b55a56b303f3f81425ee4142aa4486b307a53895890ba2d73c0878df82a6a04',
      '285fee13dcceae96f62f87428230421a441531291f12e88d8c0013ebb9e08130',
      '3dde6cc4c6df3cbcc1eb4af79110fb320c5a54a46d2902de2344bfcfca41ec55',
      '90e44c6824f0f73c6863bd7df4ec836da2a99cec43a7e34cb4c50e68f8d0830d',
      'bac588496f1854d9745e76e87d9ac15d1a02fa2a09f684e3fc10146e575df013',
    ],
    'doc-updater': [
      '2fec34dc7ad094e232502db28405a7e7fcf81fd110b10fbb5f6780809f65a5e6',
      '668022611ae59987323c9faece1b3b082f8757bb93b56b83885c6ea37e81f7c7',
      'ae3c05e597d66250b290495f4da4e3dcfab9350a2f2cc82c5454676d191411e7',
      'ae7c88d910191ce123ce36ff19ab83f8d9443df034256d64b751a7a13743407b',
      'cb9a7aa40567d95825b0a416b017b6974badad097d72b2d47accf2f9db787a3a',
      'f3cd2ee7b501ea80406d1bad310c1999ddded6dc90f8b3310aa002004bc695c7',
    ],
    'implementer': [
      '087206b4710e588238f894df3996a39e0857dd4ba6ea4884cca571fd910de7ca',
      '15c036b4678e5f3c210cf93ef2344560b0639421236d4fe29d52bac0b5c9b458',
      '23bbee53cd29256eb79f06591472903629b22e2f5dc57b1012530f98fe7ccf51',
      '30adda5018860e1f69cab016449841421c01a9e25de61f0811e99b5552b74df0',
      '34b5f94b8779e228e0139a4b0a6bc94b952da28a66d400ac62b0d53f8e3c1deb',
      '36f19f80c64e24473447755b5dfff8f12a09ee021add6cb6212593fccbd99676',
      '3c5f01028797c0bd1b78fcaa75ab7fe4a67dab2eb932f25625db66a52472eaa6',
      '973bf4ab2073af589234d11df7dd9ffb42e1f4c0fac02c0c56ea232c9288f64d',
      'cfbc5c4c3864e64636bd90822ab9138a34dc1d0333314cbb346399cbeb2c34dd',
      'f4638de98d68dbec5b9e71540c5c90fae6802661ca49bd4891f87f1ddbde9a30',
    ],
    'investigator': [
      '11c576f2d502af6502bfc4977b1cb59b376d313690eb8b6035fe811d329c512a',
      '28ad6fdbf5e4dbd24b6407d615905c48d735b3e37dc16cb69ed28cba250148ce',
      '3866c2a5d051d4004897cb87f22c00e35f574f508a91cfaf2017a3c929a71919',
      'a6960624723af4ce43e423fdb33095d84a6da00fa9057258999c56c43007156b',
    ],
    'issue-scout': [
      'cbc8d6383fa5bd3059087aaa121bc30d119cd3c04cede5baf6ba1c8983fb9575',
    ],
    'knowledge-lookup': [
      '02888e551625d5e591d032abc85665d5785f65dedcb644f7e6db40d5a1b69f2b',
      '430287d61d8d9726c59bd7b8e82a53de9a1ca61c9bce9be0a9b47754f28934b3',
      '43bce28f23c418e6ae9a49282cbd3db6a906eda617d956eb921ed5993a6aeff6',
      '704c62778f3ba6b2fdc4f7c686a36825390117081464c4562cf107f63c2bfffd',
      'dab1b3219b3beec4a55e2e0d1020ae783c1eceb9ac8ef29dfa9c90e6bcdd1ea5',
      'e17be5a6dd423422fa5a99aa12cc8a3e117a01d4fb2321bd904ab1fbb31df88e',
      'fa7465c0e040d2fb6098fce60d3444f5ae39b83d6d1978a7ee7b3aeed828e4e8',
    ],
    'metric-optimizer': [
      '33caaf434096ae559589f969b41432a45686d4b26593a5e01d3ef94fc4991225',
      '3dc0b27111eac820a54ac1901fd3c9493b75f49c97b6c18c0b50f3f37504e804',
      '809b4a99d5dab6ab475d8baa68c1e59d447f6fa4aea8beb3a7c0640cf74641a5',
      'a969bbf4560e518bbdcc397c8d1c8b22ecd699a7c85a791ebeb8dc2d0505e295',
      'd9dd310a662aff4c87efb65af36eaddd231de90f8c4470aeae675c023a6fffd1',
      'dde2c6683ebd7bdf3df4d08ea6f9edb3ff3dccbcd710a118a1e04dc445157a90',
      'eab76dc5217ab95e36b10facbdcfd5d902a610d2230de908f2c1b3446322d79b',
    ],
    'planner': [
      '015d9cb873334f22b9fa8442fab6369f1fffa0e931a52c8a4c1e692da1a67a0e',
      '29293d506e78d28b6f0518a49ca4441f3e0cc319ac830648bd7f3bcfff699b3a',
      '3072f6ec62959ba5e85423eb0061779437b0372ec1616a5c1525f15b8c21ff39',
      '5a3b054c1b3ca76bff0515aff2f1da3c903a678bd7d6eb14dfde955ca1696cae',
      '5e36e641edb10f12251509882a5fccd48a9b43c4ec5f6c9c2988fe60acd67c8d',
      'cf7cd3a849b177978323cd0a2d52e8d8998941f8751d97396114674263774e99',
      'e8dd553364916affba0017c3a8e7b467dbb208d2e287e5711facd530515eafac',
      'ed833de13cd3e6a002f7b19964ee12b9b9c1ea20a41cc26e545cec0cebc1d94d',
    ],
    'security-reviewer': [
      '03a70cbccbcbfe697d9321d1b47a15bcb406bf1f5cb19bc50d9df7aea257518f',
      '3d91235625ab37d35c5f90b3f25d962ead98508fe8c741262a0ed2581eb4d9b9',
      '50ab776540746f6496c2b5fa6005a4e1754a726e5c025078f0bea55b0bfae415',
      '573f8c0a5f882aaed4e1e7309298a703e0dca8c1febe0eec9847be0a12d1f7a5',
      '75482d283db12d4c02b362cb1a3f41bca1a25f2f3658a511bed347c69c83815e',
      '96c3d68e2883438608e27e86cef912e657bd7c56d1e94fee302b6d9e18970107',
      'a451343d6336d4f83adfaa7fd81512b18b141738ca0810dcb067a48ad8504872',
      'a9e37696a26abca6084aa799296f60840431d05ee00815ca47b52cc4210a76a6',
      'aa49beec1c4727eb641bb2b46e55766110f2ddf00334a409a07892ee9fa31024',
      'd36d8db6ae0806dd7d5a60096bb6dd23e02ed26d8e44f746dad65e925c5a27bd',
    ],
    'synthesizer': [
      '248ce2b67e3fa958e5c4689610da34c96e956da717613b9958d7b1c88c9a31a6',
      '4b41397ab93fb0cc8e35614772e80af6d32979b7a40c4ab598f32b2cf27ae192',
      '67af88f378ecbb3226878dd2804999e9fecb98a9b0388d5800f02bb57a092389',
      '9b428c53096df368997a33bb9258b486ebb637036ffdcac5a1f022456c944eea',
      'ce1bab48d6427ead0f74dcb71d4efeefe80c83a0f1fe1214b7878b38b58df6aa',
      'f996c4f507c1ac7b815b5656ac8c3deda3f8de47dcc688657f2369f9d54443fe',
      'fd63c6a0fc878c0762b83d3de6d95bced4b106cee9ed834c496fb750c47ed671',
    ],
    'tdd-guide': [
      '3870ffa36b30fcb1e0438fa27b695b951123b2bab158a4da63403c72140b90d5',
      '476073e7bc17e4184977389b3af86bf4bdd679143fde5f115ea79a13ea8ebd3a',
      '5ff47fa68cb3b9cb9c5acfcce2067cd068cc4c5cbb913343a433a66bb299197a',
      '6c02424bb022220df206b71c176de91634808a7257fbbd5a54bca2fe02690813',
      '86f3f973ed1343e016f812b004973e3ed050fa1d102f586a0c1cb03b4027e366',
      '8aaf31d0e3ac84629028d18a7f1ff7bbce8e6a190bac7a6f9606684ec6476c1f',
      '9153f48a2c8e5ce9ea274bea2360c2b906f145ee14c8a2b21576cd8d39b8db05',
      'b3790b2b5cafc08f8830129204c66ea369994e441ebc34e2a88617e96538f606',
    ],
    'workflow-planner': [
      '1898cc7a93d7cd9fc236887735a91b6db5957ca23c3ea63094c6a6f1d32e46a4',
      '1e6c24f74861166b8622c7f3fc5666d5b1d8fe43d37815b0996296f104df0772',
      '245cd112b2c9c127dbd3cc2db5c6627d2de42d7db5359a6496e5b28c84d91c04',
      '3107f04aafcc5e0582e519a4f2fcbd81ebb59b3eca4a059c4ecbd02bd30737ba',
      '323f8b5a58a9cf2d2467c3bf09a83b49f112f5bb789a2b48f48fcf73947fa683',
      '46c9ea4996600d4f1e3fc4dd594bc46aa8bdf2fb3699e403b7d6bed11f397e83',
      '714c9f0516f3c922493393222ef5260e2921b0341993ad81cc21b6792f824b57',
      '8d5b505afe87bf2123ef821c7cd1368fd2ea735fce3e0e5de5af85334f582409',
      '91364ca8511357c688bb3f8d1c263c4e9966c3451d952a11b782fd94d727cf5a',
      '94f577717b4d8c3ab660ed7a44736565890872c69490001d0da8c39b528756a7',
      'a2883a99f44a45b53f67166f70210ab8ce84f9373a26e3f6ef85fdd8ffeddac8',
      'a34a921552016626e0bbfa90896f08428c941a56f7691589a93966e781347048',
      'acce1d4f7fbee629f5b3a4b49f297de159deb1f2504e968fd7f107ad0abf3782',
      'ae6f1e6250c3eb9ef13e85091500eb3c4c00f091a406ddfe1da83a0089ba095b',
      'd2467d815806f81dde211ab9b5edd55e1b15616d1c8d5c287fdedadb884dc466',
      'de691c1af65c24f1137cb7348a079ad1b4904039f384be0b965ef920eae78254',
      'e87e671299b189a0b06c587a3065c0eab7f97678a63bad0742564778e6bcb5b0',
      'fa4aa81ace9721adae4f0917bb369be8c6c44f9fdc611e191a7326d8756f36b4',
      'fcfc339d2248e3d08f7e5c8fd13665da4d187de33827a88699500d2b33fbead7',
    ],
  },
};

// Released Kimi role-Skill renders (skills/kaola-role-<role>/SKILL.md, v6.24.0 through v9.17.2 and
// every commit between): the same frozen proof for the role Skills Kimi shipped before native agents.
const SKILL_CATALOG = {
  kimi: {
    'kaola-role-adversarial-verifier': [
      '0a4b2e4cf0ddf1670e71ea93d2ddabe014c64b6d8a98d7dbe7361b0c4742fa5c',
      '275c81bdccf9a3783a094a70bae4d714496216df6be1a0da8758cafbf3a00a51',
      '8d04d3a23448d7420b83c6a72215ac035caa270a7434de6e369ce04a395efab2',
      '9b1b9dcce28970fb9901d3521dc165f2a07b706c34258f19581ba96a53c2178e',
      'd120d2efc7599c6e081882c6f87eec27e01f853a8c9a7a7634601af809ca36aa',
      'efe275e314ad184645471120eb4a570283e739e73b0f1561a2cbe4afa5ed2e2a',
    ],
    'kaola-role-build-error-resolver': [
      '50b1ea6104d64aeab681f6119129051f28e7a23898121222a18310c8b70d2cdb',
      '578251145806de9133033d2004f0db408db0b8a4287ac79aef8d50245b490045',
      '841375bd794a3f05e2ee55504f14b24cd9e12f15ded3cb8bed38f05e491e6170',
    ],
    'kaola-role-code-architect': [
      '38349f83ffba79a1fea1f6bd2998e319fb21673f70ae1ee5e97c627eeede8750',
      '403907d15c33e20790afa3939130c10d66cdbe9c81a08c262a27949792321099',
      '9d9d8d98c7d9cacbc702242c6d4a1a722b63c1547b1a8a53acfcedf289edc8bc',
      'abc4f86c78366cd623eb483a0b0c470ac78138c18bf4c400afb40ddf62c95a99',
    ],
    'kaola-role-code-explorer': [
      '99b6c7f9e11cbaecf420b3f2cc695e7849e21b86b0c8d6ea0cf90c514a16e91c',
      'bb6310e29f0a2a000cca0ee08799a9024a6f9f612d13afe09a888826337c5f65',
      'df6af7f29a6d7d63a5e464f6697dc4783fa9bdea2ebff7e30bc920c8eb89203b',
      'f0b1e8f1aa1b24303a5318bae49e05a74bac608c2b4cf2181fce43091957549e',
    ],
    'kaola-role-code-reviewer': [
      '236374617fb84c1b977fe2f96845c45d267965e284625ef5b6f5ba2de87aff3c',
      '3c2c8e8794cf891e4877beff3aeee0c772d7740b0e57360e94c937a77eaab578',
      '4ff3dc8e13991e808a06a688478810b6a6ea3e5cf57708cb8cebd6968f35b8ec',
      '9e90cdf24e54270441071f4ae3d41be2dd6dc8022306d794573dc2aaa91b6c9c',
      'b3edda8c7304a615f3ea58ecbf5805da5e60364f8296a041b78eef944d971610',
      'c07ac478b59b484fb1a6dfc628b69af901f80414f9ea6118e78a98a5d30e61b0',
      'd4bdcb48e71f7fa75ae264b92c45dda7afcbe306384280ed8335fa7d38db1630',
    ],
    'kaola-role-contractor': [
      '4b662905b98707cf88c44a3bdaba5f7b3be862bd20cf8583b66815052cbe7f9c',
      '6818162a8a0a9b4895f6785ced73c7d266d57336d720a0de6473c076c6f0087f',
      'a4254aeacd238b08712fd1e64b54fcd5da5c4be333bae9bb36d7799e7d578d7a',
    ],
    'kaola-role-doc-updater': [
      '3d4f6903890bade72bf48797241e4cb04fa39688c0aa4e36abae9275aff63fee',
      'd05605802c1c34cdaa4b7d1d3705caa14746bd8c7fc0144f49662212cd337232',
      'eef163cb560b5c31eb4463c9daf3e75d921a2da0f8fed19395926ace1efeb9da',
    ],
    'kaola-role-implementer': [
      '0e7e5fe9f2a9beabc4acef23322b5bc239f589f605c885042ef8422b0b6b995b',
      '1f1fa576c4b35eba17568107517857ef26eb09acc41600ae2a9a3d01e1a99945',
      '3c770d24ce2c5945b6f58e42672ee26e3da65420b1335027b26944adb4d383bc',
      '8a05207243fac57a06ca2125c5a09c9a659f503dc68556403ea649f50a54dd66',
      '907f3513f539be01cd2ffeb424e81fefdfd704073afec35ac17e93e68f851b5f',
      'e10d6e3d264319887a2b5af1a03a819f1aba6214ffe5aa72ecf43eaac1bdd57f',
    ],
    'kaola-role-investigator': [
      '4c6a4c26967936934447ed8d3f991ee13927bd1edb75e2103fd5bc19fc578596',
      '7ef3b6802aa5a73b1038bb52692dd49aebcba1dc34cff07979fa0eb80f73c0bb',
    ],
    'kaola-role-knowledge-lookup': [
      '3a15c6a5a0bcdfda9ce7c954b647fa3eaf5a1c2f780f818d6b2970588e77839a',
      '511066af3cc160d02999e8ea17e1edac5779493804ead7eb84febcbc9f29d27d',
      '6f1eb009b971531286ed9d7cb5639db2b1d65759d9c25acbe4f8bb3327616901',
      '88717e623db89fefc3d30e8aa9dc4f8bbb9af38b09e59dc919db662d317e9854',
    ],
    'kaola-role-metric-optimizer': [
      '7292cd436c1fd06e90dd99bd98f47218c6f72c735e0b59e10fce32c6fa143d1f',
      'a28f2154e702b0fa99f8c377c7b87cccc873486308e36b310396efcc73ba5dae',
      'dad99b056d81ff5c5230f2c225fc0a5da5e77283a3a2b2cd3cb6d3774b31227f',
    ],
    'kaola-role-planner': [
      '1cdf9d5398d507e52ac56054144148597dd207de48202fce9542070d9b73d45d',
      '455d64edaf4e73ec4d6ed383ad6c96eec4f116f21e310ebb27e302de8084b6be',
      '8c7ffed6fb9cd592b86e7f13dfc8d03edc9290f65150354bde591f9dedeab1ec',
      'ce6db4ef2d85aca2f3372f4a51738ee1241cc5df0347cfd74b47b9c705a22f14',
      'eb2c55a0db878ae661ed2d8ac0120819b33465df6fdd6a03691fa3e8e7d3ed68',
    ],
    'kaola-role-security-reviewer': [
      '4970d5812625aa923fce0a96f24ffa63df4ea58eb4e98d6c8ff093b9d52a58f6',
      '6aba5cf36ed53bcf9df40addd61be9364e63f2d13c274a8e2baf59b7366f757c',
      '7c5f48cec68909f475de601867796acf92b5c65a514b50bde1683712d257172d',
      '8782f883c8a6c8be97f60d0ee73ff030a53e49ee2c991d4e97add7322223f0c5',
      '91958eff05ea8a24bcf23f12fd3d1cdbfb94b41340438c4d5fb7798af8657b18',
      '9be29351e306a5179305322b7a5300f8d9f8176f510de321de258d43c2dedeb2',
      'dbea3eae55f2bc7eacf48ef6a60475af3ea5f216f8dce281395124e8608d4b0d',
    ],
    'kaola-role-synthesizer': [
      '3e315c1f24bbf22112f82e057bfefcedc843aa0d3acbeaa787a386ab10f5c98d',
      '4df9e0320518578a038dbfb5e9ed915551ae044eff70226d59f4e2d577e75596',
      '96e4a118a13b7a62fd3ccede4c99bca403b16eee757eae100de7f18163bf982d',
      'c444176cfa40f9c3841a246efa4101c3f4224f237ba3320b842796ac9a5121f2',
    ],
    'kaola-role-tdd-guide': [
      '20a860c164e58476c51f7c2f1e98d5a5dd8a5f2860e961db63f0b4bf03bc7783',
      '21acd5adfb0a570d5f883eacb9e99a3d522654821df9621191279ca8bc97594d',
      'acbd5621a3d036ec2c2ab26b1fa8e573d7ab8f805c70d4d0528dffe57c5d3dd9',
      'd536845d531cb339546f147b22dfeb4664c2d70593c8457aa5c50b36535e4118',
      'e7680ff5955aa105a56be469c255d165831dd53cab3f2ec083e120b3fa009879',
    ],
    'kaola-role-workflow-planner': [
      '01512ed93c670cdaf2c008191e06c9a117a8e5ee3e033a697bf50570dea32e6a',
      '0a8d61848e9569b684b9b5665b7ecff8e06f898e803161f5a3455869a7e8d4e4',
      '1998296700170a105afe7a4e4aa8b6fc95f7323a8ab90185a24f8558bf51f5f9',
      '264dcb4f62fe48de2e76b07cb543451f9a05064b6f053e9550920622b8cac851',
      '4bcaebb04d965fd6076a4a034ad1c76602a170c6f6065624c28e80dd8ad0f333',
      '509fc1480ea4aa2a1bfca9dc6cd7b1d6d25066df003f9ba323dba1614286e082',
      '5d6784346ed53c729f4603d52e954da9e0b8c2faa3b4e6ed1ae78c565e22252e',
      '7948775960663f2b68b422e21db8ce759cf8c14d4886fc044108ef2742eabe05',
      '8c0a4245ae5cd62ec32a743055ff9fa2dede46d2370d01629260a43bf7c38ada',
      'a321105d717bbecb49a10277c303a353f349731b496cc791c7fdd3ed4e8ea1bd',
      'ec0439372a99e552d7dd6c5d53865489ad3252608c310daa53d769dcc45687f1',
      'ee2cb4da820f2401bdb2eacc08253bdbd6da4a592d6ac09f4e19c02783debb91',
      'f4211f8d534733e5d5fc133d7e169ffe8ae403d70e92ec674db30b1dfd50f401',
    ],
  },
};

module.exports = {
  MANAGED_AGENT_MARKER, RUNTIMES, CATALOG, SKILL_CATALOG, ROLE_SKILL_NAMES, retireRoleSkills, agentBindings, stripJsonc, REMOVED, REMOVED_RECORD, STILL_INSTALLED, preservedLine,
  retireAgentDir, readRecord, report, isPlainBasename, sha256,
};

if (require.main === module) process.exit(main(process.argv.slice(2)));
