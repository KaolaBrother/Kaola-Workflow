'use strict';

// Isolate sink-pr's homedir-based config lookup inside the retained fixture.
const os = require('os');
const target = process.env.KW1113_FIXTURE_HOME;
if (!target) throw new Error('KW1113_FIXTURE_HOME is required for this fixture');
os.homedir = () => target;
