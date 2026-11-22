#!/usr/bin/env node
/* GeoDots regression suite.
 *
 *   npm test                 run every spec
 *   npm test -- capture      run specs whose filename contains "capture"
 *   npm test -- --seed=42    fix the RNG seed (default 20261122)
 *
 * Each spec boots a private headless Chrome, drives the real game file through
 * its own functions, and asserts on observable state. A failed assertion prints
 * the seed so the run can be reproduced.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { launch } = require('./lib/cdp.cjs');
const { Checker } = require('./lib/assert.cjs');

const ROOT = path.resolve(__dirname, '..');
const SPEC_DIR = path.join(__dirname, 'specs');

const argv = process.argv.slice(2);
const only = argv.find(a => !a.startsWith('-'));
const seedArg = argv.find(a => a.startsWith('--seed='));
const SEED = seedArg ? Number(seedArg.split('=')[1]) >>> 0 : 20261122;

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(label + ' timed out after ' + ms + ' ms')), ms); })
  ]);
}

(async () => {
  const files = fs.readdirSync(SPEC_DIR)
    .filter(f => f.endsWith('.test.cjs'))
    .filter(f => !only || f.includes(only))
    .sort();
  if (!files.length) {
    console.error('No specs matched' + (only ? ' "' + only + '"' : ''));
    process.exit(2);
  }

  let ok = 0, failed = 0;
  const started = Date.now();
  console.log('GeoDots regression suite — seed ' + SEED + ', ' + files.length + ' spec file(s)\n');

  for (const file of files) {
    const spec = require(path.join(SPEC_DIR, file));
    const check = new Checker(spec.name || file, SEED);
    let page = null;
    try {
      page = await launch({ root: ROOT, width: spec.width, height: spec.height });
      const ctx = { page, check, seed: spec.seed || SEED, root: ROOT };
      await withTimeout(Promise.resolve(spec.run(ctx)), spec.timeoutMs || 240000, file);
    } catch (e) {
      check.ok(false, 'spec threw: ' + e.message);
    } finally {
      if (page) {
        const errors = page.logs.filter(l => l.includes('[EXCEPTION]') || l.includes('[log:error]'));
        check.ok(errors.length === 0, 'no uncaught page errors', errors.slice(0, 5));
        await page.close();
      }
    }
    const r = check.result();
    if (r.failures.length) {
      failed++;
      console.log('FAIL  ' + r.name + '  (' + r.passed + '/' + r.total + ', seed ' + r.seed + ')');
      for (const f of r.failures) console.log('        ✗ ' + f);
    } else {
      ok++;
      console.log('PASS  ' + r.name + '  (' + r.passed + ' checks, seed ' + r.seed + ')');
    }
    for (const n of r.notes) console.log('        · ' + n);
  }

  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log('\n' + (failed ? 'FAILED' : 'OK') + ': ' + ok + ' spec(s) passed, ' + failed + ' failed in ' + secs + 's');
  process.exit(failed ? 1 : 0);
})().catch(e => {
  console.error('runner crashed: ' + (e && e.stack || e));
  process.exit(1);
});
