# docs node evidence — issue #268 (G-SEL-1b blank selector_source typed refusal)

## What was added and where

**File:** `/Users/ylpromax5/Workspace/Kaola-Workflow/docs/api.md`

**Section:** Grammar paragraph, G-SEL rules block (line 256 of original file)

**Location within section:** Inside the `G-SEL-1:` clause, immediately after the `selector_source` requirement parenthetical (`...listed in every arm's \`depends_on\`)`) and before the `additionally, group names are a **global namespace**` clause (#271). This placement is topically correct because G-SEL-1b is the `selector_source` requirement sub-rule.

**Approximate line:** 256 (the single dense Grammar paragraph that contains all G-SEL rules inline).

## Exact text inserted

The following text was inserted between `...listed in every arm's \`depends_on\`)` and `; additionally, group names are a **global namespace**`:

```
; every arm in a `select(<group>)` group MUST carry a non-empty `selector_source` value — a blank arm is a typed refusal: `G-SEL-1b: arm "<id>" in select group "<group>" has no selector_source declared` (issue #268; additive — no existing gate is relaxed)
```

The insertion mirrors the inline style used for the #271 G-SEL-1 refusal message: `the validator emits a typed refusal: <message> (issue #NNN; additive — no existing gate is relaxed)`.

The exact refusal message matches the validator source at `scripts/kaola-workflow-plan-validator.js` line 553:
```
G-SEL-1b: arm "<id>" in select group "<group>" has no selector_source declared
```

## Deviations

None. The task called for documenting the new typed-refusal message in the G-SEL-1b section. There is no separate G-SEL-1b block in `docs/api.md` — the G-SEL rules are documented inline in one paragraph. The insertion was placed at the semantically correct position within the G-SEL-1 clause (the `selector_source` requirement), adjacent to the existing description of what the `selector_source` column must contain. No other part of `docs/api.md` was changed.

## verdict: pass
## findings_blocking: 0
