# For the test author (`aab0cc2d7354ed326`) — the drift feature's final shape

From implementer B. This is the settled behaviour of `install-opencode.sh` post-pivot, written so you
can pin it without guessing. **I have no way to message you directly** — please treat this file as
the message; the orchestrator was asked to relay it.

## What the feature is now

Post-pivot the generator ships **no role set**, so the old comparison (existing roles vs emitted
roles) has no subject and its "missing" half is gone. The check is the **mirror image**: it reports
what the *existing* config still carries that no longer does anything.

**Subject**: an `agent.<role>` entry carrying **`variant`** or **`options`**. Those are the only two
per-role shapes this edition ever wrote (`variant` pre-#927, `options` in #927), and neither has any
effect now — a subagent runs the model and reasoning effort of the session that dispatched it.

**Explicitly NOT the subject**: an entry that only pins a `model`. That is the user's own supported
choice (`KAOLA_OPENCODE_STANDARD_MODEL` / `_REASONING_MODEL`) and must not be named or counted.
This is the over-fire boundary and it is the one I would most want pinned.

**No baseline is computed.** The check reads only the file on disk — no renderer call, no inherited
model, no role roster. That is what makes it survive the deletion.

## Observable contract

| input | output |
|---|---|
| config with ≥1 entry carrying `variant` or `options` | drift report, entries named, sorted, exit 0, **file byte-identical** |
| config whose entries only pin `model` | **silent** |
| config with no `agent` block | **silent** |
| config the generator itself just wrote | **silent** |
| unreadable / non-JSON config | **silent**, exit 0, never fails the install |
| `agent` present but an array / wrong shape | **silent**, no crash |

Verbatim output on a stale config (`planner` with `options`, `contractor` with `variant`, `mine` with
only a `model`):

```
  ⚠ Config drift: it pins per-role reasoning effort, which no longer does anything.
      2 role entry(ies) carrying an inert effort setting: contractor, planner
      A subagent runs the model and reasoning effort of the session that dispatched it, so
      these are left over from an older install. An entry that only pins a model is yours
      and is not counted here.
      Nothing was changed. Re-run with --adopt-config to adopt it: that REPLACES this
      file rather than merging (hand edits and model pins go), after copying it to opencode.json.<timestamp>.bak.
```

**Wording is not stable — please do not pin the sentences.** What is stable and worth pinning: the
entry names appear, a name whose entry only pins `model` does not, the file is unchanged, exit 0, an
opt-in flag is named in the output and that flag actually adopts.

## `--adopt-config`, unchanged from before the pivot

Exit 0; replaces the whole file with the generator's output (no merge); copies the previous file to
`<config>.<timestamp>.bak` **first**; the backup path never collides (`-1`, `-2`, … on a same-second
re-run — measured, a plain timestamp did collide); an unwritable backup aborts with exit 1 and leaves
the config untouched.

**Two things that used to exist and are gone**, so please delete rather than re-base any pin on them:
- the tier-protection refusal (`Refusing to replace them with none`) — post-deletion it fired for
  every user with an agent block;
- the `KAOLA_OPENCODE_INHERIT_MODEL` resolution — measured inert: with it removed, the seeded config
  is byte-identical and the install output identical whether or not the variable is set.

## Coverage I measured, in case it helps you aim

- A27's **extra-role** assertions already cover the new detector: blinding it turns them red (3 reds).
- A27's **missing-role** assertions (3, currently failing) pin the deleted role set.
- **Over-firing is not covered by anything.** With the `variant`/`options` filter removed, the suite
  stays at the same failure count while the installer starts naming a user's own `model`-pin entry.
  A negative-control fixture whose `agent` entries carry only `model` would close that.
