# Adversarial verification — issue #1012

behavior: adversarial-verifier
profile: resolved_profile_hash=80e8b4b4df55c5379dfa5c62f8f341f6b173966018a4da09851d11a0cf75fe2d
context: issue-1012
candidate: tracked diff in `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1012`

## Exact claim

The tracked #1012 change completes the issue as corrected by its latest owner
comment: generated Grok agents derive `medium` / `high` effort from the existing
canonical standard / reasoning tiers, retain `model: inherit`, and keep generated
command dispatch model-free across github, gitlab, and gitea; the suite fails when
the declaration or shipped effort fields disappear; and the required live sample
records a standard child at medium and a reasoning child at high while both inherit
the Grok 4.6 parent model. The disclosed Grok CLI 1.0.5 literal-`implementer` clamp
is a recorded runtime exception rather than an undisclosed successful binding.

## Exact surface

- The tracked diff in
  `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1012`.
- GitHub issue #1012 body and owner comments as read on 2026-08-22.
- Evidence under
  `/Users/ylpromax5/Workspace/Kaola-Workflow/kaola-workflow/issue-1012/.cache`.
- Generated trees at `.grok`, `.grok-gitlab`, and `.grok-gitea` under the main
  checkout, which are the linked-worktree generator's declared `TREE_ROOT`.
- Archived Grok session summaries and spawn events for the session identities
  recorded in `live-grok.md`.

## Analytical result

`not_refuted`

No candidate-caused counterexample survived the bounded falsification. The
literal `implementer` result disproves a stronger universal claim that Grok CLI
1.0.5 honors the generated standard pin for every role name, but the candidate
does not make that claim: `docs/grok-edition.md`, `CHANGELOG.md`, and the latest
issue comment state the exception. The issue's falsifiable live acceptance asks
for one standard and one reasoning role; the recorded `tdd-guide` and
`code-reviewer` sample satisfies it.

## Counterexample frontier and evidence

### 1. Canonical roster drift and second-roster risk

Command: a direct Node probe read all 14 canonical `agents/*.md`, compared their
frontmatter `model:` tokens with
`kaola-workflow-resolve-agent-model.js.DEFAULT_AGENT_MODELS`, and then rendered
from those tokens.

Observed:

- The canonical inventory and `DEFAULT_AGENT_MODELS` have the same 14 keys.
- Every role has the same token on both surfaces: seven `sonnet` standard roles
  and seven `opus` reasoning roles.
- `sync-grok-edition.js` contains a token-to-effort map, not a role roster, and
  reads each canonical agent's frontmatter at render time.
- Direct render probes also accepted the declared aliases `standard` and
  `reasoning`, mapping them to `medium` and `high` respectively.

Result: roster drift did not break the claim, and no second role-membership table
was introduced in the generator.

### 2. Unknown and absent model tokens

Command: direct calls to exported `renderAgent` with canonical model tokens
`sonnet`, `standard`, `opus`, and `reasoning`, followed by counterexamples using
an absent token, `haiku`, and `grok-4.6` for role `probe-role`.

Observed:

- All four accepted tokens rendered `model: inherit` plus the expected single
  `effort:` field.
- Each invalid input threw before rendering. The error named `probe-role` and
  the offending token; the absent case named `<absent>`.

Result: invalid state fails closed rather than inheriting an accidental default.

### 3. All three forge trees, inherited model, and command dispatch

Commands:

```text
node scripts/sync-grok-edition.js --forge=github --check
node scripts/sync-grok-edition.js --forge=gitlab --check
node scripts/sync-grok-edition.js --forge=gitea --check
```

Plus a direct scan of every generated agent and command in all three trees.

Observed:

- Each `--check` passed with 14 agents, 3 commands, and 2 hook files in parity.
- Every generated role in every tree carried `model: inherit` and the effort
  derived from its canonical token.
- Every generated command in every tree was free of a per-call `model` assignment.
- `rg -n -i 'grok-4\\.6|grok-[0-9]' agents commands CLAUDE.md templates`
  returned no match.
- The tracked diff did not add Grok to `package.json`'s `test`,
  `scripts/edition-sync.js`, or `install.sh`.

Result: neither a forge-specific omission nor a model-inheritance regression was
found; the additive runtime boundary remains unchanged.

### 4. Declaration-deletion mutation

Method: compiled an in-memory copy of `scripts/test-grok-edition.js` with only
the object key `tiered_effort_pin` renamed. Tracked bytes were not changed.

Observed:

```text
FAIL: G2-declaration: GROK_RUNTIME_NATIVE must declare "tiered_effort_pin" with a one-line reason
FAIL: G2-declaration: the "tiered_effort_pin" reason must state standard/reasoning medium/high effort pins
grok-edition test FAILED: 2 failure(s), 541 passed.
DECLARATION_MUTATION_EXIT=1
```

One initial shell wrapper attempted to store the exit code in zsh's reserved
`status` variable and therefore errored after the mutant suite ran. The leg was
rerun with `task_rc`; the quoted result above is the successful harness run.

Result: deletion of the declared runtime binding turns the suite red.

### 5. Effort-field deletion mutation

Method: intercepted the suite's generator child processes and compiled an
in-memory generator copy with the single `lines.push('effort: ' + effort)`
emission removed. Tracked and generated bytes were not changed.

Observed: the suite's pre-repair D0 check reported all 14 github agents stale,
stopped before self-provision could repair the tree, and exited nonzero:

```text
sync-grok-edition[github]: PARITY FAILED (14 file(s))
grok-edition test FAILED: D0[github]: .grok is present on disk and has DRIFTED from canonical
EFFORT_FIELD_MUTATION_EXIT=1
```

Result: deleting the shipped effort field turns the suite red with one bite per
generated role.

### 6. Clean edition suite

Command:

```text
node scripts/test-grok-edition.js
```

Observed:

```text
grok-edition test passed (543 assertions).
[drift-check: 3 tree(s) in parity (.grok, .grok-gitlab, .grok-gitea)]
```

Execution status: succeeded, exit 0.

### 7. Live runtime evidence and the literal `implementer` clamp

The session identities in `.cache/live-grok.md` were checked against the archived
Grok session records under the recoverably trashed isolated probe home.

Observed:

- Parent `7a0a6001-dbe6-445e-8c27-1015f8ba42a6`: model `grok-4.6`, effort
  `xhigh`.
- Child `01a028db-694f-7c62-b73d-f9ff690f7f89`: agent `tdd-guide`, session
  kind `subagent`, model `grok-4.6`, effort `medium`.
- Child `01a028db-6950-7b60-944c-94cab82b7657`: agent `code-reviewer`, session
  kind `subagent`, model `grok-4.6`, effort `high`.
- Both parent `spawn_subagent` raw-input objects had exactly `description`,
  `prompt`, and `subagent_type`; neither had a `model` key.
- Three recorded literal-`implementer` child summaries independently showed
  effort `high`, including the normal-home child and two isolated-probe children.
  The shipped `.grok/agents/implementer.md` carries `model: inherit` plus
  `effort: medium`.

The deleted temporary inline profile cannot now be re-read, so its exact source
bytes remain supported by the contemporaneous `live-grok.md` record rather than
a current file. That uncertainty does not support a universal runtime-success
claim; it reinforces why the candidate explicitly documents the limitation.

Result: the live acceptance sample is source-backed. The `implementer` clamp is
real, but it is not concealed or misclassified as generator success in the
candidate.

## Findings

No canonical in-scope findings.

## Receipt

analytical_result: not_refuted
confidence: high
verdict: pass
findings_blocking: 0
