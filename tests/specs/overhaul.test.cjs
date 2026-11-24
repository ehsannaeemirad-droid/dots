/* 4.md acceptance coverage: diplomacy scale, equipment, missiles, borders,
 * ceasefires, captured territory, call-to-arms, fog contacts and map scaling. */
'use strict';

module.exports = {
  name: 'overhaul/4md-acceptance',
  timeoutMs: 240000,
  async run({ page, check, seed }) {
    const boot = (countries, human, mode) => page.json(`(() => {
      return GEOTEST.boot({ mode: ${JSON.stringify(mode || 'classic')}, diff: 'Normal', human: ${JSON.stringify(human)}, countries: ${JSON.stringify(countries)}, seed: ${seed}, allAI: true });
    })()`);
    const quiet = () => page.eval('for (const p of world.players) p.aiCtl = null;');

    /* A — relationship scale and neutral missile escalation */
    await boot(['IRN', 'ISR', 'SAU', 'OMN'], 'IRN');
    await quiet();
    const rel = await page.json(`(() => {
      const irn = GEOTEST.player('IRN'), isr = GEOTEST.player('ISR'), sau = GEOTEST.player('SAU'), omn = GEOTEST.player('OMN');
      const before = scoreBetween(irn.idx, sau.idx);
      setRelation(irn.idx, sau.idx, 'CEASEFIRE', true);
      const mid = scoreBetween(irn.idx, sau.idx);
      const band = relationBand(mid);
      setRelation(irn.idx, sau.idx, 'NEUTRAL', true);
      return { irnIsr: getRelation(irn.idx, isr.idx), irnSau: before, atCeasefire: mid, band,
        afterNeutral: scoreBetween(irn.idx, sau.idx),
        bands: [0, 10, 25, 40, 60, 75, 90].map(v => relationBand(v)),
        neutralScore: scoreBetween(irn.idx, omn.idx) };
    })()`);
    check.eq(rel.irnIsr, 'WAR', 'Iran and Israel start as formal belligerents', rel);
    check.ok(rel.afterNeutral >= 20 && rel.afterNeutral <= 35, 'ceasefire lowers relations without erasing them', rel);
    check.ok(rel.bands.length === 7 && /Extremely hostile/.test(rel.bands[0]) && /Close strategic/.test(rel.bands[6]), '0–100 relationship bands are centralized', rel.bands);

    const missile = await page.json(`(() => {
      const irn = GEOTEST.player('IRN'), sau = GEOTEST.player('SAU');
      const city = GEOTEST.city('Riyadh');
      const key = Object.keys(CFG.MSL)[0];
      irn.mslStock[key] = 2;
      const seat = world.buildings.find(b => b.cityKey && b.cityKey.includes('Riyadh')) || world.buildings.find(b => b.owner === sau.idx);
      const hp0 = seat ? seat.hp : 0;
      const launched = launchMissile(irn.idx, key, city.x, city.y);
      const relNow = getRelation(irn.idx, sau.idx);
      const m = world.missiles[0];
      GEOTEST.sim(20);
      return { launched, relNow, missiles: m ? 1 : 0, targetIdx: m && m.targetIdx, victim: sau.idx,
        seat: seat && seat.id, hp0, hp1: seat && seat.hp, dead: seat && seat.dead, city: city.name };
    })()`);
    check.ok(missile.launched && missile.missiles > 0, 'a stockpiled missile can be launched', missile);
    check.eq(missile.relNow, 'WAR', 'a strike on a neutral capital declares war before impact', missile);
    check.eq(missile.targetIdx, missile.victim, 'the missile records its sovereign victim', missile);
    check.ok(missile.dead || missile.hp1 < missile.hp0, 'the missile damages the target city installation', missile);

    /* H — ceasefire duration, expiry and cooldown */
    const cease = await page.json(`(() => {
      const irn = GEOTEST.player('IRN'), sau = GEOTEST.player('SAU');
      const key = irn.idx < sau.idx ? irn.idx + ':' + sau.idx : sau.idx + ':' + irn.idx;
      setRelation(irn.idx, sau.idx, 'WAR', true);
      setAgreement(irn.idx, sau.idx, 'CEASEFIRE', true);
      const ag = getAgreement(irn.idx, sau.idx);
      const duration = ag.until - ag.started;
      const duplicate = proposeAgreement(irn.idx, sau.idx, 'CEASEFIRE');
      world.time = ag.until + 1;
      world.diploTick = 99;
      updateSkirmishDiplomacy();
      return { duration, duplicate, status: getRelation(irn.idx, sau.idx),
        cooldown: (world.ceasefireCd || {})[key] > world.time,
        score: scoreBetween(irn.idx, sau.idx) };
    })()`);
    check.ok(cease.duration >= 600, 'ceasefires have a meaningful minimum duration', cease);
    check.ok(!cease.duplicate.ok, 'duplicate ceasefires are refused', cease);
    check.eq(cease.status, 'NEUTRAL', 'ceasefire expiry returns to neutral, not war', cease);
    check.ok(cease.cooldown, 'expired ceasefires enter a cooldown', cease);

    /* C — national equipment restrictions */
    await boot(['IRN', 'ISR'], 'IRN');
    const equipment = await page.json(`(() => {
      const irn = GEOTEST.player('IRN'), isr = GEOTEST.player('ISR');
      return { irnF35: canBuildType(irn, 'f35'), isrF35: canBuildType(isr, 'f35i'),
        irnListHasF35: skirmishBuildList(irn).includes('f35'),
        irnMig: skirmishBuildList(irn).includes('mig29'),
        imported: (CFG.SKIRMISH.IMPORTED || {}) };
    })()`);
    check.eq(equipment.irnF35, false, 'Iran cannot produce the F-35', equipment);
    check.eq(equipment.isrF35, true, 'Israel can field the F-35', equipment);
    check.ok(!equipment.irnListHasF35, 'the Iranian production list omits the F-35', equipment.irnListHasF35);
    check.ok(equipment.irnMig, 'Iran retains its own aircraft inventory', equipment.irnListHasF35);

    /* B — border incursion and authorized transit */
    await boot(['IRN', 'SAU'], 'IRN');
    await quiet();
    const border = await page.json(`(() => {
      const irn = GEOTEST.player('IRN'), sau = GEOTEST.player('SAU');
      const u = GEOTEST.unitsOf('IRN').find(x => !x.fly) || GEOTEST.unitsOf('IRN')[0];
      const city = GEOTEST.city('Riyadh');
      u.x = city.x; u.y = city.y; u.path = null; u.order = null; u.foreignSince = 0; u.foreignReturn = false;
      setRelation(irn.idx, sau.idx, 'NEUTRAL', true);
      const before = scoreBetween(irn.idx, sau.idx);
      world.borderTick = 99;
      updateBorders();
      const after = scoreBetween(irn.idx, sau.idx);
      const log1 = world.borderLog.length;
      const orderedHome = !!u.order;
      setAgreement(irn.idx, sau.idx, 'TRANSIT', true);
      u.x = city.x; u.y = city.y; u.foreignSince = 0; u.foreignReturn = false; u.order = null;
      world.borderTick = 99;
      updateBorders();
      return { before, after, log1, log2: world.borderLog.length, orderedHome,
        transit: getAgreement(irn.idx, sau.idx) && getAgreement(irn.idx, sau.idx).type };
    })()`);
    check.ok(border.log1 > 0, 'unauthorized military transit is detected', border);
    check.ok(border.after < border.before, 'a border violation deteriorates relations', border);
    check.ok(border.orderedHome, 'trespassing units receive a withdrawal order', border);
    check.eq(border.transit, 'TRANSIT', 'a transit agreement is stored as a real agreement', border);
    check.eq(border.log2, border.log1, 'authorized transit produces no border violation', border);

    /* F — captured economic territory and construction */
    await boot(['IRN', 'SAU'], 'IRN');
    await quiet();
    const captured = await page.json(`(() => {
      const irn = GEOTEST.player('IRN');
      const field = world.oilFields.find(f => f.code === 'SAU');
      const sau = world.players.find(p => p.country === 'SAU');
      const city = world.cities.filter(c => c.code === 'SAU' && c.owner === sau.idx)
        .sort((a, b) => dist2(field.x, field.y, a.x, a.y) - dist2(field.x, field.y, b.x, b.y))[0];
      const best = world.buildings.find(b => !b.dead && b.cityKey === city.id);
      const bd = best ? dist2(field.x, field.y, best.x, best.y) : 0;
      if (best) convertBuildingOwner(best, irn.idx);
      const controller = territoryControllerAt(field.x, field.y);
      const before = { owner: best && best.owner, controller: controller && controller.country, d: Math.sqrt(bd) };
      irn.cents = 400000;
      const reason = canPlaceBuilding(irn.idx, 'economy', field.x, field.y);
      const b = placeBuilding(irn.idx, 'economy', field.x, field.y);
      return { ...before, reason, built: !!b, field: field.n, fieldEcon: field.econId };
    })()`);
    check.eq(captured.controller, 'IRN', 'a captured seat projects military control over its oil field', captured);
    check.eq(captured.reason, '', 'construction is permitted on occupied economic territory', captured);
    check.ok(captured.built && captured.fieldEcon, 'the occupier can construct on the captured field', captured);

    /* E — call-to-arms acceptance and real movement orders */
    await boot(['IRN', 'SAU', 'ISR'], 'IRN');
    const cta = await page.json(`(() => {
      const irn = GEOTEST.player('IRN'), sau = GEOTEST.player('SAU'), isr = GEOTEST.player('ISR');
      setAgreement(irn.idx, sau.idx, 'DEFENSIVE', true);
      setRelation(irn.idx, isr.idx, 'WAR', true);
      const old = Math.random; Math.random = () => 0.01;
      const r = requestCallToArms(sau.idx, isr.idx);
      Math.random = old;
      const sauUnits = GEOTEST.unitsOf('SAU');
      return { accepted: r.ok, units: r.units || 0, war: getRelation(sau.idx, isr.idx),
        coalition: sau.aiCtl && sau.aiCtl.coalition && sau.aiCtl.coalition.targetIdx,
        moving: sauUnits.filter(u => u.order).length };
    })()`);
    check.ok(cta.accepted && cta.units > 0, 'an ally accepts a favorable call to arms', cta);
    check.eq(cta.war, 'WAR', 'acceptance creates a real war with the named target', cta);
    check.eq(cta.coalition, 2, 'the coalition target is recorded', cta);
    check.gt(cta.moving, 0, 'accepted allies receive actual movement orders', cta);

    /* D — advisor mode and explicit failure */
    await boot(['IRN', 'SAU'], 'IRN');
    await quiet();
    const advisor = await page.json(`(() => {
      const a = world.advisors.eco;
      a.mode = 'off'; world.advisorTick = 99; updateAdvisors();
      const offCount = a.recs.length;
      a.mode = 'suggest';
      const rec = { short: 'Test invalid action', priority: 'warn', text: 'Test', execute: () => false, failure: 'test prerequisite missing' };
      addAdvisorRec('eco', rec);
      const result = executeAdvisorRec('eco', rec.id);
      return { offCount, result, failed: (app.notifs || []).some(n => /Advisor action failed/.test(n.msg) && /test prerequisite missing/.test(n.msg)) };
    })()`);
    check.eq(advisor.offCount, 0, 'Off mode clears advisor recommendations', advisor);
    check.eq(advisor.result, false, 'a failed approval returns false', advisor);
    check.ok(advisor.failed, 'a failed approval explains why instead of failing silently', advisor);

    /* I — stale contacts after leaving sensor range */
    await boot(['IRN', 'SAU'], 'IRN');
    await quiet();
    const fog = await page.json(`(() => {
      const irn = GEOTEST.player('IRN'), sau = GEOTEST.player('SAU');
      const camp = ent(irn.campId);
      const u = newUnit(sau.idx, 'soldier', camp.x + 40, camp.y + 40);
      world.units.push(u);
      updateFog();
      const seen = world.contacts && world.contacts.get(u.id);
      u.x = world.w - 20; u.y = world.h - 20;
      updateFog();
      const stale = world.contacts && world.contacts.get(u.id);
      stale.t = world.time - 60;
      updateFog();
      const gone = world.contacts && world.contacts.get(u.id);
      return { seen: !!seen, stale: !!stale, age: stale ? Math.round(world.time - stale.t) : null, gone: !gone };
    })()`);
    check.ok(fog.seen, 'a visible enemy becomes a contact', fog);
    check.ok(fog.stale, 'a contact remains after the unit leaves sensor range', fog);
    check.ok(fog.gone, 'contacts decay instead of remaining perfect intelligence', fog);

    /* H — notifications group, persist and expose history */
    const notes = await page.json(`(() => {
      toast('Repeated test event', 'crit'); toast('Repeated test event', 'crit');
      const n = (app.notifs || []).find(x => x.msg === 'Repeated test event');
      return { count: n && n.count, hasPanel: !!document.getElementById('notifPanel'), rendered: document.getElementById('notifPanel').innerHTML };
    })()`);
    check.ok(notes.count >= 2, 'repeated notifications are grouped', notes.count);
    check.ok(notes.hasPanel, 'a notification history panel exists', notes);

    /* 4.md UI completion: category filters, locked production entries, minimap drag/zoom */
    await boot(['IRN', 'KWT'], 'IRN');
    const ui = await page.json(`(() => {
      app.bbTab = 'army'; refreshBuildButtons();
      const locked = Array.from(document.querySelectorAll('.bbtn.locked'));
      const f35 = locked.find(b => b.dataset.bid === 'u_f35');
      app.notifs = []; app.notifFilter = 'war';
      const box = document.getElementById('toasts'); box.innerHTML = '';
      toast('Economic complex built', 'hint');
      const hiddenCard = box.children.length;
      toast('Missile strike incoming', 'hint');
      const shownCard = box.children.length;
      renderNotifHistory();
      const panel = document.getElementById('notifPanel');
      const chips = panel.querySelectorAll('button[onclick*="_notifFilter"]').length;
      const warText = panel.textContent;
      app.notifFilter = 'economy'; renderNotifHistory();
      const econText = panel.textContent;
      const mini = document.getElementById('minimap');
      cam.zT = 0.8; cam.z = 0.8;
      mini.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }));
      const zoomed = cam.zT;
      const rect = mini.getBoundingClientRect();
      cam.x = 0;
      mini.dispatchEvent(new PointerEvent('pointerdown', { clientX: rect.left + 1, clientY: rect.top + 1, button: 0, bubbles: true, pointerId: 7 }));
      mini.dispatchEvent(new PointerEvent('pointermove', { clientX: rect.left + rect.width * 0.75, clientY: rect.top + rect.height * 0.5, bubbles: true, pointerId: 7 }));
      mini.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7 }));
      const draggedX = cam.x;
      app.notifFilter = 'all'; renderNotifHistory();
      return { locked: locked.length, f35: !!f35, f35disabled: f35 && f35.disabled, reason: f35 && f35.title,
        hiddenCard, shownCard, chips, warText, econText, zoomed, draggedX, worldW: world.w };
    })()`);
    check.ok(ui.locked >= 3, 'unavailable production entries are rendered', ui.locked);
    check.ok(ui.f35 && ui.f35disabled && /unavailable/i.test(ui.reason || ''), 'a locked entry is disabled and explains why', ui);
    check.eq(ui.hiddenCard, 0, 'a category filter suppresses live cards outside the selected category', ui);
    check.eq(ui.shownCard, 1, 'the selected category still shows live cards', ui);
    check.ok(ui.chips >= 6, 'the field log exposes category filter controls', ui.chips);
    check.ok(/missile strike/i.test(ui.warText) && !/economic complex built/i.test(ui.warText), 'the war filter isolates war reports', ui.warText);
    check.ok(/economic complex built/i.test(ui.econText) && !/missile strike/i.test(ui.econText), 'the economy filter isolates economy reports', ui.econText);
    check.ok(ui.zoomed > 0.8, 'the minimap wheel zooms the camera', ui.zoomed);
    check.ok(ui.draggedX > ui.worldW * 0.5, 'dragging the minimap pans the camera', ui);

    /* 8 — world scale and city reduction, plus Real-mode isolation */
    await boot(['IRN', 'ISR', 'SAU', 'TUR', 'EGY', 'IRQ', 'SYR', 'JOR', 'LBN', 'UAE', 'KWT', 'QAT', 'BHR', 'OMN', 'YEM', 'PSE', 'HZB', 'HMS', 'HOU'], 'IRN');
    const classic = await page.json(`(() => {
      const irn = GEOTEST.player('IRN');
      return { space: world.spaceScale, w: world.w, h: world.h, cities: world.cities.length,
        irnCities: world.cities.filter(c => c.code === 'IRN').length, meW: ME_W, meH: ME_H };
    })()`);
    check.ok(classic.space > 1.7, 'Skirmish scales world-space as well as the canvas', classic);
    check.ok(classic.w > classic.meW * 1.6 && classic.h > classic.meH * 1.6, 'the map world coordinates are ~3x area', classic);
    check.ok(classic.cities <= 100 && classic.irnCities <= 12, 'major city count is reduced and Iran is no longer 30 cities', classic);

    await boot(['ISR', 'IRN'], 'ISR', 'real');
    const real = await page.json(`(() => ({ space: world.spaceScale, w: world.w, h: world.h, cities: world.cities.length }))()`);
    check.eq(real.space, 1, 'Real mode keeps its original world scale', real);
    check.ok(real.w < classic.w * 0.7, 'Real mode map dimensions are unchanged', real);
    check.ok(real.cities > classic.cities, 'Real mode keeps the full city network', real);
  }
};
