docs-lookup: N/A - internal patterns sufficient

All fixes use standard Node.js (`fs.renameSync`, regex replace) and standard git (`git mv`) — no external library or API docs needed. Existing codebase patterns (claim.js:665-668, claim.js:1644) provide all necessary reference implementations.
