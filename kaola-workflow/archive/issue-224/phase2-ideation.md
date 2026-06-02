# Phase 2 - Ideation: issue-224

## Decision #17 — issue-number authority (the genuine design choice; why this is full-path)
### Options
- A (chosen): **filename authority** — `readRoadmapIssues` derives the number from the filename.
- B: field authority — keep reading `issue:`, make filename-keyed paths read the field instead.
### Decision: A (filename authority).
Rationale:
- **No legitimate divergence exists.** Every writer hard-syncs the field to the filename: `cmdInitIssue` (`'issue: #' + n` with the same `n` as `issue-${n}.md`), `cmdMigrate`, and forge `writeIssueRecord` (same `issueIid`). There is no code path or workflow where the field intentionally differs — the field is redundant data that can only drift, never inform.
- **The rest of the toolchain is already filename-keyed:** closure (claim.js :560/:583), `cmdProjectName` (:313), `projectNameForIssue` (:113). Filename authority makes `readRoadmapIssues` agree with everything else; field authority is the lone outlier.
- **claim.js needs NO edit** — verified it never reads the `issue:` field. #17 is a one-side roadmap.js fix.
- Downstream consumers (`validateRemote`, `cmdValidate`) inherit the fix because they consume `readRoadmapIssues` output.

## Decision #16 — unify with #17 (no separate warning)
Once the number comes from the filename, a file missing the `issue:` field can no longer be dropped (there is nothing to drop on). The `L64` filename filter `/^issue-\d+\.md$/` already guarantees a valid number before the map, so the trailing record filter `.filter(d => d.issue && /^#\d+$/.test(d.issue))` becomes dead and is removed. #16's "fall back to filename" and #17's "filename authority" are the SAME change. No stderr warning is added — there is no malformed-but-present case left to warn about (a malformed filename is excluded by L64 before the map). This removes the silent-drop path entirely rather than papering over it.

## Decision #18 — unescape on the read side, regex literal
### Decision
Unescape in `parseRoadmapTable` (the read side) so any future reader of the table is correct, not just `cmdMigrate`. Use the regex LITERAL `/\\\|/g` with replacement `'|'`.
- The issue's suggested `replace(/\\\|/g, '|')` is CORRECT as a regex literal (verified: `"a\|b".replace(/\\\|/g,'|') === "a|b"`). The triage's "wrong escaping" concern is real ONLY if someone string-constructs it via `new RegExp('\\\|')`. **Use the literal; do not string-construct.**
- Apply to the three columns `buildTableRow` escapes — `title` (match[2]), `workflow_project` (match[4]), `next_step` (match[5]) — symmetric inverse of the write side. Do NOT touch `issue` (a number) or `status` (never escaped).
- Root + Codex ONLY (forge ports have no `cmdMigrate`, so no round-trip; their `parseRoadmapTable` feeds only a `length===0` guard — unescaping wouldn't change a row count). Leaving forge `parseRoadmapTable` unchanged is safe and correct.

## Cross-cutting: byte-sync
root↔Codex `roadmap.js` enforced byte-identical (validate-script-sync); edit both to the same bytes (edit root, cp to Codex). gitlab/gitea are forge-adapted twins (different shas) → two parallel hand-edits for #16+#17 only. claim.js untouched.
