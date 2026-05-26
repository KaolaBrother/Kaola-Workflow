docs-lookup: N/A - internal patterns sufficient

The fix is passing `{ cwd: mainRoot }` to subprocess execFileSync calls for `gh`/`glab`/`tea`.
No external library API questions require documentation lookup.
The forge CLI CWD-sensitivity behavior is already confirmed by the issue reproduction and code reading.
