# code-architect raw output — Phase 3 Plan (issue-211)

## Design decisions
- Runtime baseline, no embedded canonical copies: github SKILL.md read() at runtime + sliced; gitlab/gitea compared against that slice. Only string literals are the two anchors `'Delegation Contract'` and `'On resume, extract and reassign'`.
- Strict byte-equality via `===`; `.includes()` only to FIND the anchor line index (matches existing `assertBefore` indexOf idiom).
- Inline `sectionBody()` copied verbatim from `scripts/kaola-workflow-classifier.js` L127-139; not require()d.
- Resume clause as 2-line unit (marker line + next line). Line below pair is blank in all three, then diverges: github L224 `repair_script="plugins/kaola-workflow/..."` vs gitlab/gitea L235 ` ```bash `. So enclosing `## Routing` section compare would false-flag.
- Two insertion points: helpers after L55 (before `const retired` L57); compare loop after L361 (before CHANGELOG assert L363). `fs`/`path` already required L4-5 → NO new requires.
- Per-assertion failure messages naming diverging file + section/clause + baseline path (mirrors L337-340/L357-359 style).
- Byte-for-byte mirror to `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` (COMMON_SCRIPTS L50).

## Files to Create
None.

## Files to Modify
| File | Changes | Why |
|------|---------|-----|
| `scripts/validate-workflow-contracts.js` | Inline `sectionBody()` + `resumeClausePair()` after L55; baseline-compare loop after L361 | The parity assertion. Rides existing `node scripts/validate-workflow-contracts.js` in package.json L36 (:claude chain) — no new wiring. |
| `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` | `cp` edited root file over it (byte-for-byte) | In validate-script-sync.js COMMON_SCRIPTS L50; sync guard fails if it drifts. |

## EXACT code — Block 1 (helpers, after L55, before L57 `const retired = [`)
```js
// issue #211: inline section slicer (copied verbatim from
// scripts/kaola-workflow-classifier.js so the validator carries no classifier
// dependency). Returns the body of a `## {heading}` section, up to the next
// h1/h2 heading (or EOF).
function sectionBody(content, heading) {
  const lines = String(content || '').split('\n');
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const headRe = new RegExp('^##\\s+' + escaped + '\\s*$');
  let i = 0;
  for (; i < lines.length; i++) { if (headRe.test(lines[i])) { i++; break; } }
  if (i >= lines.length) return '';
  const out = [];
  for (; i < lines.length; i++) {
    if (/^#{1,2}\s/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out.join('\n');
}

// issue #211: extract the resume clause as an isolated 2-line unit — the line
// carrying the marker plus exactly the next line. The enclosing `## Routing`
// section is NOT compared because a forge-specific `repair_script=`/```bash line
// sits ~2 lines below and would false-flag cross-forge parity.
function resumeClausePair(content) {
  const lines = String(content || '').split('\n');
  const idx = lines.findIndex(line => line.includes('On resume, extract and reassign'));
  return idx < 0 ? '' : lines[idx] + '\n' + (lines[idx + 1] || '');
}
```

## EXACT code — Block 2 (compare loop, after L361, before L363 CHANGELOG assert)
```js
// issue #211: cross-forge parity for the kaola-workflow-next skill. The
// `## Delegation Contract` section body and the resume clause must byte-match
// across all three editions. github is the baseline; gitlab and gitea must
// match it exactly. This guards against a forge edition silently drifting in
// delegation policy or resume-reassignment semantics.
const nextSkillEditions = [
  ['github', 'plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md'],
  ['gitlab', 'plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md'],
  ['gitea', 'plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md'],
];
const [, nextSkillBaselineFile] = nextSkillEditions[0];
const nextSkillBaseline = read(nextSkillBaselineFile);
const baselineDelegationContract = sectionBody(nextSkillBaseline, 'Delegation Contract');
const baselineResumeClause = resumeClausePair(nextSkillBaseline);
// Optional hardening (#211): if the github block were ever deleted, the baseline
// would go empty and a deleted forge block would silently match. Pin non-empty.
assert(
  baselineDelegationContract.length > 0 && baselineResumeClause.includes('On resume'),
  nextSkillBaselineFile + ' must define a "## Delegation Contract" section and an ' +
    '"On resume, extract and reassign" clause to anchor the issue #211 cross-forge parity baseline'
);
for (const [, file] of nextSkillEditions.slice(1)) {
  const content = read(file);
  assert(
    sectionBody(content, 'Delegation Contract') === baselineDelegationContract,
    file + ' "## Delegation Contract" section must byte-match the github baseline ' +
      nextSkillBaselineFile + ' (issue #211 cross-forge parity)'
  );
  assert(
    resumeClausePair(content) === baselineResumeClause,
    file + ' resume clause ("On resume, extract and reassign" line + next line) must byte-match the ' +
      'github baseline ' + nextSkillBaselineFile + ' (issue #211 cross-forge parity)'
  );
}
```
(Optional non-empty guard assert is non-blocking; may be dropped for strict minimalism without affecting the two core parity assertions.)

## Build sequence
1. Edit root copy: Block 1 after L55, Block 2 after L361.
2. `cp scripts/validate-workflow-contracts.js plugins/kaola-workflow/scripts/validate-workflow-contracts.js`.
3. Clean-pass first: run validator on untouched tree → must PASS.
4. Prove failing direction A (DC body), revert.
5. Prove failing direction B (resume 2nd line), revert.
6. `node scripts/validate-script-sync.js`.
7. `node scripts/validate-workflow-contracts.js` (clean).
8. `node scripts/simulate-workflow-walkthrough.js`.
9. `npm test`.

## Task 1 — implement parity check
Write set:
- `scripts/validate-workflow-contracts.js` (edit: Block 1 + Block 2)
- `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` (cp mirror)
No SKILL.md edits, no package.json edits.

## Exact validation commands (repo root; macOS BSD sed `-i ''`; revert via `git checkout --`)
```bash
node scripts/validate-workflow-contracts.js                                # clean pass, exit 0
sed -i '' '33s/$/ /' plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md
node scripts/validate-workflow-contracts.js                                # NON-ZERO; DC section message
git checkout -- plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md
sed -i '' '233s/absent/absebt/' plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md
node scripts/validate-workflow-contracts.js                                # NON-ZERO; resume clause message
git checkout -- plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md
node scripts/validate-script-sync.js                                       # in sync
node scripts/validate-workflow-contracts.js                                # "Workflow contract validation passed"
node scripts/simulate-workflow-walkthrough.js                              # "Workflow walkthrough simulation passed"
npm test
```
Note: gitea L233 = resume clause 2nd line containing `absent`; gitlab L33 = inside DC body. Both land inside compared slices, not forge-specific boundary lines. (Implementer must RE-READ live line numbers before sed — they shift if files changed.)

## Out of scope
- Codex validator `scripts/validate-kaola-workflow-contracts.js` (L89/95/100 pins stay).
- gitlab/gitea forge contract validators.
- package.json (no wiring change).
- SKILL.md content (inputs being asserted).
- No 4th canonical copy.

## Verified facts
- read/assert helpers L9-23; fs/path required L4-5.
- Codex plugin.json baseline-compare loop ends L361; CHANGELOG assert L363.
- Success line L401.
- DC section github L27 → L53; bodies byte-identical across 3.
- Resume clause github L220-221, gitlab/gitea L232-233, byte-identical. Line below = blank; then github L224 repair_script vs gitlab/gitea L235 ```bash.
- Marker occurs exactly once per file.
- validate-workflow-contracts.js in COMMON_SCRIPTS L50; root+mirror byte-identical now.
