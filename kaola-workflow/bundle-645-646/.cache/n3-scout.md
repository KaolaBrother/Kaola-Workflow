evidence-binding: n3-scout e9707fbac9e1
<!-- non_tdd_reason: paste non_tdd_reason here -->
non_tdd_reason: config/scaffolding change (new profile file + install.sh placeholder wiring); no natural failing unit test — verified by install-render regression + syntax check.
<!-- regression-green|build-green|smoke-integration -->
regression-green: node scripts/test-install-model-rendering.js passed (exit 0, "Install model rendering tests passed"); bash -n install.sh passed (SYNTAX_OK)
<!-- OPEN n2-explore's evidence file and append its line-1 binding nonce as the value below -->
upstream_read: n2-explore 84091db98e34

## Task

#646 issue-scout model-tier wiring: give the `issue-scout` agent an opus lever under `--profile=higher`
(it previously had no higher-profile file, so it always installed sonnet under every profile).

## write_set

- `agents/profiles/higher/issue-scout.md` (CREATE) — full verbatim body copy of `agents/issue-scout.md`,
  ONE change: frontmatter `model: sonnet` → `model: opus`. Mirrors `agents/profiles/higher/code-reviewer.md`
  vs `agents/code-reviewer.md` exactly (base=sonnet, higher=opus, prose otherwise byte-identical).
- `install.sh` (EDIT) — two additions, mirroring the existing `CODE_REVIEWER_MODEL` entries verbatim:
  1. `model_for_placeholder()` case list (install.sh:420): added
     `ISSUE_SCOUT_MODEL) resolve_agent_model_for_install issue-scout ;;` immediately after the
     `CODE_REVIEWER_MODEL` case, before `SECURITY_REVIEWER_MODEL`.
  2. `render_command_file()`'s local `placeholders=( … )` array (install.sh:471): added
     `ISSUE_SCOUT_MODEL` immediately after `CODE_REVIEWER_MODEL`, before `SECURITY_REVIEWER_MODEL`.
  Both list entries landed together in the same edit pass (no partial-land regression per the
  #443 precedent flagged in the upstream evidence).

Not touched: `agents/issue-scout.md` (base file, untouched — still `model: sonnet`),
`DEFAULT_AGENT_MODELS`, `REASONING_FLOOR_ROLES`, `REQUIRED_AGENTS`, `default_agent_model()`, or any
routing-surface prose (`{ISSUE_SCOUT_MODEL}` in command/skill files is n5's write set, not mine —
my install.sh case merely makes that future placeholder resolve at install time; it introduces no
placeholder text itself, so it cannot regress `test-install-model-rendering.js`'s unrendered-token
guard on its own).

## verification_commands

1. `bash -n install.sh` → exit 0, printed `SYNTAX_OK`.
2. `grep -n "ISSUE_SCOUT_MODEL" install.sh` → confirmed both entries present:
   `420:    ISSUE_SCOUT_MODEL) resolve_agent_model_for_install issue-scout ;;`
   `471:    ISSUE_SCOUT_MODEL`
3. `grep -n "^model:" agents/profiles/higher/issue-scout.md` → confirmed `4:model: opus`.
4. `node scripts/test-install-model-rendering.js` → exit 0, printed
   `Install model rendering tests passed`. This is a SAFE temp-dir install harness (does not touch
   `~/.claude`); it does not yet assert issue-scout specifically (that pin is n6's), but it confirms
   the install.sh edit did not break existing command-rendering or leave any unrendered
   `model="{X_MODEL}"` token in installed output.

## before_result

Baseline (pre-edit): `agents/profiles/higher/issue-scout.md` did not exist; `install.sh` had no
`ISSUE_SCOUT_MODEL` case in `model_for_placeholder()` or the `placeholders` array (12 entries, ending
`CODE_REVIEWER_MODEL … WORKFLOW_PLANNER_MODEL`, issue-scout absent from both). `node
scripts/test-install-model-rendering.js` was not re-run before the edit (leg was freshly forked from
a green main; the walkthrough/install-render suite is asserted green on main per repo state).

## after_result

`agents/profiles/higher/issue-scout.md` created (model: opus, prose byte-identical to base except the
frontmatter model line). `install.sh` has `ISSUE_SCOUT_MODEL` wired into both the case list and the
placeholders array, mirroring `CODE_REVIEWER_MODEL` in position and style. `bash -n install.sh` and
`node scripts/test-install-model-rendering.js` both green (see verification_commands above). Did NOT
run `./install.sh` against the real `~/.claude` (per instruction — would clobber the live runtime).
