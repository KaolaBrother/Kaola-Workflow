# Task 3: Gitea test harness — add 2 withForge blocks

## File Modified
`plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`

## Insertions (lines 545-588)
Block 1: kw-gt-fast-fence-heading-, IIDs 30/31, project fast-fence-heading-project
  ## Scope: ```sh\n## Some Heading\n``` then - Write Set path
Block 2: kw-gt-fast-fence-mixed-, IIDs 32/33, project fast-fence-mixed-project
  ## Scope: ```sh\n~~~\n## Heading\n``` then - Write Set path

## RED Evidence (failing-first)
- Block 1: AssertionError: 'green' !== 'red' (## Some Heading truncates section body)
- Block 2: AssertionError: 'green' !== 'red' (naive toggle closes fence on ~~~)

## Status
COMPLETE (failing-first confirmed for both blocks)
