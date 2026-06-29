evidence-binding: n3-meaning-verify 632eb702344a
verdict: pass
findings_blocking: 0

## Claim Under Test
Issue #576: provenance stragglers stripped from agent-facing prompt surfaces across ALL editions (a); PROVENANCE_BAN guard placed so each edition's validator scans its COMPLETE prompt-surface set (b); banlist regex /#\d{1,4}|D-\d{3}-\d{2}|\bINV-\d+|ADR[ -]\d{2,4}|\b(?:PR|MR|AC)#\d+/ bans the full taxonomy without false-positives on allowed forms (c); INV-17->validator-derived reword preserved meaning and dropped no FEATURE_TOKEN (d); three workflow-planner.toml byte-identical and the two validate-workflow-contracts.js byte-identical (e).

## Disproof Attempt — NONE of the four probes could be refuted (inverted, refuted-if-uncertain burden)

Probe 1 — strip completeness (PASS). Re-derived surface set from scratch; committed regex line-by-line over all 126 prompt files (agents/*.md=15, commands/*.md=11; codex agents/*.toml=15 + skills/*/SKILL.md=11; gitlab 15+11+11; gitea 15+11+11): TOTAL BANLIST HITS: 0. Broader-than-committed patterns (#\d{5,}, \bD-\d+-\d+, \bADR[ -]?\d+/i, \bINV-?\d+/i, [INV, GitLab !\d{2,} MR refs, issue #\d, (#\d): BROAD TOTAL: 0. Out-of-scope codex config/agents.toml = 0. No straggler survives.

Probe 2 — enforcement-hole audit (PASS). Each validator's actual enumeration read:
- claude validate-workflow-contracts.js: root=repo root; scans agents/*.md + commands/*.md -> complete claude surface.
- codex validate-kaola-workflow-contracts.js: scans plugins/kaola-workflow/agents/*.toml(15) + skills/*/SKILL.md(11); codex plugin has NO commands/ dir -> complete.
- gitlab/gitea validators: scan [...agentFiles, ...commandFiles, ...skillFiles] = agents/*.toml + commands/*.md + listSkillFiles() = 15+11+11 each -> complete.
- opencode test-opencode-edition.js A25: scans OUT_AGENT_DIR(15) + OUT_COMMAND_DIR(11), non-vacuous (26 files); A25 byte-parity assertion proves regenerated mirror matches current stripped canonical.
- The two validate-workflow-contracts.js byte-identical (cmp clean); the codex copy under plugins/kaola-workflow/scripts/ is a SHIPPED artifact NOT executed by the codex chain (codex chain runs validate-kaola-workflow-contracts.js) -> byte-identity does not create a vacuous gate. No surface unscanned; no hole.

Probe 3 — regex taxonomy (PASS). Full match matrix vs committed regex. MUST-MATCH all hit: #123,#42,D-100-01,INV-9,INV-17,ADR 0005,ADR-0005,PR#42,MR#7,AC#3,see #576,[INV-17],(ADR 0004),issue #1234. MUST-NOT-MATCH all spared: #N,#<issue>,#<n>,KAOLA_TARGET_ISSUE=N,--target-issue <N>,Closes #<issue>,G1,G3,H5,AC7,M4,#section,AC#. TOTAL UNEXPECTED: 0. \b correctly spares AC7 (no #) while catching AC#3; #\d{1,4} catches #42 in running text but not #< placeholders. No false-positive in actual surfaces (probe 1 = 0 hits) -> no chain destabilization.

Probe 4 — INV-17 reword + parity (PASS). Reword: "...same INV-17 discipline as `parallel_safe` above" -> "...same validator-derived discipline as `parallel_safe` above". Meaning preserved: parallel_safe-above anchor intact; planner.md explicitly states parallel_safe is validator-derived -> identical semantic content. grep "INV-" over planner.md + all three toml -> NO INV- anywhere. FEATURE_TOKENS array in test-agent-profile-parity.js has no INV-17 entry -> none dropped; node scripts/test-agent-profile-parity.js -> green (24 assertions). Three workflow-planner.toml byte-identical (cmp clean). The two validate-workflow-contracts.js byte-identical.

Cross-edition confirmation. Five validators green individually; test-agent-profile-parity.js green (24); test-opencode-edition.js green (494); full four chains all exit=0 (claude, codex, gitlab, gitea walkthrough simulations passed) -> #307 four-chain obligation satisfied.

## Verdict
NOT-REFUTED (confidence: high). Every probe independently re-derived and confirmed; strong disproof attempts (broader-than-committed regex sweep, vacuous-scan hunt, false-pos/neg matrix, byte-mirror gate analysis) all failed to break the claim. No blocking findings.
