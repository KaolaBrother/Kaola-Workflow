# R1 review repair — shared-marker orphan rejection

Finding identity: `R1` / `P2`, shared-marker orphan rejection not mutation-proven.

Baseline SHA: `89d171ef71c65b5d8841e98c9b48f7e52b10a41a`

## Test-only change

Changed only:

- `scripts/test-route-reachability.js`

The existing unknown-marker reverse-sentinel fixture remains in place. Two focused in-memory
`checkManifest` fixtures now exercise the two branches introduced by the `markerToBlocks` mapping:

1. `shared-marker-non-obligated` uses the known shared marker
   `<!-- PIN: main-authored-handoff -->` on the in-scope skill surface while its one command-only
   manifest block obligates only the command surface. The forward pass is asserted clean
   (`obligatedCount === 1`), and the fixture requires exactly the
   `matches.length === 0` message:
   `orphan-surface: marker "<!-- PIN: main-authored-handoff -->" on skl/foo/SKILL.md is not
   obligated by any of the 1 manifest blocks`.
2. `shared-marker-ambiguity` uses two command-only blocks with the same known marker and the same
   observed command surface. Both forward obligations are asserted clean
   (`obligatedCount === 2`), and the fixture requires exactly the
   `matches.length > 1` message naming both `shared-marker-overlap-a` and
   `shared-marker-overlap-b`.

Each assertion requires one and only one exact failure, so a generic nonzero failure, forward
failure, unknown-marker path, or missing branch cannot satisfy it.

## Clean validation

Commands were run from the candidate worktree
`/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1029`:

```text
$ node scripts/test-route-reachability.js
Route-reachability test passed (825 assertions).
exit code: 0

$ node scripts/generate-routing-surfaces.js --check
generate-routing-surfaces --check: all 18 surfaces byte-match the skeleton.
exit code: 0

$ git diff --check
exit code: 0
```

The route assertion count increased from 823 to 825: one exact assertion for each new branch
fixture. The generator check remains read-only and green for all 18 tracked surfaces.

## Direct branch-disable proof

To prove the fixtures are tied to the intended branches, each probe read the committed test source
into memory, replaced only one branch condition in the in-memory source, and compiled it with the
actual test filename. No worktree file was edited. The `matches.length === 0` probe was:

```text
$ node -e '
const fs = require("fs");
const path = require("path");
const Module = require("module");
const file = path.resolve("scripts/test-route-reachability.js");
let source = fs.readFileSync(file, "utf8");
const needle = "if (matches.length === 0) {";
if (!source.includes(needle)) throw new Error("matches.length === 0 branch not found");
source = source.replace(needle, "if (false) {");
const compiled = new Module(file, module);
compiled.filename = file;
compiled.paths = Module._nodeModulePaths(path.dirname(file));
compiled._compile(source, file);
'
FAIL: RED-PROOF shared-marker-non-obligated: the known shared marker must take the exact matches.length === 0 rejection, with clean forward obligations; got []

Route-reachability test FAILED: 1 failure(s), 824 passed.
exit code: 1
```

The `matches.length > 1` probe was:

```text
$ node -e '
const fs = require("fs");
const path = require("path");
const Module = require("module");
const file = path.resolve("scripts/test-route-reachability.js");
let source = fs.readFileSync(file, "utf8");
const needle = "} else if (matches.length > 1) {";
if (!source.includes(needle)) throw new Error("matches.length > 1 branch not found");
source = source.replace(needle, "} else if (false) {");
const compiled = new Module(file, module);
compiled.filename = file;
compiled.paths = Module._nodeModulePaths(path.dirname(file));
compiled._compile(source, file);
'
FAIL: RED-PROOF shared-marker-ambiguity: overlapping known-marker blocks must take the exact matches.length > 1 rejection and name both blocks; got []

Route-reachability test FAILED: 1 failure(s), 824 passed.
exit code: 1
```

Thus both new rejection branches are independently armed, while the accepted disjoint
`next`/`finalize` shared-marker behavior and the existing unknown-marker fixture remain covered.
