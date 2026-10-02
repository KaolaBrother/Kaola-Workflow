#!/usr/bin/env node
// sink-pr — the GitHub request sink. #1098 contract, in one paragraph:
//   All project-directory reads/writes target the MAIN checkout (a linked dev worktree resolving
//   its own toplevel lost the archive, re-created a live folder inside the worktree, and bypassed
//   the keep-open guard). An existing PR is looked up BEFORE any push: the durable record
//   (.cache/sink-pr-result.json, then the state's pr_url) identifies it, else `gh pr list` for
//   this head/base. An OPEN PR is reused (its base and every member's `Closes #n` verified — a
//   bundle closes all or none); a MERGED PR reports `sink_pr: already_merged` and touches nothing
//   (watch-pr reconciles it); a CLOSED-unmerged PR is refused as pr_closed_unmerged. Writes are
//   idempotent so a re-entry mints nothing new. The run's archive rides the PR itself: the
//   archive commit is built from the main checkout's working tree through the kernel's private
//   index onto the branch tip, the local branch is advanced (ff-only where checked out, CAS
//   update-ref otherwise), then pushed — never the default branch, never a force. The main
//   checkout's index and HEAD are never touched. The final stdout line is machine-readable:
//   `sink_pr: created | reused | already_merged`. Legacy keep-open stays merge-sink-only
//   (#336, #1098 D4=(a)): issue_action: comment_keep_open without the explicit mode below is
//   still refused. #1113 adds one supported exception, GitHub only: --keep-open-pr
//   explicit_singleton together with durable keep_open_pr: explicit_singleton, a singleton
//   issue, and sink: pr. That mode writes no closing linkage and never queues or auto-merges.
//   Any keep_open_pr line (including an empty value) or any --keep-open-pr token is explicit
//   intent. Intent without the full agreement refuses before push, create, archive publication,
//   or an OFFLINE placeholder. Explicit mode also requires one declaration of each identity
//   field and canonical positive issue tokens. A repeated field or a non-canonical issue token
//   refuses before any effect. Close mode still uses the first matching field and the filtered
//   member parser. An OPEN explicit reuse also refuses when closingIssuesReferences names the
//   retained issue, when that field cannot be read, or when autoMergeRequest is already set.
//   The sink does not edit that PR. A closing keyword associates only the reference it
//   immediately precedes. A qualified owner/repo#N, and a same-repository issue URL
//   https://github.com/OWNER/REPO/issues/N, count when they match the run's own repository
//   and do not count for another repository. An empty identity counts both. In explicit mode
//   the state identity and the origin identity are both read; if both parse and disagree, the
//   sink refuses repository_conflict before any scan, push, create, or placeholder.
//   #1099: when `pr_auto_merge` is true, one `pr_auto_merge: merge_queue | direct | failed` line is
//   emitted BEFORE that final line (and only then): `merge_queue` when the base branch requires a
//   GitHub merge queue and the PR was queued with `gh pr merge <url> --auto`, `direct` for the
//   original `--auto --squash --delete-branch` call (a false or unreadable probe), `failed` when
//   the call itself failed (still warning-only, still exit 0). #1113 explicit mode emits
//   `pr_auto_merge: suppressed_request_only` instead and never probes or merges.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync, spawnSync } = require('child_process');
// #354 (#353-rest): crash-safe atomic durable-state write (tmp + fsync + rename) so a sink-block
// rewrite can never leave a torn workflow-state.md (silently skipped by readActiveFolders).
const adaptiveSchema = require('./kaola-workflow-adaptive-schema');
// #394: resolve the default branch (origin/HEAD probe chain, offline-safe) so the fallback PR
// sink targets master/other-default repos correctly — the old hardcoded `--base main` broke them.
// #1055: defaultBranch moved from claim.js into adaptive-schema.js (claim.js re-exports it), so this
// module no longer needs to require claim.js at all.
const { defaultBranch } = adaptiveSchema;

const GIT_MAX_BUFFER = 64 * 1024 * 1024;

const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1';
const CONFIG_PATH = path.join(os.homedir(), '.config', 'kaola-workflow', 'config.json');
const REMOTE_TIMEOUT_MS = (() => {
  const n = parseInt(process.env.KAOLA_GH_REMOTE_TIMEOUT_MS || '30000', 10);
  return Number.isInteger(n) && n > 0 ? Math.min(n, 600000) : 30000;
})();

function assert(cond, msg) { if (!cond) throw new Error(msg); }

function isSafeName(name) {
  return typeof name === 'string' && name.length > 0 &&
    !name.includes('/') && !name.includes('\\') &&
    !name.includes('\0') && name !== '.' && name !== '..';
}

function ghExec(args) {
  if (OFFLINE) return '';
  return execFileSync('gh', args, { encoding: 'utf8', timeout: REMOTE_TIMEOUT_MS }).trim();
}

function getRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch (_) {
    return process.cwd();
  }
}

function readConfig() {
  const defaults = { pr_auto_merge: false };
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Object.assign({}, defaults, parsed);
  } catch (_) {
    try {
      fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaults, null, 2) + '\n');
    } catch (_2) {}
    return defaults;
  }
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--branch' && argv[i + 1]) {
      (args.branchTokens || (args.branchTokens = [])).push(argv[++i]);
      args.branch = args.branchTokens[args.branchTokens.length - 1];
      continue;
    }
    if (argv[i] === '--issue' && argv[i + 1]) {
      (args.issueTokens || (args.issueTokens = [])).push(argv[++i]);
      args.issue = parseInt(args.issueTokens[args.issueTokens.length - 1], 10);
      continue;
    }
    // #1094: the claimed member set (finalize's `--issue-numbers`) — one `Closes #n` per member.
    // The parsed set still drops non-integers and duplicates. Explicit mode reads issueNumbersTokens.
    if (argv[i] === '--issue-numbers' && argv[i + 1]) {
      (args.issueNumbersTokens || (args.issueNumbersTokens = [])).push(argv[++i]);
      args.issueNumbers = parseIssueNumbers(args.issueNumbersTokens[args.issueNumbersTokens.length - 1]);
      continue;
    }
    if (argv[i] === '--project' && argv[i + 1]) { args.project = argv[++i]; continue; }
    // #1113: explicit singleton GitHub keep-open research/artifact PR. The token itself is
    // intent, including an empty or other value. Absence leaves the #336/#1098 legacy refusal
    // unchanged. A following argument is the value; a bare token is an empty value.
    if (argv[i] === '--keep-open-pr') {
      const value = (i + 1 < argv.length) ? String(argv[++i]) : '';
      (args.keepOpenPrTokens || (args.keepOpenPrTokens = [])).push(value);
      args.keepOpenPr = value;
      continue;
    }
  }
  return args;
}

function parseIssueNumbers(raw) {
  const nums = String(raw || '').split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isInteger(n) && n > 0);
  return Array.from(new Set(nums)).sort((a, b) => a - b);
}

// #1094: the members this PR closes. The `--issue-numbers` flag wins; when it is absent, the
// state's `issue_numbers` line (live or archived) supplies the set, as sink-merge's #393a does, so
// a flag omission cannot leave bundle members open. The primary `--issue` is always a member.
// A singleton claim has no issue_numbers line and closes only `--issue`, exactly as before.
function resolveMemberSet(args, stateFile) {
  let members = Array.isArray(args.issueNumbers) ? args.issueNumbers.slice() : [];
  if (members.length === 0) {
    try {
      const m = fs.readFileSync(stateFile, 'utf8').match(/^issue_numbers:\s*(.+?)\s*$/m);
      if (m) members = parseIssueNumbers(m[1]);
    } catch (_) {}
  }
  if (args.issue != null && !members.includes(args.issue)) members.push(args.issue);
  return Array.from(new Set(members)).sort((a, b) => a - b);
}

function closesBody(members) {
  return members.map(n => 'Closes #' + n).join('\n');
}

// #1113: a closing keyword associates only the reference it immediately precedes. Optional
// whitespace or punctuation may sit between them. The reference is one of three forms: a
// full issue URL https://github.com/OWNER/REPO/issues/N, a qualified owner/repo#N, or a bare
// #N. OWNER/REPO is compared case-insensitively with the run repository identity. A URL or
// qualified reference for another repository is consumed and does not count. An empty
// identity counts every keyword-URL and keyword-qualified reference: over-refusal is the
// fail-closed direction. Same-repository issue URLs are recognized from the supplied native
// observations (nodejs/node pull requests 66406, 66240, 66371, and 66325): "Fixes: URL",
// "Fixes URL", and "Fixes URL." with other text on the same line. The scheme and host are
// https://github.com; the keyword match is case-insensitive. A URL for another repository
// does not count. A bare #N after the keyword still counts. A bare #N that the keyword does
// not immediately precede does not count. "closing" does not match: the keyword is a whole
// word. The URL and qualified alternatives are consumed so a trailing #N is not read as a
// bare reference.
// Groups: 1-3 issue-URL owner/repo/number; 4-6 qualified owner/repo/number; 7 bare number.
// Only one alternative captures.
const CLOSING_ASSOC_RE = /\b(?:close[sd]?|fix(?:es|ed)?|resolve[sd]?)\b[ \t:.,;!?'"()[\]{}*_~+\-]*(?:https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/issues\/(\d+)\b|([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)#(\d+)\b|#(\d+)\b)/gi;

// GitHub URL forms only. The origin fallback uses this and nothing else, so an absolute
// local path, a relative path, or another host yields '' and the scanner counts every
// qualified reference.
const GITHUB_URL_OWNER_REPO = [
  /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/i,
  /^ssh:\/\/(?:[^@/]+@)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/i,
  /^git:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/i,
  /^git@github\.com:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/i
];

// Bare OWNER/REPO for a claim_repository_id or an already-normalized state value.
// Each segment must start with an alphanumeric, so ../ and ./ shapes do not parse.
// A slug-shaped corrupted state line such as repo/origin.git is syntactically the same
// as a legitimate normalized OWNER/REPO (it parses as repo/origin). That limit is
// inherent to this state form and is not rejected here.
const BARE_OWNER_REPO = /^([A-Za-z0-9][A-Za-z0-9_.-]*)\/([A-Za-z0-9][A-Za-z0-9_.-]*?)(?:\.git)?$/;

function firstOwnerRepo(text, patterns) {
  for (const re of patterns) {
    const match = text.match(re);
    if (match) return match[1] + '/' + match[2];
  }
  return '';
}

function githubUrlOwnerRepo(value) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return '';
  return firstOwnerRepo(text, GITHUB_URL_OWNER_REPO);
}

// State values only. Origin remotes go through githubUrlOwnerRepo.
function asOwnerRepo(value) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return '';
  return firstOwnerRepo(text, GITHUB_URL_OWNER_REPO.concat([BARE_OWNER_REPO]));
}

function sameRepository(owner, repo, identity) {
  if (!identity) return true;
  return (owner + '/' + repo).toLowerCase() === identity.toLowerCase();
}

// repositoryIdentity is OWNER/REPO, a claim_repository_id / origin URL that normalizes to one,
// or empty when the repository is unknown. Empty counts every qualified reference and every
// keyword-preceded issue URL.
function closingIssueNumbers(text, repositoryIdentity) {
  const identity = asOwnerRepo(repositoryIdentity);
  const found = new Set();
  for (const line of String(text || '').split(/\r?\n/)) {
    CLOSING_ASSOC_RE.lastIndex = 0;
    let match;
    while ((match = CLOSING_ASSOC_RE.exec(line)) !== null) {
      if (match[7]) found.add(parseInt(match[7], 10));
      else if (match[3] && sameRepository(match[1], match[2], identity)) found.add(parseInt(match[3], 10));
      else if (match[6] && sameRepository(match[4], match[5], identity)) found.add(parseInt(match[6], 10));
      if (match.index === CLOSING_ASSOC_RE.lastIndex) CLOSING_ASSOC_RE.lastIndex++;
    }
  }
  return found;
}

function claimRepositoryFromTexts(texts) {
  const found = [];
  for (const text of texts || []) {
    for (const value of sinkFieldValues(text, 'claim_repository_id')) {
      const id = asOwnerRepo(value);
      if (id) found.push(id);
    }
  }
  if (found.length === 0) return '';
  const key = found[0].toLowerCase();
  // Disagreeing lines are not one repository. Leave this empty so origin, then the
  // fail-closed scanner, decides.
  if (!found.every((id) => id.toLowerCase() === key)) return '';
  return found[0];
}

function originOwnerRepo(root) {
  try {
    const remote = execFileSync('git', ['-C', root, 'remote', 'get-url', 'origin'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    return githubUrlOwnerRepo(remote);
  } catch (_) {
    return '';
  }
}

// Explicit mode only. The state parser is unchanged. Origin is always read, and it still
// accepts only a GitHub remote URL. Both identities present and disagreeing (case-insensitive)
// refuses repository_conflict before any scan, push, create, or placeholder. A state identity
// stands when origin does not parse, including a local or non-GitHub remote. When state yields
// none, origin decides. When neither yields one, the identity is empty and qualified references
// and issue URLs count.
function resolveClaimRepositoryIdentity(texts, root) {
  const fromState = claimRepositoryFromTexts(texts);
  const fromOrigin = originOwnerRepo(root);
  if (fromState && fromOrigin && fromState.toLowerCase() !== fromOrigin.toLowerCase()) {
    throw new Error('sink-pr: refusing: explicit_keep_open_refused: repository_conflict. State repository is ' +
      fromState + ', origin repository is ' + fromOrigin + '. Nothing was pushed or created.');
  }
  if (fromState) return fromState;
  return fromOrigin;
}

function sinkField(text, name) {
  if (typeof text !== 'string') return '';
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp('^' + escaped + ':[ \\t]*(.*)$', 'm'));
  return match ? match[1].trim() : '';
}

// Every whole-file line of one field. Explicit mode uses this so a later line cannot hide
// behind the first match. Close mode keeps sinkField.
function sinkFieldValues(text, name) {
  if (typeof text !== 'string') return [];
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('^' + escaped + ':[ \\t]*(.*)$', 'gm');
  const values = [];
  let match;
  while ((match = re.exec(text)) !== null) values.push(match[1].trim());
  return values;
}

// A canonical positive issue token. parseInt('72abc') and parseInt('072') are not accepted here.
const CANONICAL_ISSUE = /^[1-9][0-9]*$/;

function strictIssueList(raw) {
  const tokens = String(raw).split(',');
  const nums = [];
  for (const token of tokens) {
    const trimmed = token.trim();
    if (!CANONICAL_ISSUE.test(trimmed)) return { ok: false, reason: 'malformed_issue' };
    const n = Number(trimmed);
    if (!Number.isSafeInteger(n)) return { ok: false, reason: 'malformed_issue' };
    if (nums.includes(n)) return { ok: false, reason: 'ambiguous_identity' };
    nums.push(n);
  }
  if (nums.length === 0) return { ok: false, reason: 'malformed_issue' };
  return { ok: true, nums: nums };
}

function keepOpenLinkageBody(issue, repositoryIdentity) {
  const body = 'Keeps #' + issue + ' open.\n\n' +
    'This request publishes the run archive for review.\n' +
    'The issue stays open after merge.\n' +
    'Request-only: this request is not queued and is not automatically merged.\n';
  if (closingIssueNumbers(body, repositoryIdentity).size !== 0) {
    throw new Error('sink-pr: internal: keep-open linkage body contains a closing reference');
  }
  return body;
}

const LEGACY_KEEP_OPEN_REFUSAL = (project) =>
  'sink-pr: refusing: project ' + project + ' carries issue_action: comment_keep_open. ' +
  'Keep-open is merge-sink-only (a PR would auto-close the issue on merge). ' +
  'Remediate the merge sink and re-run sink-merge instead.';

function explicitRefusal(reason) {
  return 'sink-pr: refusing: explicit_keep_open_refused: ' + reason +
    '. Explicit singleton GitHub keep-open PR mode requires --keep-open-pr explicit_singleton ' +
    'together with issue_action: comment_keep_open, keep_open_pr: explicit_singleton, sink: pr, ' +
    'and exactly one issue. Nothing was pushed or created.';
}

// Pure gate. texts are the live and archived workflow-state bodies that exist.
// kind: close | legacy_refuse | explicit | malformed.
function assessKeepOpenPr(args, texts, members) {
  const present = (Array.isArray(texts) ? texts : []).filter(t => typeof t === 'string');
  // Line existence, not the first nonempty value. An empty keep_open_pr line is intent.
  // A caller that passes keepOpenPr without the token list still counts that one value.
  const tokens = (args && Array.isArray(args.keepOpenPrTokens))
    ? args.keepOpenPrTokens
    : (args && typeof args.keepOpenPr === 'string' ? [args.keepOpenPr] : []);
  const anyFlagToken = tokens.length > 0;
  const flag = anyFlagToken ? tokens[tokens.length - 1] : '';
  const flagExact = flag === 'explicit_singleton';
  const anyLegacy = present.some(t => sinkField(t, 'issue_action') === 'comment_keep_open');
  const markerLines = present.map(t => sinkFieldValues(t, 'keep_open_pr'));
  const anyMarkerLine = markerLines.some(lines => lines.length > 0);
  const project = (args && args.project) || '';
  const refuse = (reason) => ({ kind: 'malformed', reason: reason, message: explicitRefusal(reason) });
  const repeated = (list) => Array.isArray(list) && list.length > 1;
  // No keep_open_pr line and no --keep-open-pr token: close mode. issue_action alone stays
  // the #336/#1098 merge-sink-only refusal.
  if (!anyFlagToken && !anyMarkerLine) {
    if (anyLegacy) return { kind: 'legacy_refuse', message: LEGACY_KEEP_OPEN_REFUSAL(project) };
    return { kind: 'close' };
  }
  if (repeated(tokens) || markerLines.some(lines => lines.length > 1)) return refuse('ambiguous_identity');
  if (!flagExact) return refuse(anyFlagToken ? 'mode_mismatch' : 'partial_marker');
  if (present.length === 0) return refuse('state_missing');
  if (repeated(args && args.branchTokens) || repeated(args && args.issueTokens) ||
      repeated(args && args.issueNumbersTokens)) {
    return refuse('ambiguous_identity');
  }
  const once = ['issue_action', 'keep_open_pr', 'sink', 'issue_number', 'branch'];
  const optional = ['issue_numbers', 'base_branch'];
  const parsed = present.map((text) => {
    const fields = {};
    for (const name of once.concat(optional)) fields[name] = sinkFieldValues(text, name);
    return fields;
  });
  for (const fields of parsed) {
    for (const name of once.concat(optional)) {
      if (fields[name].length > 1) return refuse('ambiguous_identity');
    }
  }
  const one = (fields, name) => (fields[name].length === 1 ? fields[name][0] : '');
  const signature = (fields) => once.concat(optional).map((name) => one(fields, name)).join('\0');
  if (new Set(parsed.map(signature)).size > 1) return refuse('state_conflict');
  const fields = parsed[0];
  if (one(fields, 'issue_action') !== 'comment_keep_open' || one(fields, 'keep_open_pr') !== 'explicit_singleton') {
    return refuse('mode_mismatch');
  }
  if (one(fields, 'sink') !== 'pr') return refuse('sink_mismatch');
  if (args && Array.isArray(args.issueTokens) && args.issueTokens.length === 1 &&
      !CANONICAL_ISSUE.test(args.issueTokens[0])) {
    return refuse('malformed_issue');
  }
  if (args && Array.isArray(args.issueNumbersTokens) && args.issueNumbersTokens.length === 1) {
    const listed = strictIssueList(args.issueNumbersTokens[0]);
    if (!listed.ok) return refuse(listed.reason);
    if (listed.nums.length !== 1) return refuse('bundle_refused');
    if (!(args && Number.isInteger(args.issue) && args.issue > 0) || listed.nums[0] !== args.issue) {
      return refuse('issue_mismatch');
    }
  }
  const set = Array.isArray(members) ? members : [];
  if (set.length !== 1) return refuse('bundle_refused');
  if (!(args && Number.isInteger(args.issue) && args.issue > 0) || args.issue !== set[0]) {
    return refuse('issue_mismatch');
  }
  if (fields.issue_number.length === 0) return refuse('issue_mismatch');
  if (!CANONICAL_ISSUE.test(fields.issue_number[0])) return refuse('malformed_issue');
  if (Number(fields.issue_number[0]) !== args.issue) return refuse('issue_mismatch');
  if (fields.issue_numbers.length === 1) {
    const listed = strictIssueList(fields.issue_numbers[0]);
    if (!listed.ok) return refuse(listed.reason);
    if (listed.nums.length !== 1) return refuse('bundle_refused');
    if (listed.nums[0] !== args.issue) return refuse('issue_mismatch');
  }
  if (one(fields, 'branch') !== args.branch) return refuse('branch_mismatch');
  return { kind: 'explicit', base_branch: one(fields, 'base_branch') };
}

function gitRefExists(root, ref) {
  try {
    execFileSync('git', ['-C', root, 'rev-parse', '--verify', '--quiet', ref], { stdio: 'ignore' });
    return true;
  } catch (_) { return false; }
}

function commitMessagesNotOnBase(root, baseBranch, branch) {
  if (!gitRefExists(root, branch) && !gitRefExists(root, 'refs/heads/' + branch)) {
    return { ok: false, reason: 'head_missing' };
  }
  const headRef = gitRefExists(root, branch) ? branch : ('refs/heads/' + branch);
  const baseCandidates = [baseBranch, 'origin/' + baseBranch, 'refs/heads/' + baseBranch, 'refs/remotes/origin/' + baseBranch];
  const baseRef = baseCandidates.find(candidate => gitRefExists(root, candidate));
  if (!baseRef) return { ok: false, reason: 'base_unavailable' };
  try {
    const text = execFileSync('git', ['-C', root, 'log', '--format=%B%x1e', baseRef + '..' + headRef], {
      encoding: 'utf8', maxBuffer: GIT_MAX_BUFFER, stdio: ['ignore', 'pipe', 'pipe']
    });
    return { ok: true, text: text };
  } catch (_) {
    return { ok: false, reason: 'commit_scan_failed' };
  }
}

function assertNoClosingCommits(root, baseBranch, branch, members, repositoryIdentity) {
  const scanned = commitMessagesNotOnBase(root, baseBranch, branch);
  if (!scanned.ok) throw new Error(explicitRefusal(scanned.reason));
  const hit = members.filter(n => closingIssueNumbers(scanned.text, repositoryIdentity).has(n));
  if (hit.length) {
    throw new Error('sink-pr: refusing: explicit_keep_open_refused: closing_linkage. Commit messages reachable from ' +
      branch + ' and not from ' + baseBranch + ' close issue(s) ' + hit.join(', ') + '. Nothing was pushed or created.');
  }
}

// #1113: explicit OPEN reuse/discovery. Refuse before push, create, or archive publication.
// Do not unlink the PR and do not change its auto-merge setting.
function assertExplicitOpenNativeSafe(existing, members) {
  const closing = existing && existing.closingIssues;
  if (!closing || closing.measured !== true) {
    throw new Error(explicitRefusal('native_closing_unmeasured') + ' PR ' + existing.url +
      ' did not return a readable closingIssuesReferences set. The PR was not modified.');
  }
  const hit = members.filter(n => closing.numbers.indexOf(n) !== -1);
  if (hit.length) {
    throw new Error('sink-pr: refusing: explicit_keep_open_refused: native_closing_linkage. PR ' +
      existing.url + ' is associated with issue(s) ' + hit.join(', ') +
      ' through closingIssuesReferences. The PR was not modified.');
  }
  const auto = existing.autoMerge;
  if (!auto || auto.measured !== true) {
    throw new Error(explicitRefusal('auto_merge_unmeasured') + ' PR ' + existing.url +
      ' did not return a readable autoMergeRequest. The remote setting was not changed.');
  }
  if (auto.enabled) {
    throw new Error('sink-pr: refusing: explicit_keep_open_refused: auto_merge_enabled. PR ' +
      existing.url + ' already has auto-merge enabled. The remote setting was not changed.');
  }
}

function assertExplicitReuseSafe(existing, members, repositoryIdentity) {
  const text = String(existing.body || '') + '\n' + String(existing.title || '');
  const hit = members.filter(n => closingIssueNumbers(text, repositoryIdentity).has(n));
  if (hit.length) {
    throw new Error('sink-pr: refusing: explicit_keep_open_refused: closing_linkage. PR ' + existing.url +
      ' carries a closing reference to issue(s) ' + hit.join(', ') + '. The PR was not modified.');
  }
  for (const n of members) {
    if (!new RegExp('#' + n + '\\b').test(text)) {
      throw new Error('sink-pr: refusing: explicit_keep_open_refused: linkage_missing. PR ' + existing.url +
        ' does not identify issue #' + n + '. The PR was not modified.');
    }
  }
}

// #1098: write pr_url/pr_number into the state file's `## Sink` block — in place when the line
// already exists, appended to the block otherwise, and SKIPPED entirely when the result would be
// byte-identical. Re-entry used to re-insert the two lines because the block's extent was matched
// with a lazy regex that only ever captured the heading line.
function updateStateSinkBlock(stateFile, prUrl, prNumber) {
  if (!fs.existsSync(stateFile)) return;
  const content = fs.readFileSync(stateFile, 'utf8');
  const lines = content.split('\n');
  const start = lines.findIndex(l => /^## Sink\s*$/.test(l));
  if (start === -1) return; // no Sink block: skip silently, exactly as before
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) { end = i; break; }
  }
  const block = lines.slice(start + 1, end);
  const tail = [];
  while (block.length > 0 && block[block.length - 1].trim() === '') tail.unshift(block.pop());
  const upsert = (key, value) => {
    const idx = block.findIndex(l => new RegExp('^' + key + ':').test(l));
    const line = key + ': ' + value;
    if (idx === -1) block.push(line);
    else block[idx] = line;
  };
  upsert('pr_url', prUrl);
  upsert('pr_number', prNumber);
  const updated = lines.slice(0, start + 1).concat(block, tail, lines.slice(end)).join('\n');
  if (updated === content) return; // idempotent re-entry: no byte change, no rewrite
  adaptiveSchema.writeFileAtomicReplace(stateFile, updated);
}

function appendSummary(summaryFile, prUrl, prNumber) {
  // #394: guard — the STANDARD exit-3 lane archives the project before the fallback sink runs, so the
  // live finalization-summary.md is gone. A raw appendFileSync then crashed with ENOENT AFTER the PR
  // was created (the orphaned-open-PR bug). Skip silently when the parent dir is absent (the durable
  // pr_url record is written separately, before any throwable step).
  if (!fs.existsSync(path.dirname(summaryFile))) return;
  // #1098: re-entry must not mint duplicate lines — skip when this PR URL is already recorded.
  let existing = '';
  try { existing = fs.readFileSync(summaryFile, 'utf8'); } catch (_) {}
  if (('\n' + existing + '\n').includes('\nPR URL: ' + prUrl + '\n')) return;
  fs.appendFileSync(summaryFile, '\nPR URL: ' + prUrl + '\nPR number: ' + prNumber + '\n');
}

// #394: resolve the project folder — LIVE first, then the ARCHIVE folder (the standard exit-3 lane
// archives before the fallback sink runs). Returns the dir that exists, or the live dir as the
// default (callers presence-guard their writes).
function resolveProjectDir(root, project) {
  const live = path.join(root, 'kaola-workflow', project);
  if (fs.existsSync(live)) return live;
  const archived = path.join(root, 'kaola-workflow', 'archive', project);
  if (fs.existsSync(archived)) return archived;
  return live;
}

// #394: record pr_url to a DURABLE location BEFORE any step that can throw after PR creation, so a
// later crash (metadata commit / push / appendSummary) never leaves an orphaned open PR invisible to
// watch-pr. Written into the resolved project's .cache (archive folder in the standard exit-3 lane).
// #1098: idempotent — when {project, branch, pr_url, pr_number} are unchanged the file is NOT
// rewritten; a fresh timestamp would mint a new archive commit on every re-entry.
// #1113: explicit mode passes keep_open_pr / pr_request / mainline_publication. Absent keys
// compare as '' so a close-mode record stays the same shape and stays idempotent.
function recordPrResult(projectDir, project, prUrl, prNumber, branch, extra) {
  try {
    const cacheDir = path.join(projectDir, '.cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    const recordPath = path.join(cacheDir, 'sink-pr-result.json');
    const next = { project, branch, pr_url: prUrl, pr_number: prNumber, timestamp: new Date().toISOString() };
    if (extra && typeof extra === 'object') Object.assign(next, extra);
    const same = (prevRec, key) => (prevRec[key] || '') === (next[key] || '');
    try {
      const prev = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
      if (prev && typeof prev === 'object' &&
          prev.project === next.project && prev.branch === next.branch &&
          prev.pr_url === next.pr_url && prev.pr_number === next.pr_number &&
          same(prev, 'keep_open_pr') && same(prev, 'pr_request') && same(prev, 'mainline_publication')) return;
    } catch (_) {}
    // Atomic (tmp + fsync + rename): the whole point of this record is to be DURABLE before any step
    // that can throw after PR creation. A bare write is neither fsynced nor all-or-nothing, so the
    // very crash it guards against could leave watch-pr a truncated, unparseable pr_url.
    adaptiveSchema.writeFileAtomicReplace(recordPath, JSON.stringify(next, null, 2) + '\n');
  } catch (_) { /* best-effort durable record; never block the PR flow */ }
}

// #1098: the durable identity of this project's PR — the .cache record first, then the state Sink
// block's pr_url. An OFFLINE placeholder is not an identity. Returns '' when there is none.
function readRecordedPrUrl(projectFolder, stateFile) {
  try {
    const rec = JSON.parse(fs.readFileSync(path.join(projectFolder, '.cache', 'sink-pr-result.json'), 'utf8'));
    if (rec && typeof rec === 'object' && typeof rec.pr_url === 'string' &&
        rec.pr_url && rec.pr_url !== 'OFFLINE_PLACEHOLDER') return rec.pr_url;
  } catch (_) {}
  try {
    const m = fs.readFileSync(stateFile, 'utf8').match(/^pr_url:\s*(\S+)\s*$/m);
    if (m && m[1] && m[1] !== 'OFFLINE_PLACEHOLDER') return m[1];
  } catch (_) {}
  return '';
}

// #1113: both gh lookups ask for these. Close mode reads the same payload and ignores the
// two explicit-mode fields, so a missing value there does not change close-mode reuse.
const PR_VIEW_JSON = 'url,number,state,headRefName,baseRefName,body,title,closingIssuesReferences,autoMergeRequest';

function hasOwn(obj, key) {
  return !!obj && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key);
}

// Array of {number} -> measured numbers. Missing, null, or a bad element -> unmeasured.
function normalizeClosingIssues(data) {
  if (!hasOwn(data, 'closingIssuesReferences')) return { measured: false, numbers: [] };
  const raw = data.closingIssuesReferences;
  if (!Array.isArray(raw)) return { measured: false, numbers: [] };
  const numbers = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || !hasOwn(item, 'number')) {
      return { measured: false, numbers: [] };
    }
    const n = Number(item.number);
    if (!Number.isInteger(n) || n <= 0) return { measured: false, numbers: [] };
    numbers.push(n);
  }
  return { measured: true, numbers: numbers };
}

// null -> disabled. A non-null object -> enabled, with that object's fields kept.
// Missing or any other shape -> unmeasured. This does not describe a merge queue.
function normalizeAutoMerge(data) {
  if (!hasOwn(data, 'autoMergeRequest')) return { measured: false, enabled: false, fields: null };
  const raw = data.autoMergeRequest;
  if (raw === null) return { measured: true, enabled: false, fields: null };
  if (typeof raw === 'object' && !Array.isArray(raw)) return { measured: true, enabled: true, fields: raw };
  return { measured: false, enabled: false, fields: null };
}

// #1098 §2.1-2: a PR view normalized to the fields reuse routing needs.
function normalizePrView(data) {
  if (!data || typeof data !== 'object') return null;
  const url = typeof data.url === 'string' && data.url ? data.url : '';
  const num = Number(data.number);
  if (!url || !Number.isFinite(num) || num <= 0) return null;
  return {
    url: url,
    number: parseInt(num, 10),
    state: String(data.state || '').toUpperCase(),
    head: String(data.headRefName || ''),
    base: String(data.baseRefName || ''),
    body: String(data.body || ''),
    title: String(data.title || ''),
    closingIssues: normalizeClosingIssues(data),
    autoMerge: normalizeAutoMerge(data)
  };
}

// #1098 §2.1-2: the recorded PR's CURRENT state — merged and closed are as load-bearing as open
// (a merged PR must never be re-pushed or re-created; a closed one is the orchestrator's call).
// Any probe failure returns null so the caller falls back to the head-based discovery.
function viewRecordedPr(prUrl) {
  try {
    return normalizePrView(JSON.parse(ghExec(['pr', 'view', prUrl, '--json', PR_VIEW_JSON])));
  } catch (_) { return null; }
}

// #1098 §2.1-2: record-less discovery — open PRs for this head/base. Empty output or [] is
// "no PR" and falls through to the create flow. The query passes `--base`, so a PR that exists on a
// DIFFERENT base is not returned here and is therefore not seen by this scan; `gh pr create` would
// then refuse with "already exists" naming that PR. The target-branch check at reuse below applies
// only to a PR this scan (or the durable record) actually returned.
function listOpenPrs(branch, baseBranch) {
  let raw = '';
  try {
    raw = ghExec(['pr', 'list', '--head', branch, '--base', baseBranch, '--state', 'open',
      '--json', PR_VIEW_JSON]);
  } catch (_) { return []; }
  let list = null;
  try { list = JSON.parse(raw || '[]'); } catch (_) { return []; }
  if (!Array.isArray(list)) return [];
  return list.map(normalizePrView).filter(Boolean)
    .filter(p => p.state === 'OPEN' && p.head === branch);
}

// #1098 F5: the archive-rides-the-PR mechanism (commit onto the branch tip, advance ff-only or by
// CAS update-ref, then push; never the default branch, never a force, and never touching the main
// checkout index or HEAD) now lives once in the kernel, so all three request sinks share it and the
// push/re-entry rules cannot drift apart. The non-linked posture is the legacy commit-on-HEAD flow.
function publishArchiveWithPr(root, project, branch, projectFolder, prUrl, options) {
  const relDir = path.relative(root, projectFolder).split(path.sep).join('/');
  const opts = options || {};
  const res = adaptiveSchema.publishPathsOntoRequestBranch(root, {
    branch: branch,
    pathspec: relDir,
    message: 'chore: record PR metadata for ' + project,
    skipPush: opts.skipPush === true
  });
  if (!res.ok) {
    const detail = res.detail || res.error;
    if (res.error === 'branch_missing') {
      throw new Error('PR at ' + prUrl + ' but the local branch ' + branch + ' is missing — the archive cannot ride the PR.\n' +
        'Manual recovery: re-create the branch from the PR head, then re-run sink-pr (the PR record is durable).');
    }
    throw new Error('PR at ' + prUrl + ' but the archive could not ride the PR (' + res.error + ': ' + detail + ').\n' +
      'Not retried, not forced; re-run sink-pr to continue from here (the PR record is durable).');
  }
}
function main() {
  const args = parseArgs(process.argv.slice(2));

  assert(
    args.branch && args.branch !== 'TBD' &&
    !args.branch.startsWith('-') && !args.branch.includes('\0') &&
    args.branch !== '.' && args.branch !== '..',
    '--branch is invalid or TBD'
  );
  assert(args.project && isSafeName(args.project), '--project must be a safe folder name');
  if (args.issue != null) {
    assert(Number.isFinite(args.issue) && args.issue > 0, '--issue must be a positive integer');
  }

  // #1098 §2.1-1: every project-directory read/write targets the MAIN checkout — a linked dev
  // worktree resolving its own toplevel found no archive, re-created a live folder inside the
  // worktree, and bypassed the keep-open guard. In a non-linked checkout resolveMainRoot is the
  // toplevel itself, so existing behavior is unchanged.
  const root = adaptiveSchema.resolveMainRoot(getRoot());
  const config = readConfig();
  // #394: resolve the project dir — LIVE first, then ARCHIVE (the standard exit-3 fallback lane
  // archives before this sink runs). All durable writes target the resolved dir; appendSummary +
  // updateStateSinkBlock presence-guard, and recordPrResult writes the pr_url there before any
  // throwable step.
  const projectFolder = resolveProjectDir(root, args.project);
  // #1098 §2.1-1: recordPrResult no longer mkdirs a project folder back into existence — a folder
  // that is neither live nor archived is a caller error, refused BEFORE any PR is created.
  assert(fs.existsSync(projectFolder),
    'sink-pr: project folder not found (neither kaola-workflow/' + args.project +
    '/ nor kaola-workflow/archive/' + args.project + ') — refusing before creating a PR');
  const stateFile = path.join(projectFolder, 'workflow-state.md');
  const summaryFile = path.join(projectFolder, 'finalization-summary.md');
  const members = resolveMemberSet(args, stateFile);

  // #336 / #1098 D4=(a): keep-open without the explicit #1113 agreement stays merge-sink-only.
  // The PR body 'Closes #N' would auto-close the kept-open issue. The ARCHIVED path is the one
  // that fires in the real exit-3 fallback flow (the finalize transaction archives the project
  // BEFORE the sink runs); the LIVE path covers a sink: pr project that gained issue_action by
  // mistake. The gate sits BEFORE the OFFLINE early-return (mode-independent, OFFLINE-testable).
  // #1113: the same gate is the only way into explicit singleton mode. A partial marker or a
  // mismatched flag refuses before any placeholder, push, or create.
  const keepOpenTexts = [];
  const keepOpenSeen = new Set();
  for (const f of [stateFile, path.join(root, 'kaola-workflow', 'archive', args.project, 'workflow-state.md')]) {
    let resolved = f;
    try { resolved = fs.realpathSync(f); } catch (_) { continue; }
    if (keepOpenSeen.has(resolved)) continue;
    keepOpenSeen.add(resolved);
    try { keepOpenTexts.push(fs.readFileSync(resolved, 'utf8')); } catch (_) {}
  }
  const keepOpenDecision = assessKeepOpenPr(args, keepOpenTexts, members);
  if (keepOpenDecision.kind === 'legacy_refuse' || keepOpenDecision.kind === 'malformed') {
    throw new Error(keepOpenDecision.message);
  }
  const explicitMode = keepOpenDecision.kind === 'explicit';
  if (explicitMode && OFFLINE) {
    throw new Error(explicitRefusal('offline') +
      ' Explicit mode does not write an OFFLINE placeholder.');
  }

  if (OFFLINE) {
    const prUrl = 'OFFLINE_PLACEHOLDER';
    const prNumber = 0;
    updateStateSinkBlock(stateFile, prUrl, prNumber);
    appendSummary(summaryFile, prUrl, prNumber);
    // #1098 F6/N2: OFFLINE changes git history ONLY in the non-linked posture — the checkout the sink
    // runs in IS the main root, i.e. the run's own single checkout, which keeps its legacy local
    // metadata commit exactly as before. When the run started from a linked worktree, `root` is the
    // SHARED main checkout, and committing there would land a metadata commit on main's HEAD;
    // never touching main's index or HEAD is the sink's contract, so the files are left written for
    // the caller. No push happens in either case (OFFLINE has no remote).
    const runToplevel = getRoot();
    const nonLinked = runToplevel === root;
    if (nonLinked) {
      const relState = path.relative(root, stateFile);
      const relSummary = path.relative(root, summaryFile);
      spawnSync('git', ['-C', root, 'add', relState, relSummary], { stdio: 'pipe' });
      const diffResult = spawnSync('git', ['-C', root, 'diff', '--cached', '--quiet'], { stdio: 'pipe' });
      if (diffResult.status !== 0) {
        const commitResult = spawnSync('git', ['-C', root, 'commit', '-m',
          'chore: record PR metadata for ' + args.project], { stdio: 'pipe' });
        if (commitResult.status !== 0) {
          process.stderr.write('[offline] metadata commit skipped: ' +
            (commitResult.stderr ? commitResult.stderr.toString().trim() : 'unknown error') + '\n');
        }
      }
    }
    return { pr_url: prUrl, pr_number: prNumber, offline: true };
  }

  // #1113: one identity for every closing scan in this run. Explicit mode reads state and
  // origin here, after the marker and OFFLINE gates and before any scan, push, create, or
  // placeholder. Disagreement throws repository_conflict and names both identities. A state
  // identity stands when origin is not a GitHub URL. An empty state lets origin decide.
  // Neither leaves the identity empty, and qualified references and issue URLs then count.
  const repositoryIdentity = explicitMode
    ? resolveClaimRepositoryIdentity(keepOpenTexts, root)
    : '';

  // #394: resolve the PR base from the default branch (origin/HEAD probe chain) — the prior
  // hardcoded `--base main` made the fallback PR sink fail on a master-default repo (the #350
  // resolution never reached this sink). A sink-fallback.json receipt (written by sink-merge) may
  // carry the already-resolved branch; prefer it, else probe. #1098: moved BEFORE the existing-PR
  // lookup and the push so reuse validation compares against the resolved default branch.
  let baseBranch = 'main';
  try {
    const fbPath = path.join(projectFolder, '.cache', 'sink-fallback.json');
    if (fs.existsSync(fbPath)) {
      const fb = JSON.parse(fs.readFileSync(fbPath, 'utf8'));
      if (fb && typeof fb.resolved_default_branch === 'string' && fb.resolved_default_branch) baseBranch = fb.resolved_default_branch;
    }
  } catch (_) {}
  if (baseBranch === 'main') {
    try { baseBranch = defaultBranch(root) || 'main'; } catch (_) { baseBranch = 'main'; }
  }
  if (explicitMode && keepOpenDecision.base_branch && keepOpenDecision.base_branch !== baseBranch) {
    throw new Error('sink-pr: refusing: explicit_keep_open_refused: base_mismatch. State base_branch is ' +
      keepOpenDecision.base_branch + ', resolved base is ' + baseBranch + '. Nothing was pushed or created.');
  }

  // #1098 §2.1-2: find the existing PR BEFORE any push. Identity comes from the durable record
  // first; record-less discovery queries open PRs for this head/base.
  const recordedUrl = readRecordedPrUrl(projectFolder, stateFile);
  let existing = null;
  if (recordedUrl) {
    existing = viewRecordedPr(recordedUrl);
    // #1098 F2: a durable record means a PR EXISTS. If its state cannot be read right now (a
    // transient `gh pr view` failure), falling through to discovery is not a safe default: the
    // record's PR may already be merged with its branch deleted, so the discovery path would push
    // the deleted branch back and open a SECOND PR — reopening a merged change. Fail closed: refuse,
    // report, and modify nothing. `gh pr view <url>` against a real PR is what distinguishes this
    // from "the record names something that never existed", which is not a state this sink mints.
    assert(existing,
      'sink-pr: refusing: a durable PR record exists (' + recordedUrl + ') but its current state ' +
      'could not be read (pr_probe_failed). Refusing to fall back to discovery, which could push a ' +
      'deleted branch back and reopen a merged PR. Retry once the forge is reachable; nothing was ' +
      'pushed or created.');
  }
  if (!existing) {
    const open = listOpenPrs(args.branch, baseBranch);
    if (open.length > 0) existing = open[0];
  }

  if (existing) {
    // #1113: explicit mode checks head/base before the merged early-return. Close mode does not:
    // an already-merged close-mode PR still reports already_merged without a head comparison.
    if (explicitMode) {
      if (existing.head !== args.branch) {
        throw new Error(explicitRefusal('head_mismatch') + ' PR ' + existing.url + ' head is ' +
          (existing.head || '(empty)') + ', expected ' + args.branch + '.');
      }
      if (existing.base !== baseBranch) {
        throw new Error(explicitRefusal('base_mismatch') + ' PR ' + existing.url + ' base is ' +
          (existing.base || '(empty)') + ', expected ' + baseBranch + '.');
      }
    }
    if (existing.state === 'MERGED') {
      // Merged: no push, no create, no merge — the remote branch (even deleted) stays exactly as
      // the forge left it, and §2.2's reconciliation owns the disposition.
      if (explicitMode) {
        const mergedText = String(existing.body || '') + '\n' + String(existing.title || '');
        const closingPresent = members.some(n => closingIssueNumbers(mergedText, repositoryIdentity).has(n));
        if (closingPresent) {
          process.stderr.write('sink-pr: note: explicit keep-open PR ' + existing.url +
            ' is merged and its text carries a closing reference. No second PR was created.\n');
        }
        process.stdout.write('pr_request: request_only\n');
        process.stdout.write('publication: already_published\n');
        process.stdout.write('mainline_publication: pending_reconciliation\n');
        process.stdout.write('keep_open_linkage: ' + (closingPresent ? 'closing_present' : 'clean') + '\n');
      }
      process.stdout.write('sink_pr: already_merged\n');
      return;
    }
    if (existing.state !== 'OPEN') {
      // CLOSED without merging: the archive is the only run record, and reopening is the
      // orchestrator's decision — refuse, modify nothing.
      assert(false,
        'sink-pr: refusing: PR ' + existing.url + ' is closed without merging (pr_closed_unmerged). ' +
        'The orchestrator decides whether to reopen; nothing was pushed or created.');
    }
    if (explicitMode) {
      // OPEN explicit reuse: native closing association and auto-merge first, then text.
      // Both refuse before archive publication. Close mode keeps the Closes check.
      assertExplicitOpenNativeSafe(existing, members);
      assertExplicitReuseSafe(existing, members, repositoryIdentity);
      assertNoClosingCommits(root, baseBranch, args.branch, members, repositoryIdentity);
    } else {
      // OPEN → reuse. Candidate identity: head==branch, base==resolved default branch.
      assert(existing.head === args.branch,
        'sink-pr: refusing to reuse PR ' + existing.url + ': head is ' +
        (existing.head || '(empty)') + ', expected ' + args.branch);
      assert(existing.base === baseBranch,
        'sink-pr: refusing to reuse PR ' + existing.url + ': base is ' +
        (existing.base || '(empty)') + ', expected ' + baseBranch);
      const missingCloses = members.filter(n =>
        !new RegExp('^Closes\\s+#' + n + '\\s*$', 'm').test(existing.body));
      assert(missingCloses.length === 0,
        'sink-pr: refusing to reuse PR ' + existing.url + ': body is missing "Closes #' +
        missingCloses[0] + '" for issue(s): ' + missingCloses.join(', ') +
        '. A bundle closes every member or none (#592/#1094); the PR was not modified.');
    }
  }

  const reused = !!existing;
  let prUrl;
  let prNumber;
  let explicitTitle = '';
  let explicitBody = '';
  if (!reused) {
    if (explicitMode) {
      assertNoClosingCommits(root, baseBranch, args.branch, members, repositoryIdentity);
      explicitBody = keepOpenLinkageBody(members[0], repositoryIdentity);
      explicitTitle = 'Publish ' + args.project + ' (keeps #' + members[0] + ' open)';
      if (closingIssueNumbers(explicitTitle, repositoryIdentity).size !== 0) {
        throw new Error(explicitRefusal('closing_linkage') + ' The generated title was not used.');
      }
    }
    // Step 3 — push branch (the lookup above already ruled out an existing PR on this head)
    execFileSync('git', ['push', 'origin', args.branch], { encoding: 'utf8' });

    // Step 4 — create PR. Close mode stays --fill plus one Closes line per member.
    // Explicit mode names the issue without a closing keyword and never uses --fill.
    const prCreateArgs = explicitMode
      ? ['pr', 'create', '--head', args.branch, '--base', baseBranch, '--title', explicitTitle, '--body', explicitBody]
      : ['pr', 'create', '--head', args.branch, '--base', baseBranch, '--fill'];
    if (!explicitMode && members.length > 0) {
      prCreateArgs.push('--body', closesBody(members));
    }

    const raw = ghExec(prCreateArgs);

    // Step 5 — assert URL
    assert(raw.startsWith('https://'), 'gh pr create did not return a valid URL: ' + raw);

    // Step 6 — parse PR number
    const prNumMatch = raw.match(/\/pull\/(\d+)/);
    prUrl = raw;
    prNumber = prNumMatch ? parseInt(prNumMatch[1], 10) : 0;
  } else {
    prUrl = existing.url;
    prNumber = existing.number;
  }

  // #394 RECORD-BEFORE-THROW: persist pr_url to a durable location IMMEDIATELY after the PR is
  // identified, BEFORE updateStateSinkBlock / appendSummary / the archive publish (any of which
  // can throw). Without this, a crash after PR creation left an orphaned open PR with no durable
  // pr_url — watch-pr never saw it. The record lives in the resolved project's .cache.
  recordPrResult(projectFolder, args.project, prUrl, prNumber, args.branch,
    explicitMode ? {
      keep_open_pr: 'explicit_singleton',
      pr_request: 'request_only',
      mainline_publication: 'pending'
    } : undefined);

  // Step 7 — update workflow-state.md Sink block
  updateStateSinkBlock(stateFile, prUrl, prNumber);

  // Step 8 — append to finalization-summary.md
  appendSummary(summaryFile, prUrl, prNumber);

  // #1098 §2.1-4 — the archive rides the PR (replaces the metadata commit that landed on local
  // main in the linked posture, publishing only two files and never reaching origin).
  publishArchiveWithPr(root, args.project, args.branch, projectFolder, prUrl);

  // Step 9 — optional auto-merge. Only an OPEN PR ever reaches here: a merged or closed PR was
  // routed above (#1098 §2.1-5).
  //
  // #1099 — the optional forge-native merge queue. A base branch may REQUIRE a GitHub merge queue
  // (branch protection / ruleset). On such a branch the pre-#1099 call
  // `gh pr merge <url> --auto --squash --delete-branch` ALWAYS fails: gh >=2.64.0 rejects
  // `-d/--delete-branch` outright on a queue branch ("Cannot use `-d` or `--delete-branch` when
  // merge queue enabled") because deleting the branch closes the queued PR. The sink only warned
  // and exited 0, so the PR silently stayed open and never entered the queue — the D-mq1
  // correction. The queue also owns the merge method, so no `--squash` may be passed there.
  //
  // So: probe ONCE, and only when auto-merge is requested, for `PullRequest.isMergeQueueEnabled`
  // (GraphQL; `gh pr view --json` exposes no such field). Probe true → `gh pr merge <url> --auto`
  // (the queue decides the method; deletion is left to the repository's "automatically delete head
  // branches" setting). Probe false OR probe failure/unparseable → the ORIGINAL argv, verbatim, so
  // a forge we cannot probe behaves exactly as before. The probe never throws: any gh error, JSON
  // error, or unexpected envelope is a `false`.
  // #1113: explicit request-only mode never probes the merge queue and never calls gh pr merge,
  // even when the operator config has pr_auto_merge true. The config file is not modified.
  if (explicitMode) {
    process.stdout.write('pr_auto_merge: suppressed_request_only\n');
  } else if (config.pr_auto_merge === true) {
    let queueEnabled = false;
    try {
      const probe = JSON.parse(ghExec([
        'api', 'graphql',
        '-f', 'query=query($u:URI!){resource(url:$u){...on PullRequest{isMergeQueueEnabled}}}',
        '-f', 'u=' + prUrl,
      ]));
      queueEnabled = !!(probe && probe.data && probe.data.resource &&
        probe.data.resource.isMergeQueueEnabled === true);
    } catch (_) {
      queueEnabled = false; // probe failure/unparseable → the pre-#1099 behavior, unchanged.
    }
    // The lane is emitted BEFORE the final `sink_pr:` line, which stays last and unchanged; it is
    // written only when auto-merge was actually attempted.
    let lane;
    try {
      if (queueEnabled) {
        ghExec(['pr', 'merge', prUrl, '--auto']);
        lane = 'merge_queue';
      } else {
        ghExec(['pr', 'merge', prUrl, '--auto', '--squash', '--delete-branch']);
        lane = 'direct';
      }
    } catch (mergeErr) {
      // Warning-only, exactly as today: a failed auto-merge never fails the sink (#1098 T3 relies
      // on a run that merged this way reconciling to `already_merged`).
      lane = 'failed';
      process.stderr.write('Warning: pr auto-merge failed: ' + mergeErr.message + '\n');
    }
    process.stdout.write('pr_auto_merge: ' + lane + '\n');
  }

  // #1113: request-only receipt lines precede the final sink_pr line, which stays last.
  if (explicitMode) {
    process.stdout.write('pr_request: request_only\n');
    process.stdout.write('publication: request_published\n');
    process.stdout.write('mainline_publication: pending\n');
  }
  // #1098 §2.1-6: the machine-readable result line — additive; this sink had no stdout contract.
  process.stdout.write('sink_pr: ' + (reused ? 'reused' : 'created') + '\n');
}

if (require.main === module) {
  try { main(); } catch (err) { process.stderr.write(err.message + '\n'); process.exitCode = 1; }
}

module.exports = {
  parseArgs, resolveMemberSet, closesBody,
  keepOpenLinkageBody, closingIssueNumbers, assessKeepOpenPr,
  asOwnerRepo, githubUrlOwnerRepo
};
