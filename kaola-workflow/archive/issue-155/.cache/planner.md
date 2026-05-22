# Planner — issue-155: fail-closed remote validation

## Recommended Option: Approach A

**New `remote_unavailable` verdict + sibling refusal branch**

---

## Option A (RECOMMENDED) — New `remote_unavailable` verdict

**What changes, where:**

1. **Classifier `cmdClassify` catch blocks** (GitHub `:357`; GitLab `:298`; Gitea equivalent):
   Replace `{ verdict: 'green', reasoning: 'fetch failed; defaulting to green' }` with
   `{ verdict: 'remote_unavailable', reasoning: '<forge> issue fetch failed; refusing to claim outside KAOLA_WORKFLOW_OFFLINE=1' }`
   OFFLINE early-return preserved untouched.

2. **GitLab/Gitea classifier `classifyIssue()` direct-call catch** (`:256` GitLab, Gitea equivalent):
   Same swap to `remote_unavailable`.

3. **GitHub claim wrapper `classifyIssue()`** (`claim.js:297-312`): all 3 leak points → `remote_unavailable`.
   Keep `e.status === 2 → owned` branch unchanged.
   GitLab/Gitea wrappers (`:249-255` GitLab) get the same swap on their single catch.

4. **`claimExplicitTarget`** (all three forges): add sibling branch after `red` branch:
   `if (classified.verdict === 'remote_unavailable') return { status: 'user_target_remote_unavailable', claim: 'none', issue: targetIssue, project: ..., reasoning: classified.reasoning }`

5. **`claimProject:326` narrow guard** (GitHub primary; mirror in GitLab/Gitea):
   Add `issueClosureProbe(issueNumber)` returning `{ closed, available }`.
   When `!OFFLINE && !available` → return `{ status: 'user_target_remote_unavailable', ... }`.
   Leave `issueIsClosed` signature and 4 other callers untouched.

**Pros:**
- Mirrors existing pattern exactly (verdict-shaped output, sibling refusal branch, untouched `cmdStartup` mapper)
- New verdict is orthogonal to green/yellow/red axis
- Surgical — `issueIsClosed` and safe callers unchanged
- `cmdPickNext`/`cmdBootstrap` inherit fix free via `claimExplicitTarget`

**Cons:**
- Two distinct code shapes to touch (classifier output paths + `claimProject` probe) because two independent paths reach the unsafe gate
- Slight asymmetry: GitHub has 3 leak points, GitLab/Gitea have 1

**Risk:** Low  
**Complexity:** Medium-low (~6 edited functions across 6 files + new tiny helper + tests)

---

## Option B — Pre-flight remote probe in `claimExplicitTarget`

Add forge reachability check at top of `claimExplicitTarget` before calling classifier.

**Pros:** Single conceptual chokepoint  
**Cons:** Double round-trip (classifier also fetches); doesn't cover `cmdClaim` direct path; introduces new "is remote up" concept with no precedent; 404 vs network-down hard to distinguish  
**Risk:** Medium  
**Complexity:** Medium-high; least pattern-aligned

---

## Option C — Tri-state `issueIsClosed` returning `{ closed, available }`

Change `issueIsClosed` signature and update all callers.

**Pros:** Central source of truth  
**Cons:** Blast radius hits 6+ call sites whose fail-open is *correct*; forces re-deciding behavior at each; does not touch classifier path at all (AC#1/#2 still need separate work); violates "surgical changes" rule  
**Risk:** High  
**Complexity:** High

---

## Verdict Literal: `remote_unavailable`

`unknown` is already overloaded as a `status` default and subcommand-error text — collision-free as a verdict but reads as a generic fallback. `remote_unavailable` is cleaner and self-documenting as a deliberate refusal.

---

## Explicit Out-of-Scope

- Do NOT change `issueIsClosed` signature or its 4 safe callers
- Do NOT introduce shared remote-health module, retry layer, or caching
- Do NOT change OFFLINE semantics
- Do NOT add new CLI flags or subcommands
- Do NOT edit `cmdPickNext`/`cmdBootstrap` directly (they inherit via `claimExplicitTarget`)
- Do NOT touch `kaola-workflow-roadmap.js` drift detection (correctly fail-open)

---

## Test Strategy

Per forge (GitHub, GitLab, Gitea):
1. Issue-view shim exits non-zero → classifier verdict is `remote_unavailable`; startup refuses with `user_target_remote_unavailable` and exit code 1
2. Forge CLI/token absent → same refusal
3. (GitHub only) classifier subprocess crash propagates as `remote_unavailable`, not `green` (covers 3-leak wrapper)
4. Regression: existing OFFLINE tests still return expected verdicts (AC #5)

---

## Confirmed Facts (from live code inspection during analysis)

- `remote_unavailable` is clean — never used as a verdict anywhere
- `cmdClaim` at `claim.js:698` calls `claimProject` directly, bypassing classifier — `claimProject:326` guard is required
- `issueIsClosed` has 5 callers; fail-open is correct for 4; only `claimProject:326` is routing-unsafe
- `cmdStartup` auto-maps `result.status → verdict` — no mapper changes needed for new status

## Open Question for Implementation

Verify whether GitLab/Gitea `cmdClaim` direct path reaches an `issueIsClosed`-equivalent gate. If a forge's `claimProject` doesn't call a closure check, `claimProject` guard is no-op for that forge.
