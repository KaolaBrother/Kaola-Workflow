#!/usr/bin/env node
// Summarize a `devin -p --export` file: model_name, tool_definitions names, powered-by messages,
// generation_model set, final_metrics. usage: export-summary.js <export.json> [...]
const fs = require('fs');
for (const f of process.argv.slice(2)) {
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  const tools = (j.agent?.tool_definitions || []).map((t) => t.function?.name || t.name).sort();
  const powered = [], gen = new Set();
  for (const s of j.steps || []) {
    if (s.source === 'system' && typeof s.message === 'string' && s.message.includes('You are powered by')) powered.push(s.message.trim());
    const g = s.extra?.generation_model; if (g) gen.add(g);
  }
  console.log(`== ${f}`);
  console.log(`session_id: ${j.session_id}`);
  console.log(`agent.model_name: ${j.agent?.model_name}`);
  console.log(`tool_definitions (${tools.length}): ${tools.join(',')}`);
  console.log(`has sidekick tool: ${tools.includes('sidekick')}`);
  console.log(`powered_by: ${JSON.stringify(powered)}`);
  console.log(`generation_model: ${[...gen].join(',')}`);
  console.log(`final_metrics: ${JSON.stringify(j.final_metrics)}`);
}
