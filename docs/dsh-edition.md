# DSH (DeepSeek Harness) edition

Under ADR 0025 (#1062) the DSH edition installs **no Kaola role profiles**: dispatch goes through
DSH's own native `subagent` and `subagent_fork` tools. A missing named Kaola role is design, not a
`capability_gap` — the orchestrator uses an adequate native route or works inline per item. These
surfaces are measured from DSH CLI `0.1.5-rc.2` and first-party package READMEs; the live schema
wins over this document.

This installer **never writes** user DSH configuration: `$DSH_HOME/.env`, `settings.yaml`,
credentials, or model/provider settings. Those remain owner-owned.

## Install

```bash
./install-dsh.sh --global --forge=github
./install-dsh.sh --check --forge=github
```

Use `--forge=gitlab` or `--forge=gitea` for another forge. Use `--project=/absolute/repository/path`
for project-local skills under `<repo>/.dsh/skills/`. A fresh DSH session picks up the new
carriers because DSH discovers skills and `$DSH_HOME/AGENTS.md` on the first request.

The installer writes under the DSH home `~/.dsh` (`DSH_HOME` overrides it for a hermetic install):

- skills to `skills/<name>/SKILL.md` with required kebab-case `name` and `description`;
- forge-selected support scripts to `kaola-workflow/scripts`;
- the managed global contract to `AGENTS.md`.

It installs **nothing else**. No hooks, no settings, no credentials, no profile patches.

`--uninstall` removes only the Kaola-deployed skills and support scripts (by their rendered and
manifest names — never a blind deletion). A global-scope uninstall (the default) also strips this
runtime's own managed region in `~/.dsh/AGENTS.md` through its own per-target record
(`kaola-workflow-global-contract.js uninstall --runtime dsh`). The record is deleted and the runtime's
shared config reference is released. An owner-edited carrier is refused and left in place, and a
`--project` uninstall leaves the carrier alone. `--check` compares
installed bytes with generated sources.

The global-contract step is the installer's last step and runs in per-target mode
(`--runtime dsh`). It installs and checks only the `dsh-local` carrier, never writes another
runtime's home, and cannot be failed by another runtime's carrier conflict or drift. Both `install`
and `--check` report the `dsh-local` target status when it is not `CURRENT`.

## Invoke

DSH boots a named profile. The invoking directory is the workspace root.

```bash
command -v dsh
dsh --version
dsh --profile headless --help
dsh --profile web --dump-default-config
dsh --profile headless "Use /workflow-next to continue the Kaola-Workflow mission."
```

`--dump-default-config` and `--help` are read-only. A headless task starts a real session and
uses the configured model; do not run it when you only need discovery.

User invocation of an installed skill is `/workflow-next`, `/workflow-init`, or
`/kaola-workflow-finalize` (exact kebab-case skill name).

## Verify without touching user config

`scripts/verify-dsh-edition.sh` (also `npm run verify:dsh`) is a read-only smoke gate. It confirms
`dsh` is on PATH and answers `--version`, reads the shipped native surface via
`dsh --profile headless --dump-default-config` (no session boots, no model call), then runs a
hermetic `install-dsh.sh --global` + `--check` inside a throwaway `HOME`/`DSH_HOME`. It asserts the
user's own `~/.dsh/settings.yaml` and `~/.dsh/.env` are byte-identical before and after. Use it to
answer "does the DSH path work here?" without installing anything global. The rigorous automated
acceptance suite is `node scripts/test-dsh-edition.js`.

## Dispatch and model ownership

The live `subagent` schema owns the route. Shipped headless and web profiles expose `subagent`
and `subagent_fork`. Background execution and child model fields remain runtime-owned. Do not
invent profile or model arguments the live schema does not expose. The universal dispatch
contract lives in the always-loaded machine-global carrier.

## Compact recovery and host guards

DSH loads `$DSH_HOME/AGENTS.md` plus the project `AGENTS.md`/`CLAUDE.md` chain at the first
request. This edition installs no hook. Post-compaction reload of that baseline is not measured
in this scope; recovery is re-invoking the skill, which resumes from the durable mission ledger
(`kaola-workflow/.ledger/issue-<N>.jsonl` in the main checkout) and workflow state.

Every generated runtime adapter begins with a host guard. A foreign carrier imported by DSH is
inert rather than teaching DSH a nonexistent profile, model, or field schema.

## Skip or isolate

```bash
./install-all.sh --skip=dsh --yes
./install-dsh.sh --uninstall
```

Other runtime installers are unchanged. DSH is additive: it is not folded into `install.sh`,
`edition-sync.js`, or `npm test`.
