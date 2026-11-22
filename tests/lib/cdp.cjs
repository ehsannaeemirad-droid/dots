/* Minimal Chrome DevTools Protocol driver used by the GeoDots test suite.
 * No third-party dependencies: Node >= 22 provides fetch and WebSocket.
 *
 * The game is a single HTML file, so a test page is just file:///…/index.html
 * with a fresh blank Chrome instance per run.
 */
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const sleep = ms => new Promise(r => setTimeout(r, ms));

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
    this.closed = false;
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { res, rej } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
      } else if (m.method) {
        for (const f of (this.handlers.get(m.method) || [])) {
          try { f(m.params); } catch (e) { /* handler must not kill the socket */ }
        }
      }
    };
    ws.onclose = () => { this.closed = true; };
  }

  send(method, params = {}) {
    if (this.closed) return Promise.reject(new Error('CDP socket closed'));
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, fn) {
    const arr = this.handlers.get(method) || [];
    this.handlers.set(method, arr.concat(fn));
  }
}

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return 'google-chrome';
}

/* Launch a private headless Chrome on a random high port. Each run gets its own
 * profile directory so concurrently open browsers cannot lock each other. */
async function launch(opts = {}) {
  const root = opts.root || path.resolve(__dirname, '..', '..');
  const port = opts.port || (9500 + Math.floor(Math.random() * 300));
  const profile = path.join(root, 'tests', '.tmp', 'profile-' + Date.now() + '-' + port);
  fs.mkdirSync(profile, { recursive: true });
  const args = [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--mute-audio',
    '--js-flags=--max-old-space-size=2048',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + profile,
    'about:blank'
  ];
  const child = spawn(findChrome(), args, { stdio: 'ignore' });
  let version = null;
  for (let i = 0; i < 160; i++) {
    try {
      version = await (await fetch('http://127.0.0.1:' + port + '/json/version')).json();
      break;
    } catch (e) { await sleep(200); }
  }
  if (!version) {
    try { child.kill(); } catch (e) {}
    throw new Error('Chrome did not expose CDP on port ' + port);
  }
  const pages = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
  const target = pages.find(t => t.type === 'page');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const cdp = new CDP(ws);

  const logs = [];
  cdp.on('Runtime.consoleAPICalled', p => {
    const txt = (p.args || []).map(a => a.value !== undefined ? String(a.value) : (a.description || a.type)).join(' ');
    logs.push('[' + p.type + '] ' + txt);
  });
  cdp.on('Runtime.exceptionThrown', p => {
    const d = p.exceptionDetails || {};
    logs.push('[EXCEPTION] ' + (d.text || '') + ' ' + ((d.exception && d.exception.description) || ''));
  });
  cdp.on('Log.entryAdded', p => {
    const e = p.entry || {};
    if (e.level === 'error' || e.level === 'warning') logs.push('[log:' + e.level + '] ' + e.text);
  });
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: opts.width || 1600, height: opts.height || 1000, deviceScaleFactor: 1, mobile: false
  });

  const file = opts.file || 'index.html';
  /* opts.url loads a hosted page (deployment verification); the default is the
     local game file, which is what every regression spec uses. */
  const url = opts.url || ('file:///' + path.join(root, file).replace(/\\/g, '/') + '?test=' + Date.now());
  const loaded = new Promise(res => cdp.onceLoad = res);
  let loadResolve;
  const loadP = new Promise(res => { loadResolve = res; });
  cdp.on('Page.loadEventFired', () => loadResolve());
  await cdp.send('Page.navigate', { url });
  await Promise.race([loadP, sleep(15000)]);

  /* Wait until the game's globals exist (script parsed and executed). */
  let ready = false;
  for (let i = 0; i < 100; i++) {
    const r = await cdp.send('Runtime.evaluate', {
      expression: 'typeof startMatch === "function" && typeof stepSim === "function" && !!REAL_COUNTRY_DB',
      returnByValue: true
    });
    if (r.result && r.result.value) { ready = true; break; }
    await sleep(100);
  }
  if (!ready) throw new Error('game globals never became available');

  /* Install the in-page test driver. */
  const helpers = fs.readFileSync(path.join(__dirname, 'helpers.js'), 'utf8');
  const inj = await cdp.send('Runtime.evaluate', {
    expression: helpers, returnByValue: true, awaitPromise: true
  });
  if (inj.exceptionDetails) {
    throw new Error('helper injection failed: ' + JSON.stringify(inj.exceptionDetails));
  }

  const page = {
    cdp,
    logs,
    async eval(expression, timeout = 600000) {
      const r = await cdp.send('Runtime.evaluate', {
        expression, returnByValue: true, awaitPromise: true, timeout
      });
      if (r.exceptionDetails) {
        const d = r.exceptionDetails;
        throw new Error('page error: ' + (d.text || '') + ' ' + ((d.exception && d.exception.description) || ''));
      }
      return r.result ? r.result.value : undefined;
    },
    async json(expression, timeout = 600000) {
      const v = await page.eval('JSON.stringify(' + expression + ')', timeout);
      if (typeof v !== 'string') throw new Error('expression did not serialise: ' + String(v));
      return JSON.parse(v);
    },
    async close() {
      try { ws.close(); } catch (e) {}
      try { child.kill(); } catch (e) {}
      await sleep(150);
      try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
    }
  };
  return page;
}

module.exports = { launch, CDP, sleep };
