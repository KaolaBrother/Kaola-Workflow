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
//        [--record <file>] [--check]
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

// Decide one dir. Pure apart from the reads and (when apply) the unlinks it reports.
function retireAgentDir({ runtime, dir, record, apply = true, ext = '.md' }) {
  const spec = RUNTIMES[runtime];
  if (!spec) throw new Error(`unknown runtime: ${runtime}`);
  const catalog = CATALOG[runtime] || {};
  const result = { removed: [], preserved: [], warnings: [], recordRemoved: null, dir };
  const carrier = lstat(dir);
  if (!carrier) return result;
  if (!carrier.isDirectory()) {
    result.preserved.push({ reason: 'non_regular', file: dir });
    return result;
  }
  const rec = readRecord(record);
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
    else if (a === '--runtime' || a === '--dir' || a === '--record') {
      if (!args.length) throw new Error(`${a} needs a value`);
      opts[a.slice(2)] = args.shift();
    } else throw new Error(`unknown argument: ${a}`);
  }
  if (opts.command !== 'retire' || !opts.runtime || !opts.dir) {
    throw new Error('usage: kaola-workflow-retired-agents.js retire --runtime <runtime> --dir <dir> [--record <file>] [--check]');
  }
  return opts;
}

function main(argv) {
  let opts;
  try { opts = parseArgs(argv); } catch (err) { console.error(err.message); return 2; }
  try {
    const result = retireAgentDir({
      runtime: opts.runtime, dir: path.resolve(opts.dir),
      record: opts.record ? path.resolve(opts.record) : null, apply: !opts.check,
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
};

module.exports = {
  MANAGED_AGENT_MARKER, RUNTIMES, CATALOG, REMOVED, REMOVED_RECORD, STILL_INSTALLED, preservedLine,
  retireAgentDir, readRecord, report, isPlainBasename, sha256,
};

if (require.main === module) process.exit(main(process.argv.slice(2)));
