evidence-binding: n2-scout-impl 2e6d6a1b7fc7

## Task
Apply the priority-first ranking fix to the `issue-scout` agent profile across all 4 byte-coupled editions, following the n1-design blueprint.

non_tdd_reason: Config/prose — this deliverable is agent-instruction PROSE (the scout's ranking objective lives in the dispatched LLM agent's reasoning, not a code path); no contract validator pins scout prose content and there is no meaningful failing unit test for "the scout now ranks priority-first". The binding walls are cross-edition parity + the four npm chains (run at finalize).

verification_tier: build-green

## Files Changed

1. `agents/issue-scout.md` (github/root edition):
   - §1a: Replaced the `ROADMAP.md` bullet to add explicit priority/drive-order signal extraction instructions (Next Step column, ### Project rules block).
   - §1b: Extended the `.roadmap/issue-*.md` inventory bullet to include priority signals; inserted new "roadmap priority frontier" extraction bullet.
   - §2a: Replaced "Group candidate issues by coherent scope signal:" with the 3-tier ranking precedence block (priority tier → scope-cohesion → actionability-as-tiebreak-only), then kept the scope-grouping bullets.
   - §2b: Inserted new leading bullet in Bundle Selection Rules requiring the set be in the highest open-and-actionable priority tier.
   - §3a: Inserted new "### 4. Frontier-Blocked Rule" section (explicit fall-through protocol; silent proxy substitution forbidden).
   - §4a: Inserted `priority_basis` object into the Output Format JSON example immediately after `rationale`.
   - §4b: Inserted `priority_basis` (required) field description in the Fields list immediately after `rationale`.
   - §6a: Inserted priority-over-goal clarifying sentence in Goal Context (goal is soft tiebreak within tier, never overrides frontier).

2. `plugins/kaola-workflow/agents/issue-scout.toml` (Codex/github port):
   - §1c: Replaced ROADMAP.md bullet with expanded priority/drive-order signal read instructions; inserted new .roadmap/issue-*.md priority-signal + frontier-extraction bullet.
   - §6b: Inserted priority-over-goal sentence in Goal context block.
   - §2c: Replaced "Bundle selection rules" intro with ranked-precedence block (3 tiers) + new leading priority-tier bundle selection rule.
   - §3b: Inserted "Frontier-blocked rule" block before "Output contract".
   - §4c: Replaced Output contract first bullet to add `priority_basis` (REQUIRED); inserted `priority_basis` description line.

3. `plugins/kaola-workflow-gitlab/agents/issue-scout.toml` — byte-identical copy of the kaola-workflow toml above.

4. `plugins/kaola-workflow-gitea/agents/issue-scout.toml` — byte-identical copy of the kaola-workflow toml above.

## Verification Commands and Results

### 1. Byte-identity of the 3 toml ports
```
md5 plugins/kaola-workflow/agents/issue-scout.toml plugins/kaola-workflow-gitlab/agents/issue-scout.toml plugins/kaola-workflow-gitea/agents/issue-scout.toml
```
Output:
```
MD5 (plugins/kaola-workflow/agents/issue-scout.toml) = b62eef3bf1bd292d11c3188b0dfd22de
MD5 (plugins/kaola-workflow-gitlab/agents/issue-scout.toml) = b62eef3bf1bd292d11c3188b0dfd22de
MD5 (plugins/kaola-workflow-gitea/agents/issue-scout.toml) = b62eef3bf1bd292d11c3188b0dfd22de
```
All three md5 sums match: b62eef3bf1bd292d11c3188b0dfd22de. PASS.

### 2. Forge-neutrality checks
```
node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js --forbidden-only plugins/kaola-workflow-gitlab/agents/issue-scout.toml
```
Output: `Kaola-Workflow GitLab forbidden-only check passed (1 file(s))` — exit 0. PASS.

```
node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js --forbidden-only plugins/kaola-workflow-gitea/agents/issue-scout.toml
```
Output: `Kaola-Workflow Gitea forbidden-only check passed (1 file(s))` — exit 0. PASS.

### 3. Scope check — only 4 declared files changed
```
git status --porcelain
```
Output:
```
 M agents/issue-scout.md
 M plugins/kaola-workflow-gitea/agents/issue-scout.toml
 M plugins/kaola-workflow-gitlab/agents/issue-scout.toml
 M plugins/kaola-workflow/agents/issue-scout.toml
?? kaola-workflow/issue-524/
```
Exactly the 4 declared files modified; the `??` is this evidence cache directory (untracked, not a new changed repo file). PASS.

build-green
