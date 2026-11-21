/* GeoDots playtest harness.
 *
 * Drives the live game through the same DOM handlers a player uses (button
 * clicks, canvas mouse events, tab clicks) on the real requestAnimationFrame
 * loop. It never calls stepSim() directly, so simulation timing, AI and
 * rendering stay exactly as they are in normal play.
 *
 * Reports are persisted to localStorage so a reload does not lose evidence.
 */
(() => {
  const PT = window.PT = {
    running: false,
    samples: [],
    errors: [],
    actions: 0,
    reports: [],
    progress: null,
    startedAt: 0,
    meta: null
  };

  try {
    PT.reports = JSON.parse(localStorage.getItem('geodots.pt.reports') || '[]');
  } catch (e) { PT.reports = []; }

  window.addEventListener('error', e => {
    PT.errors.push({ sim: world ? Math.round(world.time) : null, msg: String(e.message) });
  });
  window.addEventListener('unhandledrejection', e => {
    PT.errors.push({ sim: world ? Math.round(world.time) : null, msg: 'rejection: ' + String(e.reason) });
  });

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const human = () => { try { return humanPlayer(); } catch (e) { return null; } };
  const el = id => document.getElementById(id);
  const click = node => { if (node) node.dispatchEvent(new MouseEvent('click', { bubbles: true })); };

  function sample() {
    const p = human();
    if (!world || !p) return;
    const b = world.buildings;
    const mine = b.filter(x => !x.dead && x.owner === p.idx);
    const s = {
      sim: +world.time.toFixed(1),
      tick: world.tick,
      speed: CFG.SPEEDS[app.speedIdx],
      coins: +(p.cents / 100).toFixed(1),
      cpt: p.incomeCpt != null ? +p.incomeCpt.toFixed(1) : null,
      units: world.units.filter(u => !u.dead && u.owner === p.idx).length,
      buildings: mine.length,
      cities: mine.filter(x => x.capturable).length,
      enemyCities: b.filter(x => !x.dead && x.capturable && x.owner >= 0 && x.owner !== p.idx).length,
      alive: world.players.filter(x => x.alive).length,
      obj: p.objDone,
      effects: world.effects.length,
      dom: document.getElementsByTagName('*').length,
      toasts: el('toasts') ? el('toasts').children.length : 0,
      nan: ['cents', 'warExhaustion'].some(k => !Number.isFinite(p[k]))
        || (p.incomeCpt != null && !Number.isFinite(p.incomeCpt)),
      state: app.state,
      result: !el('resultScr').classList.contains('hidden')
    };
    PT.samples.push(s);
    if (PT.samples.length > 600) PT.samples.shift();
  }

  function targetCity() {
    const p = human();
    let best = null, bd = Infinity;
    for (const b of world.buildings) {
      if (b.dead || !b.capturable || b.owner < 0 || b.owner === p.idx) continue;
      const d = (b.x - p.startX) ** 2 + (b.y - p.startY) ** 2;
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  function act() {
    if (!world || app.state !== 'play' || app.paused) {
      if (PT.progress) PT.progress.pausedTicks = (PT.progress.pausedTicks || 0) + 1;
      return;
    }
    const p = human();
    if (!p) return;

    // Select the army through the command bar, then push it at the nearest
    // hostile city with a real right-click on the canvas.
    click(el('btnAllCombat'));
    const tgt = targetCity();
    if (tgt && sel.units.length) {
      cam.x += (tgt.x - cam.x) * 0.45;
      cam.y += (tgt.y - cam.y) * 0.45;
      clampCam();
      const sx = innerWidth / 2 + (tgt.x - cam.x) * cam.z;
      const sy = innerHeight / 2 + (tgt.y - cam.y) * cam.z;
      if (sx > 4 && sy > 70 && sx < innerWidth - 4 && sy < innerHeight - 140) {
        canvas.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 2, clientX: sx, clientY: sy }));
        PT.actions++;
      }
    }

    // Resolve a pending placement by confirming at the capital.
    if (app.uimode === 'place') {
      const hp = human();
      const sx = innerWidth / 2 + (hp.startX - cam.x) * cam.z;
      const sy = innerHeight / 2 + (hp.startY - cam.y) * cam.z;
      canvas.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: sx + 30, clientY: sy + 30 }));
    }

    // Buy the cheapest useful thing currently offered.
    const row = el('bbRow');
    if (row) {
      const buy = [...row.querySelectorAll('.bbtn:not(.dis)')];
      if (buy.length) {
        click(buy[Math.floor(Math.random() * Math.min(3, buy.length))]);
        PT.actions++;
      } else {
        const tabs = [...document.querySelectorAll('.btab')];
        if (tabs.length) click(tabs[Math.floor(Math.random() * tabs.length)]);
      }
    }
  }

  const PANELS = ['ecoScr', 'objScr', 'diploScr', 'mpScr'];
  let panelTick = 0;

  function uiExercise() {
    if (!world || app.state !== 'play') return;
    panelTick++;
    // Cycle tabs so economy, defence, strike and aid catalogues all get used.
    const tabs = [...document.querySelectorAll('.btab')];
    if (tabs.length) click(tabs[panelTick % tabs.length]);
    // Open and close a panel, checking that the map keeps simulating underneath.
    if (panelTick % 3 === 0) {
      const map = [
        ['ecoHudBtn', 'ecoClose'],
        ['objHudBtn', 'objClose'],
        ['rosterBtn', 'rosterBtn'],
        ['diploHudBtn', 'diploClose'],
        ['mpHudBtn', 'mpClose']
      ];
      const pair = map[(panelTick / 3 | 0) % map.length];
      const openBtn = el(pair[0]);
      if (openBtn && !openBtn.classList.contains('hidden')) {
        click(openBtn);
        setTimeout(() => click(el(pair[1])), 900);
      }
    }
  }

  function rotateSpeed() {
    if (!PT.running || !world || app.state !== 'play') return;
    const cycle = [2, 3, 4, 5, 1, 0];
    const cur = app.speedIdx;
    const next = cycle[(cycle.indexOf(cur) + 1) % cycle.length];
    const b = document.querySelector(`.spd[data-s="${next}"]`);
    if (b) click(b);
  }

  PT.start = (opts = {}) => {
    PT.stop();
    PT.running = true;
    PT.startedAt = performance.now();
    PT.samples = [];
    PT.errors = [];
    PT.actions = 0;
    PT.meta = opts;
    if (opts.speed != null) {
      const b = document.querySelector(`.spd[data-s="${opts.speed}"]`);
      if (b) click(b);
    }
    sample();
    PT.timer = setInterval(sample, 5000);
    PT.actT = setInterval(act, 6500);
    PT.uiT = setInterval(uiExercise, 21000);
    PT.spdT = setInterval(rotateSpeed, 75000);
    return true;
  };

  PT.stop = () => {
    PT.running = false;
    clearInterval(PT.timer); clearInterval(PT.actT);
    clearInterval(PT.uiT); clearInterval(PT.spdT);
  };

  PT.report = () => {
    const s = PT.samples;
    if (!s.length) return { error: 'no samples' };
    const first = s[0], last = s[s.length - 1];
    const num = k => s.map(x => x[k]).filter(v => typeof v === 'number');
    const rep = {
      country: PT.meta && PT.meta.code,
      name: PT.meta && PT.meta.name,
      mode: world ? world.mode : null,
      durationSim: +(last.sim - first.sim).toFixed(1),
      durationReal: +((performance.now() - PT.startedAt) / 1000).toFixed(1),
      samples: s.length,
      actions: PT.actions,
      errors: PT.errors.slice(0, 12),
      start: first,
      end: last,
      coins: [Math.min(...num('coins')), Math.max(...num('coins'))],
      units: [Math.min(...num('units')), Math.max(...num('units'))],
      cities: [Math.min(...num('cities')), Math.max(...num('cities'))],
      alive: [Math.min(...num('alive')), Math.max(...num('alive'))],
      effectsMax: Math.max(...num('effects')),
      dom: [Math.min(...num('dom')), Math.max(...num('dom'))],
      toastsMax: Math.max(...num('toasts')),
      speeds: [...new Set(num('speed'))],
      nan: s.some(x => x.nan),
      defeated: human() ? !human().alive : null,
      result: s.some(x => x.result)
    };
    PT.reports.push(rep);
    try { localStorage.setItem('geodots.pt.reports', JSON.stringify(PT.reports)); } catch (e) {}
    return rep;
  };

  PT.dump = () => {
    try { return JSON.parse(localStorage.getItem('geodots.pt.reports') || '[]'); } catch (e) { return PT.reports; }
  };

  PT.clear = () => {
    PT.reports = [];
    try { localStorage.removeItem('geodots.pt.reports'); } catch (e) {}
  };

  /* Launch a country through the real menu -> setup -> launch flow. */
  PT.launch = async (code) => {
    const db = REAL_COUNTRY_DB[code];
    if (!db) return { error: 'unknown country ' + code };
    if (app.state !== 'title') await PT.quitToMenu();
    const menuBtn = el('menuNew');
    if (menuBtn) click(menuBtn);
    if (el('setupNext')) click(el('setupNext'));
    const cards = [...document.querySelectorAll('#countryGrid .ccard')];
    const card = cards.find(c => {
      const n = c.querySelector('.cname');
      return n && n.textContent.trim() === db.name;
    });
    if (!card) return { error: 'card not found for ' + code, cards: cards.length };
    click(card);
    click(el('setupNext'));
    click(el('setupNext'));
    click(el('playBtn'));
    // Let the countdown finish without skipping it.
    await sleep(2600);
    return { state: app.state, country: app.myCountry, mode: app.gameMode };
  };

  PT.quitToMenu = async () => {
    if (el('resultScr') && !el('resultScr').classList.contains('hidden')) {
      click(el('titleBtn'));
      await sleep(400);
      return;
    }
    if (el('pauseScr') && el('pauseScr').classList.contains('hidden') && el('pauseBtn')) click(el('pauseBtn'));
    await sleep(250);
    if (el('quitBtn')) click(el('quitBtn'));
    await sleep(350);
  };

  /* Sequential tour: one real-time session per country. Progress is written to
   * localStorage after every country so an interrupted run keeps its evidence. */
  PT.tour = async (codes, secondsPerCountry) => {
    PT.tourReports = [];
    PT.progress = { i: 0, total: codes.length, code: null, startedAt: Date.now(), secondsPerCountry };
    for (let i = 0; i < codes.length; i++) {
      const code = codes[i];
      const db = REAL_COUNTRY_DB[code];
      PT.progress = { i, total: codes.length, code, name: db.name, phase: 'launch', startedAt: Date.now(), secondsPerCountry };
      const launched = await PT.launch(code);
      if (launched.error) {
        PT.tourReports.push({ country: code, launchError: launched.error });
        PT.progress.phase = 'launch-failed';
        continue;
      }
      if (el('countScr') && !el('countScr').classList.contains('hidden')) await sleep(1200);
      PT.start({ code, name: db.name, speed: i % 3 === 0 ? 3 : 2 });
      PT.progress.phase = 'play';
      PT.progress.endsAt = Date.now() + secondsPerCountry * 1000;
      for (let t = 0; t < secondsPerCountry; t += 5) {
        await sleep(5000);
        if (!PT.running) break;
        // Stop early if the match concluded.
        if (el('resultScr') && !el('resultScr').classList.contains('hidden')) break;
        PT.progress.elapsed = t + 5;
      }
      PT.stop();
      const rep = PT.report();
      PT.tourReports.push(rep);
      PT.progress.phase = 'report';
      await PT.quitToMenu();
      if (el('resultScr')) el('resultScr').classList.add('hidden');
      PT.progress.phase = 'done';
    }
    PT.stop();
    PT.progress.phase = 'complete';
    try { localStorage.setItem('geodots.pt.tour', JSON.stringify(PT.tourReports)); } catch (e) {}
    return PT.tourReports;
  };

  PT.dumpTour = () => {
    try { return JSON.parse(localStorage.getItem('geodots.pt.tour') || '[]'); } catch (e) { return PT.tourReports || []; }
  };
})();
