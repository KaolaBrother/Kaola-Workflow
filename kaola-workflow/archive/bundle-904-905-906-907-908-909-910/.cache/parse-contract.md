# Porcelain/path-stream parse contract (kernel: `kaola-workflow-adaptive-schema.js`)

Status: **PUBLISHED 2026-08-02, implemented and verified.** If this file and the kernel ever
disagree, the kernel is right and this file is stale — say so loudly.

Owner: the kernel implementer (`impl-parse`). Call sites in `claim.js`, `sink-merge.js`,
`run-chains.js` are owned by other agents; this is what they code against.

---

## 1. `parsePorcelainPaths(statusText) -> string[]`

**Name and signature are UNCHANGED.** Still exported from `kaola-workflow-adaptive-schema.js`.
One string in, an array of repo-relative forward-slash paths out.

**What changed: the returned path is now the file's LITERAL name.** C-quoting is *decoded* (it used
to be merely unwrapped, leaving `\303\266` and `\"` in the string) and **nothing is trimmed** (the
`.trim()` ate trailing spaces). `git add -- <returned path>` now matches the file on disk.

### Callers: `-z` is RECOMMENDED, not required

The function **auto-detects the record format** by looking for a NUL in the input:

| input | detected as | rename record |
|---|---|---|
| contains `\0` | `git status --porcelain -z` | `XY <dest>\0<source>\0` — **dest first**, no arrow |
| no `\0` (incl. `''`) | `git status --porcelain` (LF) | `XY <source> -> <dest>` — one record |

Both are parsed **losslessly**, so you may add `-z` to your `git status` invocation or not:

- **Add `-z` where you can.** It is unambiguous. The one case LF cannot resolve is an *unquoted*
  source path that literally contains ` -> ` (git itself recommends `-z` for exactly this).
- **Not adding `-z` is safe** for `git status --porcelain`. Measured on git 2.50.1: status quotes
  every path with `"`, `\`, a control char, or a **leading/trailing space**, and (unless
  `core.quotePath=false`) every non-ASCII byte. The decoder reverses all of it.
- **`core.quotePath=false` is handled.** Measured: it stops quoting non-ASCII but still quotes
  `"`, `\`, TAB and leading/trailing space. Raw UTF-8 inside a quoted field decodes correctly.

There is **no flag, no option object, and no second entry point.** Passing `-z` output to the old
call shape just works.

### Return value

- Rename/copy → the **destination** only, in both formats. The source path is never returned.
  (`-z`: the source is the following record and is consumed, not emitted.)
- Untracked (`??`) and tracked (`M`/`A`/`D`/`U`/…) alike; filter untracked at the git invocation
  (`-uall` / `-uno`), not here.
- Order is git's order. No sort, no de-dup.
- Paths are returned verbatim — no `trim`, no `./` stripping, no separator rewriting.

### Malformed / edge input

Never throws. `''`, `null`, `undefined` → `[]`. A record shorter than 3 chars, or one whose path
field is empty, is skipped. A field that opens with `"` but has no closing `"` is treated as an
ordinary unquoted name and returned verbatim. An escape git does not emit (e.g. `\q`) yields the
escaped character itself.

**Not handled (deliberate, and stated so you do not assume it):** a trailing `\r` on an LF record
is NOT stripped. The old `.trim()` removed it; no CR-terminated porcelain has ever been observed
here (darwin/linux only) and git does not emit one, so nothing was added for it.

---

## 2. `splitNulPaths(text) -> string[]`  — NEW export

```js
const { splitNulPaths } = require('./kaola-workflow-adaptive-schema.js');
const out = execFileSync('git', ['-C', root, 'diff', '--name-only', '-z', base + '...HEAD'], { encoding: 'utf8' });
const paths = splitNulPaths(out);   // verbatim, never quoted, never trimmed
```

**This is the conversion for every plain path stream:** `diff --name-only -z`,
`diff --cached --name-only -z`, `log --name-only -z`, `ls-files --others -z`, `ls-tree -r -z`,
`worktree list --porcelain -z`. Use it instead of `out.split('\n').map(s => s.trim()).filter(Boolean)`
so there is one NUL splitter, not three.

Semantics: `String(text||'').split('\0').filter(Boolean)` — empty records dropped (a path is never
empty), everything else verbatim. Never throws.

**Measured caveat for `diff --name-only -z`:** it emits **one field per record** and carries **no
rename arrow and no source path**, so `splitNulPaths` is the whole parser for it. Do NOT hand
`diff --name-only -z` output to `parsePorcelainPaths` — that function expects the `XY ` status
column and would eat the first 3 characters of every path.

---

## 3. `unquoteCStyle(field) -> string`  — NEW export

Decodes ONE git C-quoted field (`"n\303\266te.md"` → `nöte.md`). For a stream you genuinely cannot
put `-z` on. Unquoted input is returned unchanged, so it is safe to apply unconditionally to a
non-`-z` `--name-only` line.

**One thing it cannot fix:** `git diff --name-only` (unlike `git status --porcelain`) does **NOT**
quote a leading/trailing space — measured. So for `diff`, unquoting alone is not lossless if you
also `.trim()`. Use `-z` + `splitNulPaths`, or unquote **and do not trim**.

---

## 4. Not changed (and why), so nobody waits on it

`computeCodeTreeHash` (`ls-tree -r`), `filterVisiblePaths`, `visibleChangedPathsSince`,
`headAdvanceIsValidationInvisible` in the same kernel file still split on `\n` and still `.trim()`.
That is deliberate: those feed a *hash* and a visibility classifier that the producer and the gate
both compute through the same one function, so a quoted path is consistent on both sides
(fail-closed, worst case a spurious `chains_stale`). Converting them would change
`codeTreeHash` inputs and could stale live receipts — an unforced risk with no observed failure.
Out of scope here; if someone wants it, it is a separate, deliberate decision.
