# Active-run and portable workflow-init production repair

## Task

Repair PR #1041's project-instruction migration and generated workflow-init surfaces so active-run
state schema compatibility is inspected on the real production path, execution-default changes have
an ephemeral conversation-consent apply leg bound to an unchanged plan, and workflow-init performs
no runtime/global installation.

## Verification tier

`tests-green`

## Files changed

- `scripts/kaola-workflow-project-instructions.js`
- `plugins/kaola-workflow/scripts/kaola-workflow-project-instructions.js`
- `plugins/kaola-workflow-gitlab/scripts/kaola-workflow-project-instructions.js`
- `plugins/kaola-workflow-gitea/scripts/kaola-workflow-project-instructions.js`
- `templates/routing/init.skeleton.md`
- `commands/workflow-init.md`
- `plugins/kaola-workflow-gitlab/commands/workflow-init.md`
- `plugins/kaola-workflow-gitea/commands/workflow-init.md`
- `plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md`
- `plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md`
- `plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md`

The routing generator also refreshed already-present ignored additive-edition init surfaces in the
main checkout, as its own output reported. No tracked additive-edition surface was added here.

## Before

Command:

```text
node scripts/test-runtime-agent-architecture.js
```

Exit `1`: `11 failure(s), 777 passed`. The failures were the four executable global-installer
workflow-init surfaces, the absent plan-bound consent carrier/post-consent apply leg, and the absent
production-path `schema_version: 999` fence. Production files were unchanged at this baseline; the
only worktree changes were the independent test author's two acceptance files.

## Repair result

- Active `workflow-state.md` bytes are inspected from each real active run directory. An absent
  schema declaration and `schema_version: 1` are compatible; any other explicit declaration is
  reported as `state_schema_incompatible` and fences instruction, run, and receipt writes.
- An active missing `AGENTS.md` and a changed managed AGENTS region are
  `execution_default_change`. `plan` returns exact before/after hashes and an ephemeral
  `consent.apply_args` token bound to the project path, both instruction plans, and active state plus
  Mission List hashes. Bare or stale-token apply is non-mutating; the matching unchanged plan writes
  only planned instruction bytes and stores no consent/approval or adoption receipt.
- A converged managed region is layout-equivalent, so the post-consent rerun is a no-op rather than
  asking for consent again.
- Canonical workflow-init no longer invokes a runtime/global installer. Generated command/skill
  surfaces only run read-only readiness diagnostics and state that runtime/global remediation is a
  separate operation.

## Verification commands

1. Intermediate acceptance after production logic, before routing regeneration:

   ```text
   node --check scripts/kaola-workflow-project-instructions.js && node scripts/test-runtime-agent-architecture.js
   ```

   Exit `1`: production-path active-run/consent tests were green; only four still-unregenerated
   init installer surfaces failed (`4 failure(s), 784 passed`).

2. Canonical routing regeneration:

   ```text
   node scripts/generate-routing-surfaces.js --write
   ```

   Exit `0`: rendered 18 tracked surfaces; only the six init command/skill surfaces changed.

3. Manual stale-plan and instruction-only consent probe:

   ```text
   node -e '<temporary active-run fixture: plan; mutate Mission List; reject stale token; re-plan; consented apply; converged rerun>'
   ```

   Exit `0`: `manual active-init probe PASS: stale-plan fenced; consented instruction-only apply; converged rerun`.

4. Manual missing-AGENTS active-run probe:

   ```text
   node -e '<temporary active-run fixture with missing AGENTS.md: plan then bare apply>'
   ```

   Exit `0`: `manual missing-AGENTS active probe PASS: execution-default consent required, bare apply non-mutating`.

5. Final scoped gate:

   ```text
   git diff --check && node scripts/test-runtime-agent-architecture.js && node scripts/generate-routing-surfaces.js --check && node scripts/test-route-reachability.js && node scripts/validate-script-sync.js
   ```

   Exit `0`:

   ```text
   runtime-agent-architecture test passed (788 assertions).
   generate-routing-surfaces --check: all 18 surfaces byte-match the skeleton.
   Route-reachability test passed (170 assertions).
   OK: 16 common scripts, 28 byte-identical groups, 1 rename-normalized families,
       2 hooks.json families (config + hooks dir), and 5 forge export-superset families in sync.
   committed kernel parity: 4 Oracle Kernel copies identical at HEAD.
   ```

6. Additional routing/contract probe:

   ```text
   node scripts/test-generate-routing-surfaces.js
   node scripts/validate-workflow-contracts.js
   node scripts/validate-kaola-workflow-contracts.js
   ```

   The first two exited `0` (`520 assertions` and `Workflow contract validation passed`). The third
   exited `1` at its legacy assertion that the Codex init skill must contain
   `install-codex-agent-profiles.js" --global`. That assertion directly contradicts the new authored
   A3 acceptance that every workflow-init surface invokes no runtime/global installer. Per test
   custody, production did not edit or bypass this validator; it is reported to the orchestrator for
   the acceptance owner to reconcile before full chains. The same stale init-skill pin remains in
   the GitLab and Gitea forge validators. A preceding attempt used the nonexistent
   plugin-local validator path and exited `1` with `MODULE_NOT_FOUND`; the correct validator is the
   root `scripts/validate-kaola-workflow-contracts.js` path used above.

## After

The authored active-run/workflow-init acceptance suite is green at 788 assertions. Canonical routing
generation, route reachability, exact four-copy script parity, committed-kernel parity, syntax, and
diff whitespace checks are green. The full multi-edition walkthrough/release chains remain parent
orchestrator integration work because concurrent owners are still repairing the Cursor surface in
the same candidate.

## Unknowns

- No fresh Cursor Cloud/App execution was performed in this repair; this ownership was limited to
  the portable init and active-run helper.
- No release or global runtime install was executed here.
- The legacy Codex/GitLab/Gitea contract-validator pins remain red and require the acceptance owner;
  changing them is outside this production write set.

## Follow-up: per-change mixed incompatible-state repair

The acceptance owner added `A3[active-state-schema-mixed]` after integration review established that
the first production repair treated one incompatible active state as a repository-wide freeze. This
follow-up changed only the four production migration-helper copies.

### Before

```text
node scripts/test-runtime-agent-architecture.js
```

Exit `1`: `3 failure(s), 789 passed`. The real mixed fixture showed that an incompatible active state
froze an independent layout-equivalent CLAUDE thin-bridge write, so neither the bridge nor its
write-scoped recovery receipt landed.

### Production correction

- Active state incompatibility fences AGENTS execution authority and any file whose own
  compatibility is `state_schema_incompatible`; it is no longer a repository-wide freeze bit.
- A changed CLAUDE bridge remains eligible only when it is `authority_layout_equivalent` and a valid
  current managed AGENTS authority already exists in the pre-apply bytes. Therefore a bridge that
  depends on a blocked missing/legacy AGENTS migration remains fenced, preserving the earlier
  all-fenced fixture.
- The mixed apply keeps AGENTS, `workflow-state.md`, and `mission-list.md` byte-identical, writes only
  `CLAUDE.md`, emits no consent/approval, and writes an adoption receipt whose write set is exactly
  `CLAUDE.md` while retaining incompatible-state evidence.
- Bare/stale execution-default consent and exact plan-binding behavior are unchanged.

### After

```text
node scripts/test-runtime-agent-architecture.js
```

Exit `0`: `runtime-agent-architecture test passed (792 assertions)`.

```text
node scripts/validate-kaola-workflow-contracts.js && \
node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js && \
node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js && \
node scripts/generate-routing-surfaces.js --check && \
node scripts/test-generate-routing-surfaces.js && \
node scripts/test-route-reachability.js && \
node scripts/validate-script-sync.js && \
git diff --check
```

Exit `0`:

```text
Kaola-Workflow Codex contract validation passed
Kaola-Workflow GitLab contract validation passed
Kaola-Workflow Gitea contract validation passed
generate-routing-surfaces --check: all 18 surfaces byte-match the skeleton.
test-generate-routing-surfaces: all 520 assertions passed.
Route-reachability test passed (170 assertions).
OK: 16 common scripts, 28 byte-identical groups, 1 rename-normalized families,
    2 hooks.json families (config + hooks dir), and 5 forge export-superset families in sync.
committed kernel parity: 4 Oracle Kernel copies identical at HEAD.
```

The acceptance owner independently repaired the three stale validator pins reported earlier, so
that former integration finding is resolved and all three validators are now green.
