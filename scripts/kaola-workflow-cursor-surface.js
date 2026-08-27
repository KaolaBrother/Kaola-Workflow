#!/usr/bin/env node
'use strict';

// Reports Cursor install/discovery surface facts. Does not infer App from a CLI
// binary, CLI from Cursor.app, or local from an App-started Cloud run.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ADAPTER_SOURCE = path.join(ROOT, 'templates', 'agents', 'runtime-capabilities.json');
const ALLOWED_PRODUCT = new Set(['cli', 'app', 'unknown']);
const ALLOWED_HOST = new Set(['local', 'cloud', 'unknown']);

function parseArgs(argv) {
  const out = { json: false, product: 'unknown', host: 'unknown' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--product') {
      out.product = String(argv[++i] || '').trim() || 'unknown';
    } else if (a === '--host') {
      out.host = String(argv[++i] || '').trim() || 'unknown';
    } else if (a === '--help' || a === '-h') {
      out.help = true;
    }
  }
  return out;
}

function loadCursorAdapter() {
  const source = JSON.parse(fs.readFileSync(ADAPTER_SOURCE, 'utf8'));
  const adapter = source.runtimes && source.runtimes.cursor;
  if (!adapter || adapter.runtime !== 'cursor') {
    throw new Error('cursor adapter missing from runtime-capabilities.json');
  }
  return adapter;
}

function loadVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    return typeof pkg.version === 'string' && pkg.version.trim() ? pkg.version : 'unknown';
  } catch (_) {
    return 'unknown';
  }
}

function report(opts) {
  const product = ALLOWED_PRODUCT.has(opts.product) ? opts.product : 'unknown';
  const host = ALLOWED_HOST.has(opts.host) ? opts.host : 'unknown';
  const adapter = loadCursorAdapter();
  const surfaces = adapter.surfaces || null;
  const selected = surfaces && product !== 'unknown' && surfaces[product]
    ? (surfaces[product].execution_hosts && surfaces[product].execution_hosts[host]) || null
    : null;
  return {
    runtime: 'cursor',
    product_surface: product,
    execution_host: host,
    kaola_workflow_version: loadVersion(),
    inferred_from_sibling_binary: false,
    ambient_repository_write: false,
    project_materialization: 'explicit --target DIR',
    global_root: '${CURSOR_HOME:-$HOME/.cursor}',
    global_discovery: selected ? selected.global_discovery : 'unknown',
    required_project_materialization: selected
      ? selected.required_project_materialization : 'unknown',
    named_catalog: selected ? selected.named_catalog : 'unknown',
    reload: selected ? selected.reload : 'unknown',
    evidence_stamp: selected && selected.stamp ? selected.stamp : null,
    capability_gap: selected && selected.named_catalog === 'built_in_only'
      ? 'catalog_miss' : 'unknown',
    surfaces: surfaces,
    selected_host: selected,
    note: 'Pass --product cli|app and --host local|cloud. Unknown stays unknown. Sibling binaries are never inferred.',
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(
      'Usage: node scripts/kaola-workflow-cursor-surface.js [--json] '
      + '[--product cli|app|unknown] [--host local|cloud|unknown]\n'
    );
    return 0;
  }
  const body = report(args);
  if (args.json) process.stdout.write(JSON.stringify(body, null, 2) + '\n');
  else {
    process.stdout.write(
      'runtime=cursor product=' + body.product_surface
      + ' host=' + body.execution_host
      + ' ambient_repository_write=' + body.ambient_repository_write + '\n'
    );
  }
  return 0;
}

if (require.main === module) process.exit(main());

module.exports = { report, loadCursorAdapter };
