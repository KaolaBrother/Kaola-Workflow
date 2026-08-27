## Final measured Cursor surface correction and closure evidence

PR #1041's final candidate is `58d26e916dd9313f2aa5e671ea463cca1792895e` against base
`b78d006c28a3849b3bcbceffdd1ebc07f2ef5115`. Later measurements establish the following final
contract and supersede earlier issue premises where they differ.

- `install-all.sh` installs only the computer where it runs. It exposes no Cursor Cloud deployment
  mode and rejects `--cloud` before any installer side effect.
- Only an Agent that has established it is inside Cursor Cloud environment setup may install the
  Cloud Workflow directly for that remote machine plus the explicit selected repository. The Agent
  tests and reports the exact Build; the user manually clicks Save; then a new top-level Cloud Agent
  opens in the same repository and verifies that Build and live catalog.
- A saved user-global-only Cloud Build is **not** sufficient: Build
  `bld-20260827-1fd163c3-a8f2-475d-9603-7da988673ee3` still exposed a built-in-only catalog. The
  positive measured carrier installed both remote authority and explicit selected repository in
  Build `bld-20260827-56284e4a-bc0c-4cb6-b873-a48d180693e2`; after manual Save, same-repository
  parent `bc-3e6bd3bd-f310-47cd-a9cb-358cf802f16d` exposed all 14 Kaola roles and exact implementer
  child `bc-7d00ddad-23f3-5e69-8f9a-1c326b051a49` returned the recorded success token.
- Standalone Cursor CLI, Cursor App local IDE, and App-started Cloud are separate surfaces. CLI has
  explicit target materialization and exact named dispatch; local App independently exposed the
  named catalog and exact dispatch, with child model/profile provenance left unknown; Cloud does not
  inherit local-home or CLI facts.
- Global authority and explicit project materialization are hash/receipt/target bound,
  collision- and symlink-safe, and uninstall only unchanged owned bytes. Doctor keeps unobserved
  current Build/catalog unknown while retaining historical evidence as typed history.
- Full -> no-scripts -> uninstall, fresh partial -> ordinary project promotion, and full -> missing
  authority hook -> no-scripts -> promotion all converge. The last transition preserves the active
  global live-hook byte/hash, receipt ownership, and `sessionStart`, while restoring authority and
  project hooks; project/global uninstall ordering remains coherent.

Final validation on exact candidate `58d26e91`: Cursor 788, runtime architecture 798, install-all
275, routing 520, walkthrough 179/179, and all four producer chains green once with no waiver. Exact
codeTreeHash is `b737f3efdbc2ad3f9b01737e0b2560b76db0a1445b4e20a1b249bd33b8c1fa54`. Independent code review
and detached-clone adversarial verification both PASS with no findings.

PR #1041 is ready for the workflow sink and closes this issue with #1037 as one integrated bundle.
