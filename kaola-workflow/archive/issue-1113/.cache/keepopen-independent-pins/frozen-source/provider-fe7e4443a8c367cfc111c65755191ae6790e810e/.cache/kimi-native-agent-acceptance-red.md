# Kimi native-agent acceptance RED — Issue #1033

## Assigned task

Replace the retired Kimi `coder`/`explore` plus `kaola-role-*` Skill emulation with acceptance for
Kimi-native custom agents, without editing production or documentation.

## Acceptance authored

- The generated tree has exactly 14 `.kimi/agents/<role>.md` profiles. Each profile has the direct
  dispatch name `kaola-role-<role>`, a non-empty description, exactly one
  `kaola-workflow-managed-agent: true` ownership marker, the complete canonical behavior contract,
  and a valid resolved-profile hash.
- Each native profile declares an explicit Kimi `tools` allowlist derived independently from the
  role capability contract. Kimi's native names are used, including `FetchURL` rather than the
  Claude-shaped `WebFetch`. Both Bash-granted and Bash-withheld roles are exercised.
- Each canonical dispatch card names `subagent_type="kaola-role-<role>"` directly. Generated command
  Skills contain neither `coder`/`explore` fallback dispatches nor a prompt prefix telling the child
  to invoke a role Skill.
- `.kimi/skills/` contains exactly the three command Skills and zero `kaola-role-*` role Skills on
  every forge render and install.
- `sync-kimi-edition --check/--write` detects and removes retired command Skills and retired native
  agent profiles, including in the linked-worktree and refresh-present fixtures.
- Real hermetic project and global installs deploy all command Skills, all 14 native agents, support
  scripts, and hooks; reinstall converges byte-for-byte and keeps one managed hooks block; uninstall
  removes only managed artifacts. Migration removes the 14 formerly deployed role Skills.
- A project or global same-name agent file without the Kaola managed marker is user-owned: install
  fails closed and preserves its bytes; uninstall also preserves it byte-for-byte.

These claims follow the first-party Kimi agents/tool behavior already recorded in
`.cache/runtime-capability-research.md`: project agents live under `.kimi-code/agents/`, user agents
under `$KIMI_CODE_HOME/agents/`; custom profiles are direct dispatch targets; `tools` is an enforced
allowlist and omission grants all tools; native web-fetch is named `FetchURL`.

## Baseline and command

- Baseline HEAD: `ee43cc06813cf478bd08015f75f63875a7c74942`
- Shared-tree condition: production files contained the parent run's uncommitted Issue #1033 work;
  this test-author run changed no production file.
- Command: `node scripts/test-kimi-edition.js`
- Exit: `1`
- Summary: `kimi-edition test FAILED: 178 failure(s), 452 passed.`
- Raw captured output: `.cache/kimi-native-agent-red-run.log` (uncommitted run artifact)

## Failure signatures proving the intended RED

```text
FAIL: K0-native-agents: the generated .kimi/agents tree exists after sync --write — Kimi custom agents are the role carrier; role-contract Skills are not an acceptable stand-in
FAIL: K1: .kimi/skills/ dir set == the 3 canonical commands and contains NO kaola-role-* role Skills
FAIL: K5[kaola-workflow-finalize#0]: canonical tdd-guide dispatches DIRECTLY as subagent_type="kaola-role-tdd-guide" — got "coder"
FAIL: K5[kaola-workflow-finalize]: generated dispatch prompt carries no role-Skill bootstrap prefix
FAIL: K5-tools[knowledge-lookup]: tools allowlist exactly implements canonical capability requirements — expected ["Read","Write","Edit","Grep","Glob","WebSearch","FetchURL"], got null
FAIL: P1 (exact-set): deployed native agent set == the canonical 14 profiles — got []
FAIL: P1g (global exact-set): deployed native agent set == the canonical 14 profiles — got []
FAIL: P1o: project install fails closed on an unmanaged same-name native agent collision
FAIL: P1o-global: global install fails closed on an unmanaged same-name native agent collision
FAIL: P5c: a skill dir retired in an earlier release is SWEPT from a live install — still on disk: kaola-role-adversarial-verifier, ...
FAIL: K10-prune(a): --check output must name the retired native agent profile
FAIL: FA6[github]: .kimi/agents exact set is the canonical 14 native profiles — got []
```

The failures are against the real sync generator and real installer, with hermetic temporary HOME,
KIMI_CODE_HOME, and project targets. No mock substitutes for either subject.
