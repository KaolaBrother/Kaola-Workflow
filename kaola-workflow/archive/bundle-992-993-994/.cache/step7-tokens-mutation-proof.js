#!/usr/bin/env node
'use strict';
// Mutation proof for the 7 new fn-forge-is-the-backlog tokens.
// Replicates test-route-reachability.js's matching EXACTLY (:23 norm, :915 includes).
// In-memory only: the skeleton is never written.

const fs = require('fs');
const path = require('path');
const WT = '/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-992-993-994';
const { REQUIRED_BLOCKS } = require(path.join(WT, 'templates/routing/required-blocks.js'));

const norm = s => String(s).replace(/\s+/g, ' ');           // test-route-reachability.js:23
const hit = (content, tok) => norm(content).includes(norm(tok)); // :915

const block = REQUIRED_BLOCKS.find(b => b.block_id === 'fn-forge-is-the-backlog');
const NEW = block.content_tokens.slice(6); // the 7 added tokens

// The authored prose, read from the canonical file (never retyped).
const authored = fs.readFileSync(
  '/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/kaola-workflow/bundle-992-993-994/.cache/step7-prose-authored.md',
  'utf8').split('\n');
const paraA = authored.slice(17, 26).join('\n'); // lines 18-26
const paraB = authored.slice(29, 33).join('\n'); // lines 30-33

// The would-be surface: today's finalize command surface with both paragraphs
// inserted inside the pin, exactly where the authored file says they land.
const surface = fs.readFileSync(path.join(WT, 'commands/kaola-workflow-finalize.md'), 'utf8');
const ANCHOR = 'When this run\'s own findings contradict';
if (!surface.includes(ANCHOR)) { console.error('anchor not found'); process.exit(2); }
const build = (a, b) => surface.replace(ANCHOR, a + '\n\n' + b + '\n\n' + ANCHOR);

let fails = 0;
const check = (label, cond) => { if (!cond) { fails++; console.log('  FAIL  ' + label); } else console.log('  ok    ' + label); };

// (0) GREEN SIMULATION — with the authored prose in place, all 12 tokens hit.
console.log('\n[0] green simulation (authored prose inserted verbatim):');
const green = build(paraA, paraB);
block.content_tokens.forEach((t, i) => check('token ' + (i + 1) + ' present', hit(green, t)));

// (1..7) MUTANTS — one obligation gutted at a time; each must red EXACTLY its own token.
const mutants = [
  ['A1 Measured restriction: drop "only"',
    () => build(paraA.replace('carries\nonly what this run observed', 'carries\nwhat this run observed'), paraB), 0],
  ['A2 stamping duty: drop the provenance half',
    () => build(paraA.replace(' and the\ncommand or artifact it came from', ''), paraB), 1],
  ['A3 Hypothesis default: "lands there by default" -> "may land there"',
    () => build(paraA.replace('lands\nthere by default', 'may land\nthere'), paraB), 2],
  ['A4 remedy label: drop "(non-binding)"',
    () => build(paraA.replace('`## Proposed remedy (non-binding)`', '`## Proposed remedy`'), paraB), 3],
  ['A5 searched: line: drop the probe sentence opener',
    () => build(paraA.replace('Add one `searched:` line recording the duplicate probe you', 'Record the probe you'), paraB), 4],
  ['B1 filing check: drop the non-empty-body half',
    () => build(paraA, paraB.replace(' and its body is non-empty,', '')), 5],
  ['B2 record location: "never" -> "or"',
    () => build(paraA, paraB.replace('result line, never the', 'result line, or the')), 6],
];

for (const [label, make, idx] of mutants) {
  const content = make();
  const missing = NEW.map((t, i) => [i, hit(content, t)]).filter(([, h]) => !h).map(([i]) => i);
  console.log('\n[' + (idx + 1) + '] ' + label);
  check('mutation actually changed the text', content !== green);
  check('reds new-token #' + (idx + 1) + ' — got missing=[' + missing.map(i => i + 1).join(',') + ']',
    missing.length === 1 && missing[0] === idx);
  check('the 5 pre-existing tokens stay green',
    block.content_tokens.slice(0, 6).every(t => hit(content, t)));
}

console.log('\n' + (fails === 0 ? 'MUTATION PROOF PASSED — each of the 7 tokens is independently armed.'
  : 'MUTATION PROOF FAILED: ' + fails));
process.exit(fails === 0 ? 0 : 1);
