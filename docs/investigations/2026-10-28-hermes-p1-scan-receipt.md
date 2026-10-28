# Hermes P1 final-tree injection-scan receipt — KW #1125

- Date: 2026-10-28 22:17:10 CST
- Machine: MacBook Pro M5 Max, macOS 27.2 (26B123), arm64 — the machine used for the
  [#1124 P0 measurements](2026-10-28-hermes-p0-measurements.md).
- Hermes: `Hermes Agent v0.22.5 (2026.9.24) · stable · local bf0203a794a0`;
  install tree `~/.hermes/hermes-agent`; scanner Python 3.13.12.
- Scanner: `tools.skills_guard.SCANNER_VERSION = "skills-guard-v10"`;
  `tools.threat_patterns.scan_for_threats` in the `context`, `strict`, and `all` scopes.
- KW candidate: `6d7440f380c09d27542557837d59de7d6f9d4e3d` on `workflow/issue-1125`.
  The rendered inputs came from a `git archive` extraction of that commit, so the scanned source
  bytes are exactly the candidate tree; the worktree's only untracked entry was this receipt.
- Receipt commit: the commit that adds this file. It is documentation and is not an input to
  the scan; the scanned candidate is the parent commit above.

This receipt closes the E-SCAN traceability gap recorded in the
[#1125 Expert reconciliation](https://github.com/KaolaBrother/Kaola-Workflow/issues/1125#issuecomment-6471156381):
the earlier #1124 review recorded a similar scan, but no persisted input hashes and command
were bound to the final candidate. This run does **not** claim that historical rounds were
re-scanned; it records this run's scan of the candidate above, with the exact inputs.

## Scope and method

The P1 artifacts were rendered from a `git archive` extraction of the committed candidate into a
throwaway staging root and scanned there. Nothing was installed, and no installed carrier was read
or written.

- Three forge trees were rendered with the tree's own generator:
  `node scripts/sync-hermes-edition.js --forge=<github|gitlab|gitea> --tree-root=<stage> --write`.
  That is the same separate-staging path `install-hermes.sh` uses; Hermes does not implement
  `--print-tree-root` (that flag exits 1, `use --write or --check`).
- The `hermes-local` managed region was rendered from
  `templates/global/kaola-workflow-global.md` through
  `renderContract({ source, target })` in `scripts/kaola-workflow-global-contract.js`, using the
  `hermes-local` target from `templates/global/runtime-contract-adapters.json`, and wrapped in
  the contract's `KW-GLOBAL-CONTRACT-MANAGED-START/END` markers.
- `tools.skills_guard.scan_skill(<skill dir>)` scanned each rendered skill directory exactly as
  the #1124 review did (default `community` trust). `scan_skill_cached` was deliberately not
  used because it writes a `.scan-cache` beside the input.
- `tools.threat_patterns.scan_for_threats(<region>, scope=...)` scanned the region text in the
  `context`, `strict`, and `all` scopes.
- Isolation: the scan received only paths under a `mktemp -d` root. No `HERMES_HOME` path,
  `~/.hermes/skills`, `~/.hermes/SOUL.md`, `config.yaml`, `.env`, or credential file was passed
  to either scanner. The staging root was removed after the run.

## Reproduction

```sh
cd "$(git rev-parse --show-toplevel)"
candidate=6d7440f380c09d27542557837d59de7d6f9d4e3d
source="$(mktemp -d "${TMPDIR:-/tmp}/kw-hermes-src.XXXXXX")"
stage="$(mktemp -d "${TMPDIR:-/tmp}/kw-hermes-scan-final.XXXXXX")"
git archive "$candidate" | tar -x -C "$source"
cd "$source"

for f in github gitlab gitea; do
  node scripts/sync-hermes-edition.js --forge="$f" --tree-root="$stage" --write
done

node - "$stage/hermes-local-managed-region.md" <<'NODE'
const fs = require('fs');
const contract = require('./scripts/kaola-workflow-global-contract.js');
const registry = JSON.parse(fs.readFileSync('templates/global/runtime-contract-adapters.json', 'utf8'));
const target = registry.targets.find(t => t.id === 'hermes-local');
const source = fs.readFileSync('templates/global/kaola-workflow-global.md', 'utf8');
const rendered = contract.renderContract({ source, target });
fs.writeFileSync(process.argv[2],
  Buffer.concat([Buffer.from(contract.START + '\n'), rendered, Buffer.from(contract.END)]));
NODE

PYTHONPATH="$HOME/.hermes/hermes-agent" python3 - "$stage" <<'PY'
import json, sys, hashlib, os
from pathlib import Path
from tools import skills_guard, threat_patterns

root = Path(sys.argv[1])
out = {
    "scanner": {
        "skills_guard": skills_guard.SCANNER_VERSION,
        "threat_patterns_module": "tools.threat_patterns",
        "python": sys.version.split()[0],
    },
    "skills": [],
    "managed_region": {},
}
for skill_dir in sorted(root.glob(".kw-hermes*/skills/*")):
    result = skills_guard.scan_skill(skill_dir)
    out["skills"].append({
        "skill": str(skill_dir.relative_to(root)),
        "verdict": result.verdict,
        "trust_level": result.trust_level,
        "findings": [{"pattern_id": f.pattern_id, "severity": f.severity,
                      "category": f.category, "file": f.file, "line": f.line,
                      "description": f.description} for f in result.findings],
        "summary": result.summary,
    })
region_path = root / "hermes-local-managed-region.md"
data = region_path.read_bytes()
out["managed_region"] = {
    "path": region_path.name, "bytes": len(data),
    "sha256": hashlib.sha256(data).hexdigest(),
    "scopes": {s: threat_patterns.scan_for_threats(data.decode("utf-8"), scope=s)
               for s in ("context", "strict", "all")},
}
print(json.dumps(out, indent=2, ensure_ascii=False))
PY
```

## Input hashes

SHA-256 over the exact bytes scanned. The skills tree is per forge; the managed region is
forge-independent.

| Input | Bytes | SHA-256 |
|---|---:|---|
| `.kw-hermes/skills/kaola-workflow-finalize/SKILL.md` | 16170 | `05c63639c7afc33efe2c645baead0bc71423c9719b19ad6badc777de01d03bf2` |
| `.kw-hermes/skills/workflow-init/SKILL.md` | 5539 | `c7d0b1aa47bf85ebf015b87fa8d63c3f19e2aa1f8b1e6c80e3f40a713da40860` |
| `.kw-hermes/skills/workflow-next/SKILL.md` | 11075 | `e5e053e98252cd63134a082044a976a2265d7bea3d0e212912387813d5169e62` |
| `.kw-hermes-gitlab/skills/kaola-workflow-finalize/SKILL.md` | 16236 | `9ce7bf8c03e188b2488a528da56815f2c686a93b5265e1f2b1c71261f6b9ef96` |
| `.kw-hermes-gitlab/skills/workflow-init/SKILL.md` | 5545 | `1fc79e8220178c85a3ab0814c4749f66fa428aa704a413741b2ddb99db7c97c7` |
| `.kw-hermes-gitlab/skills/workflow-next/SKILL.md` | 11211 | `3aaf41597dec43b1b89b4595299ad6d8c1e6ae2170139ed5ab9c223a63a0af2e` |
| `.kw-hermes-gitea/skills/kaola-workflow-finalize/SKILL.md` | 16122 | `b6f29580616150300f089e6b30df727df2ffbe50f18df7fe1f3cfd73c3bbb742` |
| `.kw-hermes-gitea/skills/workflow-init/SKILL.md` | 5536 | `ea6b22bb60596705025c75fd9f73c057b6fc275fbf19be727b9e98c50808276b` |
| `.kw-hermes-gitea/skills/workflow-next/SKILL.md` | 12153 | `31f24a383af1f0f6ba938ef16e8c52dab88e271c6a022590eb4d25965ed00275` |
| `hermes-local-managed-region.md` | 3368 | `c268ab9f67163d2b3c879544bb6fdb1656690af0b8c14afed1323380a6627e05` |

## Results

`scan_skill` verdicts and findings for all nine rendered skills. Every finding is
`agent_config_ref` at `low` severity in the `persistence` category — the scanner's own
description is "references agent config files (informational; only modification intent is
scored)". No `caution` or `dangerous` verdict occurred.

| Forge | Skill | Verdict | Findings |
|---|---|---|---|
| github | `kaola-workflow-finalize` | `safe` | 1 × `agent_config_ref` / low (line 14) |
| github | `workflow-init` | `safe` | 9 × `agent_config_ref` / low (lines 3, 29–31, 61–63, 65–66) |
| github | `workflow-next` | `safe` | 2 × `agent_config_ref` / low (lines 17, 49) |
| gitlab | `kaola-workflow-finalize` | `safe` | 1 × `agent_config_ref` / low (line 14) |
| gitlab | `workflow-init` | `safe` | 9 × `agent_config_ref` / low (lines 3, 29–31, 61–63, 65–66) |
| gitlab | `workflow-next` | `safe` | 2 × `agent_config_ref` / low (lines 17, 49) |
| gitea | `kaola-workflow-finalize` | `safe` | 1 × `agent_config_ref` / low (line 14) |
| gitea | `workflow-init` | `safe` | 9 × `agent_config_ref` / low (lines 3, 29–31, 61–63, 65–66) |
| gitea | `workflow-next` | `safe` | 2 × `agent_config_ref` / low (lines 17, 49) |

Managed region (`hermes-local-managed-region.md`, SHA-256
`c268ab9f67163d2b3c879544bb6fdb1656690af0b8c14afed1323380a6627e05`):

| Scope | Matches |
|---|---|
| `context` | `[]` |
| `strict` | `[]` |
| `all` | `[]` |

## Reading

- This is a read-only static-regex scan of the rendered P1 artifacts; it is not a live Hermes
  execution, an install, or a P2/P3 acceptance.
- "`safe`" is the scanner's verdict under the default `community` trust policy. It does not mean
  "zero findings": all 36 findings are low-severity informational `agent_config_ref` matches on
  references to agent-config files (`AGENTS.md`, `CLAUDE.md`, and related names) in the canonical
  workflow text, not modification intent.
- The managed region is clean in all three threat-pattern scopes, so the KW HTML-comment managed
  markers do not trip `html_comment_injection`, and the rendered region carries no matched
  injection/exfiltration pattern.
- The Hermes scanner exists on this machine, so this is a real scan, not the "scanner absent"
  N/A case in T9. It does not claim a scan of any installed tree or of any other candidate.
