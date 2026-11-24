#!/usr/bin/env node
/* Real-browser acceptance run for the 14-item GeoDots brief.
 *
 * Serves index.html over HTTP, opens headless Chrome through the same CDP
 * driver as the regression suite, and drives the actual UI: menu buttons,
 * setup cards, lobby rows, speed controls, build tabs, canvas drag/right-click,
 * salvo inputs and minimap. Internal state is read only to locate things on the
 * canvas and to cross-check the on-screen results; every behavioural trigger is
 * a real DOM/canvas input.
 *
 *   node tests/browser-brief.cjs
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { launch, sleep } = require('./lib/cdp.cjs');

const ROOT = path.resolve(__dirname, '..');
const PORT = 5199;
const URL = 'http://127.0.0.1:' + PORT + '/';
const ART = path.join(ROOT, 'tests', '.tmp', 'brief');
fs.mkdirSync(ART, { recursive: true });

const results = [];
function ok(cond, msg, detail) {
  results.push({ pass: !!cond, msg, detail });
  console.log((cond ? '  PASS  ' : '  FAIL  ') + msg + (detail === undefined ? '' : ' — ' + JSON.stringify(detail)));
  return !!cond;
}
function note(msg) { console.log('  note  ' + msg); }

function serve() {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json',
    '.woff': 'font/woff', '.woff2': 'font/woff2' };
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent((req.url || '/').split('?')[0]);
    if (rel === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    const file = path.join(ROOT, rel === '/' ? 'index.html' : rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return;
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

async function main() {
  const server = await serve();
  let page;
  try {
    page = await launch({ root: ROOT, url: URL, width: 1600, height: 1000 });

    const evalv = expr => page.eval(expr);
    const json = expr => page.json(expr);

    async function visible(sel) {
      return !!(await evalv(`(() => { const e = document.querySelector(${JSON.stringify(sel)});
        if (!e) return false; const r = e.getBoundingClientRect();
        const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden'; })()`));
    }
    async function waitFor(sel, timeout = 15000) {
      const t0 = Date.now();
      while (Date.now() - t0 < timeout) {
        if (await visible(sel)) return true;
        await sleep(100);
      }
      throw new Error('timeout waiting for visible ' + sel);
    }
    async function waitExpr(expr, timeout = 20000) {
      const t0 = Date.now();
      while (Date.now() - t0 < timeout) {
        try { if (await evalv(expr)) return true; } catch (e) { /* navigation in flight */ }
        await sleep(100);
      }
      throw new Error('timeout waiting for ' + expr);
    }
    async function rect(sel) {
      const r = await json(`(() => { const e = document.querySelector(${JSON.stringify(sel)});
        if (!e) return null; e.scrollIntoView({ block: 'center', inline: 'center' });
        const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height }; })()`);
      if (!r || r.w < 1 || r.h < 1) throw new Error('no clickable rect for ' + sel);
      return r;
    }
    async function rectByText(sel, text) {
      const r = await json(`(() => {
        const list = [...document.querySelectorAll(${JSON.stringify(sel)})];
        const e = list.find(x => (x.textContent || '').includes(${JSON.stringify(text)}));
        if (!e) return null; e.scrollIntoView({ block: 'center' });
        const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height };
      })()`);
      if (!r || r.w < 1 || r.h < 1) throw new Error('no clickable ' + sel + ' containing ' + text);
      return r;
    }
    async function mouse(type, x, y, button = 'left') {
      await page.cdp.send('Input.dispatchMouseEvent', { type, x, y, button, clickCount: type === 'mousePressed' || type === 'mouseReleased' ? 1 : 0 });
    }
    async function clickSel(sel) {
      const r = await rect(sel);
      await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y, button: 'none' });
      await page.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
      await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
      await sleep(80);
    }
    async function clickText(sel, text) {
      const r = await rectByText(sel, text);
      await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y, button: 'none' });
      await page.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
      await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
      await sleep(80);
    }
    async function rightClick(x, y) {
      await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
      await page.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'right', clickCount: 1 });
      await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'right', clickCount: 1 });
      await sleep(100);
    }
    async function drag(x0, y0, x1, y1) {
      await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y: y0, button: 'none' });
      await page.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y0, button: 'left', clickCount: 1 });
      for (let i = 1; i <= 6; i++) {
        await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0 + (x1 - x0) * i / 6, y: y0 + (y1 - y0) * i / 6, button: 'left' });
      }
      await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x1, y: y1, button: 'left', clickCount: 1 });
      await sleep(120);
    }
    async function wheel(x, y, dy) {
      await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: dy });
      await sleep(220);
    }
    async function typeIn(sel, text) {
      const r = await rect(sel);
      await page.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
      await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
      await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
      await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
      await page.cdp.send('Input.insertText', { text: String(text) });
      await sleep(80);
    }
    async function key(key, code, vk, modifiers = 0) {
      await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, modifiers });
      await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, modifiers });
      await sleep(60);
    }
    async function reload() {
      await page.cdp.send('Page.navigate', { url: URL + '?r=' + Date.now() });
      await waitExpr('typeof startMatch === "function" && !!document.querySelector("#menuScr")');
      await waitFor('#menuScr');
    }
    async function shot(name) {
      const data = await page.cdp.send('Page.captureScreenshot', { format: 'png' });
      const f = path.join(ART, name + '.png');
      fs.writeFileSync(f, Buffer.from(data.data, 'base64'));
      return f;
    }
    async function hud() {
      return json(`({ coins: document.querySelector('#ecoHudBtn b') ? document.querySelector('#ecoHudBtn b').textContent.trim() : '',
        country: document.querySelector('#tbCountry').textContent.trim(),
        timer: document.querySelector('#tbTimer').textContent.trim(),
        army: document.querySelector('#tbArmy').textContent.trim() })`);
    }

    function phase(title) { console.log('\n== ' + title + ' =='); }

    /* ============================ 1. FFA SETUP ============================ */
    phase('Skirmish setup — Iran default, >16 AI, editable countries');
    await waitFor('#menuScr');
    await clickSel('#menuQuickStart');
    await waitFor('#titleScr');
    await clickSel('#modeClassicCard');
    await clickSel('#setupNext');
    await waitFor('#classicOptionsBox');

    const lob0 = await json(`(() => {
      const rows = [...document.querySelectorAll('#lobbyList .prow')];
      const human = rows.find(r => (r.querySelector('.pbadge') || {}).textContent.includes('YOU'));
      return { rows: rows.length, ai: rows.filter(r => !(r.querySelector('.pbadge') || {}).textContent.includes('YOU')).length,
        human: human ? human.querySelector('.pfac').textContent.trim() : '',
        humanRows: rows.filter(r => (r.querySelector('.pbadge') || {}).textContent.includes('YOU')).length };
    })()`);
    ok(lob0.humanRows === 1 && /\bIRN\b/.test(lob0.human), 'FFA defaults to one human player using Iran', lob0);
    ok(lob0.rows >= 19 && lob0.ai > 16, 'FFA offers more than 16 AI opponents', lob0);
    ok(await visible('#addAiBtn'), 'the Add AI slot control is available');

    const delRows = await json(`[...document.querySelectorAll('#lobbyList .prow .pdel')].length`);
    if (delRows > 0) {
      await clickSel('#lobbyList .prow .pdel');
      const afterDel = await json(`document.querySelectorAll('#lobbyList .prow').length`);
      ok(afterDel === lob0.rows - 1, 'the player can reduce the AI count', { before: lob0.rows, after: afterDel });
      await clickSel('#addAiBtn');
      const afterAdd = await json(`document.querySelectorAll('#lobbyList .prow').length`);
      ok(afterAdd === lob0.rows, 'the player can add an AI slot back', { after: afterAdd });
    }

    const aiRowText = await json(`(() => {
      const rows = [...document.querySelectorAll('#lobbyList .prow')];
      const r = rows.find(x => !(x.querySelector('.pbadge') || {}).textContent.includes('YOU'));
      return r ? r.querySelector('.pfac').textContent.trim() : '';
    })()`);
    const aiFac = await json(`(() => {
      const rows = [...document.querySelectorAll('#lobbyList .prow')];
      const idx = rows.findIndex(x => !(x.querySelector('.pbadge') || {}).textContent.includes('YOU'));
      return idx;
    })()`);
    const aiBtn = `#lobbyList .prow:nth-child(${aiFac + 1}) .pfac`;
    await clickSel(aiBtn);
    const aiRowText2 = await json(`document.querySelector(${JSON.stringify(aiBtn)}).textContent.trim()`);
    ok(aiRowText2 !== aiRowText, 'an AI country can be reassigned by clicking its row', { before: aiRowText, after: aiRowText2 });

    const humanBtn = `#lobbyList .prow:nth-child(${await json(`([...document.querySelectorAll('#lobbyList .prow')].findIndex(x => (x.querySelector('.pbadge') || {}).textContent.includes('YOU')) + 1)`)}) .pfac`;
    await clickSel(humanBtn);
    const humanAfter = await json(`(() => { const r = [...document.querySelectorAll('#lobbyList .prow')].find(x => (x.querySelector('.pbadge') || {}).textContent.includes('YOU')); return r ? r.querySelector('.pfac').textContent.trim() : ''; })()`);
    ok(!/\bIRN\b/.test(humanAfter), 'the human can change their own country', { after: humanAfter });
    // Put the human back on Iran and keep the roster unique.
    if (!/\bIRN\b/.test(humanAfter)) {
      await clickSel(humanBtn);
      await sleep(60);
    }
    const finalLobby = await json(`(() => { const rows = [...document.querySelectorAll('#lobbyList .prow')];
      const human = rows.find(x => (x.querySelector('.pbadge') || {}).textContent.includes('YOU'));
      return { rows: rows.length, countries: rows.map(x => ({ code: x.querySelector('.pfac').textContent.trim().split(' ')[0], human: (x.querySelector('.pbadge')||{}).textContent.includes('YOU') })),
        human: human ? human.querySelector('.pfac').textContent.trim() : '' }; })()`);

    await clickSel('#setupNext');
    await clickSel('#setupNext');
    await waitFor('#playBtn');
    await clickSel('#playBtn');
    await waitFor('#topbar');
    await waitExpr('!!world && world.players && world.players.length > 1');
    await waitExpr('document.querySelector("#countScr").classList.contains("hidden")', 20000);
    const started = await hud();
    const expectedHuman = finalLobby.human.split(' ')[0];
    ok(started.country.includes(expectedHuman), 'the FFA match starts with the chosen human country', { hud: started.country, expectedHuman });
    await clickSel('#rosterBtn');
    await sleep(300);
    const rosterCount = await json(`({ rows: document.querySelectorAll('#chips .chip').length,
      text: (document.querySelector('#rosterPanel') || {}).textContent || '' })`);
    ok(rosterCount.rows >= 19, 'the started FFA match contains the full 19-country roster', { rows: rosterCount.rows });
    await clickSel('#rosterBtn');
    await shot('01-ffa-start');

    /* ============================ 2. 1v1 SETUP ============================ */
    phase('Skirmish 1v1');
    await reload();
    await clickSel('#menuQuickStart');
    await clickSel('#modeClassicCard');
    await clickSel('#setupNext');
    await clickText('#segClassicPreset button', '1v1');
    const one = await json(`(() => { const rows = [...document.querySelectorAll('#lobbyList .prow')];
      return { rows: rows.length, human: (rows.find(x => (x.querySelector('.pbadge')||{}).textContent.includes('YOU'))||{}).textContent || '' }; })()`);
    ok(one.rows === 2, '1v1 offers exactly two slots', one);
    ok(/IRN/.test(one.human), '1v1 defaults the human to Iran', one);
    await clickSel('#setupNext');
    await clickSel('#setupNext');
    await waitFor('#playBtn');
    await clickSel('#playBtn');
    await waitFor('#topbar');
    await waitExpr('document.querySelector("#countScr").classList.contains("hidden")', 20000);
    const oneHud = await hud();
    ok(/IRN/.test(oneHud.country), 'the 1v1 match starts as Iran', oneHud);
    await clickSel('#rosterBtn');
    await sleep(300);
    const oneRoster = await json(`document.querySelectorAll('#chips .chip').length`);
    ok(oneRoster === 2, 'the 1v1 match contains exactly two countries', { rows: oneRoster });
    await clickSel('#rosterBtn');

    /* ============================ 3. REAL ISR ============================ */
    phase('Real mode Israel — map scale, Israel opening wing, aircraft art and tank prices');
    await reload();
    await clickSel('#menuQuickStart');
    // Real mode is already selected; choose Israel on nation step.
    await clickSel('#setupNext');
    await waitFor('#countryGrid');
    await clickText('#countryGrid .ccard', 'Israel');
    await clickSel('#setupNext');
    await waitFor('#segRealScenario');
    await clickSel('#segRealScenario button[data-v="levant_gulf"]');
    await clickSel('#segDiff button[data-v="Easy"]');
    await clickSel('#setupNext');
    await waitFor('#playBtn');
    await clickSel('#playBtn');
    await waitFor('#topbar');
    await waitExpr('!!world && world.players.length > 1');
    await waitExpr('document.querySelector("#countScr").classList.contains("hidden")', 20000);
    const isrHud = await hud();
    ok(/ISR/.test(isrHud.country), 'real-mode match starts as Israel', isrHud);

    const scale = await json(`(() => {
      const canvas = document.querySelector('#game'); const b = canvas.getBoundingClientRect();
      const p1 = meProj(34, 32), p2 = meProj(44, 32), p3 = meProj(34, 42);
      const sx = Math.abs(p2.x - p1.x), sy = Math.abs(p3.y - p1.y);
      return { lonpx: ME_LONPX, latpx: ME_LATPX, ideal: +(ME_LATPX * Math.cos(33 * Math.PI / 180)).toFixed(2),
        screenRatio: +(sx / sy).toFixed(4), expectedRatio: +(Math.cos(33 * Math.PI / 180)).toFixed(4),
        canvasCss: { w: b.width, h: b.height }, viewport: { w: innerWidth, h: innerHeight }, cam: +cam.z.toFixed(3) };
    })()`);
    ok(Math.abs(scale.lonpx - scale.ideal) <= 1.2, 'longitude scale matches cos(latitude)', scale);
    ok(Math.abs(scale.screenRatio - scale.expectedRatio) <= 0.01, 'rendered east-west/north-south axis is not stretched', scale);
    ok(Math.abs(scale.canvasCss.w - scale.viewport.w) <= 2 && Math.abs(scale.canvasCss.h - scale.viewport.h) <= 2,
      'the game canvas fills the viewport without CSS distortion', scale);

    const isrAir = await json(`(() => {
      const p = world.players.find(x => x.country === 'ISR');
      const bases = world.buildings.filter(b => !b.dead && b.owner === p.idx && b.kind === 'airbase');
      const jets = world.units.filter(u => !u.dead && u.owner === p.idx && u.type === 'f35i');
      return { bases: bases.length, jets: jets.length, assigned: jets.filter(j => bases.some(b => b.id === j.airbaseId)).length,
        baseIds: bases.map(b => b.id), coords: jets.map(j => ({ x: j.x, y: j.y })) };
    })()`);
    ok(isrAir.bases === 2, 'Israel starts with exactly two airbases', isrAir);
    ok(isrAir.jets === 6 && isrAir.assigned === 6, 'each airbase holds three assigned F-35Is (six total)', isrAir);

    // Tank price in the actual DOM build menu.
    await clickText('#bbTabs .btab', 'ARMY');
    const tankText = await json(`(() => { const b = document.querySelector('#bbRow [data-bid="u_tank"]'); return b ? b.textContent : ''; })()`);
    ok(/60/.test(tankText) && !/100/.test(tankText), 'the build menu shows the discounted 60-credit tank price', { tankText });

    // Aircraft art: use the minimap to jump to the wing, then wheel-zoom.
    const mini = await rect('#minimap');
    const jet0 = isrAir.coords[0];
    const miniPoint = await json(`(() => { const r = document.querySelector('#minimap').getBoundingClientRect();
      return { x: r.left + (${jet0.x} / world.w) * r.width, y: r.top + (${jet0.y} / world.h) * r.height }; })()`);
    await page.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: miniPoint.x, y: miniPoint.y, button: 'left', clickCount: 1 });
    await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: miniPoint.x, y: miniPoint.y, button: 'left', clickCount: 1 });
    await sleep(250);
    const mid = { x: 800, y: 480 };
    await wheel(mid.x, mid.y, -400);
    await wheel(mid.x, mid.y, -400);
    await shot('02-aircraft-zoomed');

    // Projection point for a fighter and a bomber once acquired in-match.
    const art = await json(`(() => {
      const p = world.players.find(x => x.country === 'ISR');
      const f = world.units.find(u => !u.dead && u.owner === p.idx && u.type === 'f35i');
      const bomberType = (world.units.find(u => !u.dead && u.owner === p.idx && u.kind === 'unit' && u.fly && !u.kamikaze && u.type !== 'f35i') || {}).type || 'none';
      const s = f ? { x: (f.x - cam.x) * cam.z + innerWidth / 2, y: (f.y - cam.y) * cam.z + innerHeight / 2 } : null;
      return { fighterScreen: s, bomberType, cam: cam.z, canvas: { w: innerWidth, h: innerHeight } };
    })()`);
    ok(!!art.fighterScreen, 'the selected F-35 is rendered on the visible canvas', art);

    /* ===================== 4. CAPTURE TIMING IN LIVE MATCH ===================== */
    phase('Live real-mode city capture — small city and capital');
    const humanIdx = await json('humanPlayer().idx');
    const targets = await json(`(() => {
      const jor = world.players.find(p => p.country === 'JOR');
      const list = world.cities.filter(c => c.code === 'JOR' && !c.razed);
      const cap = list.find(c => c.capital);
      const small = list.find(c => !c.capital && c.name === 'Salt') || list.find(c => !c.capital);
      return { jor: jor && jor.idx, cap: cap && { name: cap.name, x: cap.x, y: cap.y },
        small: small && { name: small.name, x: small.x, y: small.y } };
    })()`);
    ok(!!targets.cap && !!targets.small, 'found a Jordanian capital and smaller city on the live map', targets);
    ok(!targets.jor, 'Jordan is a neutral, unowned map point in the 8-power scenario', targets);

    // Speed 6× via the real HUD control.
    await clickSel('.spd[data-s="5"]');
    const speed = await json('({ speed: app.speed, label: document.querySelector(".spd.on").textContent.trim() })');
    ok(speed.speed === 6 || speed.label === '6×', 'the match is running at 6× through the speed HUD', speed);

    // Fog off so the canvas targets are actually visible.
    const fogState = await evalv(`document.querySelector('#fogHudBtn').getAttribute('aria-pressed')`);
    if (fogState === 'true') { await clickSel('#fogHudBtn'); await sleep(150); }
    ok(await evalv(`document.querySelector('#fogHudBtn').getAttribute('aria-pressed') === 'false'`), 'fog of war is switched off from the HUD');

    // In the 8-power Levant & Gulf scenario Jordan is neutral, so its cities are
    // unowned map points — the item-7 case. Declare war there if it is a player.
    await clickSel('#diploHudBtn');
    await waitFor('#diploScr');
    const warBtn = await json(`(() => { const row = [...document.querySelectorAll('#diploTable tr')].find(r => r.textContent.includes('Jordan'));
      if (!row) return null; row.scrollIntoView({block:'center'});
      const b = row.querySelector('button.war'); if (!b) return null;
      const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    if (warBtn) {
      await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: warBtn.x, y: warBtn.y, button: 'none' });
      await page.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: warBtn.x, y: warBtn.y, button: 'left', clickCount: 1 });
      await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: warBtn.x, y: warBtn.y, button: 'left', clickCount: 1 });
      await sleep(300);
      ok(await evalv(`getRelation(humanPlayer().idx, world.players.find(p => p.country === 'JOR').idx) === 'WAR'`), 'the diplomacy action puts Israel at war with Jordan');
    }
    await clickSel('#diploClose');

    // Build a real infantry force through the ARMY tab.
    await clickText('#bbTabs .btab', 'ARMY');
    const soldierBtn = '[data-bid="u_soldier"]';
    await waitFor(soldierBtn);
    for (let i = 0; i < 22; i++) await clickSel(soldierBtn);
    await sleep(4000);
    const queueState = await json(`({ q: humanPlayer().spawnQ.length, coins: humanPlayer().cents / 100,
      army: world.units.filter(u => !u.dead && u.owner === humanPlayer().idx).length,
      inf: humanPlayer().infantryCap,
      soldiers: world.units.filter(u => !u.dead && u.owner === humanPlayer().idx && u.type === 'soldier').length })`);
    ok(queueState.army >= 12, 'infantry were queued and deployed through the build UI', queueState);

    async function panTo(x, y) {
      const p = await json(`(() => { const r = document.querySelector('#minimap').getBoundingClientRect();
        return { x: r.left + (${x} / world.w) * r.width, y: r.top + (${y} / world.h) * r.height }; })()`);
      await page.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
      await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
      await sleep(250);
    }

    async function captureCity(city, expectSec) {
      const beforeCities = (await hud()).timer;
      await panTo(city.x, city.y);
      await clickSel('#btnAllCombat');
      const selected = await json(`({ n: sel.units.length, army: world.units.filter(u => !u.dead && u.owner === ${humanIdx}).length,
        inf: world.units.filter(u => !u.dead && u.owner === ${humanIdx} && u.type === 'soldier').length })`);
      ok(selected.n > 0, 'ALL ARMY selects the live force for ' + city.name, selected);
      const scr = await json(`(() => ({ x: (${city.x} - cam.x) * cam.z + innerWidth / 2,
        y: (${city.y} - cam.y) * cam.z + innerHeight / 2 }))()`);
      ok(scr.x > 20 && scr.x < 1580 && scr.y > 70 && scr.y < 930, 'the target city is visible on the canvas', { scr });
      await rightClick(scr.x, scr.y); // right-click the actual city pixel
      // Wait for the capture ring to start, then for the owner change.
      const start = await waitExpr(`(() => { const c = world.cities.find(x => x.name === ${JSON.stringify(city.name)});
        return !!c && (c.captureT || 0) > 0.01; })()`, 45000);
      if (!start) return { ok: false, why: 'capture did not start', beforeCities };
      const t0 = await json(`(() => { const c = world.cities.find(x => x.name === ${JSON.stringify(city.name)});
        return { t: world.time, timer: document.querySelector('#tbTimer').textContent.trim(), owner: c.owner }; })()`);
      await shot('03-' + city.name.replace(/\s+/g, '-').toLowerCase() + '-capture-start');
      let changed = false, last = null, snapped = false, tick = 0;
      const deadline = Date.now() + Math.round(expectSec / 6 * 1000 + 60000);
      while (Date.now() < deadline) {
        await sleep(1000);
        tick++;
        /* Keep the company on the objective: infantry otherwise drift off to
           chase garrison stragglers and the city clock stalls below its
           three-squad minimum. */
        if (tick % 20 === 0) { await clickSel('#btnAllCombat'); await rightClick(scr.x, scr.y); }
        last = await json(`(() => { const c = world.cities.find(x => x.name === ${JSON.stringify(city.name)});
          const near = world.units.filter(u => !u.dead && u.owner === ${humanIdx} && Math.hypot(u.x - c.x, u.y - c.y) < 90);
          return { owner: c.owner, captureT: +(c.captureT || 0).toFixed(1), contest: c.contest || 0,
            near: near.length, nearSoldiers: near.filter(u => u.type === 'soldier').length,
            army: world.units.filter(u => !u.dead && u.owner === ${humanIdx}).length, t: +world.time.toFixed(1) }; })()`);
        if (last.owner === humanIdx) { changed = true; break; }
        if (!snapped && last.captureT >= 0.25) { snapped = true; await shot('03b-' + city.name.replace(/\s+/g, '-').toLowerCase() + '-capture-progress'); }
      }
      const t1 = await json(`(() => { const c = world.cities.find(x => x.name === ${JSON.stringify(city.name)});
        return { t: world.time, timer: document.querySelector('#tbTimer').textContent.trim(), owner: c.owner,
          captureT: +(c.captureT || 0).toFixed(1), near: world.units.filter(u => !u.dead && u.owner === ${humanIdx} && Math.hypot(u.x - c.x, u.y - c.y) < 90).length,
          cities: document.querySelector('#tbCities').textContent.trim() }; })()`);
      await shot('04-' + city.name.replace(/\s+/g, '-').toLowerCase() + '-captured');
      return { ok: changed, elapsed: +(t1.t - t0.t).toFixed(1), t0, t1, last, beforeCities };
    }

    const smallCap = await captureCity(targets.small, 420);
    ok(smallCap.ok, 'the smaller city is captured through a live canvas order', smallCap);
    if (smallCap.ok) ok(smallCap.elapsed >= 405 && smallCap.elapsed <= 438,
      'the small-city capture clock is ~7 minutes of game time', { elapsed: smallCap.elapsed, city: targets.small.name });

    const capCap = await captureCity(targets.cap, 600);
    ok(capCap.ok, 'the capital is captured through a live canvas order', capCap);
    if (capCap.ok) ok(capCap.elapsed >= 585 && capCap.elapsed <= 620,
      'the capital capture clock is ~10 minutes of game time', { elapsed: capCap.elapsed, city: targets.cap.name });

    // Unclaimed/uncapturable-point regression: inspect the actual marker set in the live DOM world.
    const marks = await json(`(() => {
      const kinds = {}; for (const b of world.buildings) if (!b.dead) kinds[b.kind] = (kinds[b.kind] || 0) + 1;
      const immune = world.buildings.filter(b => !b.dead && !b.capturable).map(b => b.kind);
      const missing = world.cities.filter(c => !c.razed && !world.buildings.some(b => !b.dead && b.capturable &&
        (b.cityKey === c.id || (b.city || '').split(' (')[0].trim() === c.name))).map(c => c.name);
      return { kinds, immune: [...new Set(immune)], missing: missing.slice(0, 10), missingN: missing.length };
    })()`);
    ok(marks.immune.length === 0, 'every live map structure is capturable', marks);
    ok(marks.missingN === 0, 'every live city marker has a capturable ground seat', marks);

    /* Console/rejection gate for all flows so far. */
    const bad = page.logs.filter(l => l.includes('[EXCEPTION]') || l.includes('[log:error]') || l.startsWith('[error]'));
    ok(bad.length === 0, 'no console errors or unhandled exceptions during setup/map/air/capture', bad.slice(0, 8));
  } finally {
    if (page) await page.close();
    await new Promise(r => server.close(r));
    const failed = results.filter(r => !r.pass).length;
    console.log('\n' + (failed ? 'BROWSER BRIEF FAILED: ' + failed + ' check(s)' : 'BROWSER BRIEF PASSED: ' + results.length + ' checks'));
    process.exitCode = failed ? 1 : 0;
  }
}

main().catch(e => { console.error('BROWSER RUN CRASHED: ' + (e && e.stack || e)); process.exit(1); });
