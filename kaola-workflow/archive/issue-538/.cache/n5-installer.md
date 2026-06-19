evidence-binding: n5-installer 33c71a64bac5
RED: AC1: bare install must write installed_paths:[], got {"parallel_mode":"auto","enable_adaptive":true} — AssertionError thrown against unmodified install.sh (pre-impl); test exited nonzero at AC1 assertion.

GREEN: all 5 ACs pass — node scripts/test-install-adaptive-config.js: "Install adaptive-config tests passed"; bash -n install.sh: parse OK; bash -n uninstall.sh: parse OK. 5/5 AC assertions green (AC1 default adaptive-only, AC2a --with-fast, AC2b --with-full, AC3 re-install preserves, AC4 uninstall+reinstall reset, AC5 --enable-adaptive warn-and-ignore).
