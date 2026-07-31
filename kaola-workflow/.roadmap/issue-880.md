issue: #880
title: Delete the zero-consumer exports left in the Oracle Kernel after the ADR 0017 build
status: open
workflow_project: issue-880
next_step: Audit every one of the kernel's 95 exports for consumers across canonical, the four editions, tests, templates, hooks and installers; delete what is dead, unexport what is only used internally, fix the two duplicate export keys and the orphaned comment blocks. All four kernel copies must stay byte-identical, and the contract-validator pins move with the deletion.
