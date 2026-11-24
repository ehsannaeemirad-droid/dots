/* Skirmish redesign: oil-field economy, national advisors, new ground classes,
 * transport, aircraft readiness, diplomacy agreements and doctrines. */
'use strict';

module.exports = {
  name: 'skirmish/command-layer',
  timeoutMs: 240000,
  async run({ page, check, seed }) {
    const boot = (countries, human, doctrine) => page.eval(`(() => {
      app.doctrine = ${JSON.stringify(doctrine || 'balanced')};
      return GEOTEST.boot({ mode: 'classic', diff: 'Normal', human: ${JSON.stringify(human)}, countries: ${JSON.stringify(countries)}, seed: ${seed}, allAI: true });
    })()`);
    const quiet = () => page.eval('for (const p of world.players) p.aiCtl = null;');

    /* ---------------- oil fields and the economic complex ---------------- */
    await boot(['IRN', 'SAU', 'TUR', 'EGY'], 'IRN');
    await quiet();
    const fields = await page.json(`(() => {
      const codes = {}; for (const f of world.oilFields) if (f.code) codes[f.code] = (codes[f.code] || 0) + 1;
      return { n: world.oilFields.length, codes, yields: world.oilFields.map(f => f.yieldCpm) };
    })()`);
    check.ok(fields.n >= 15, 'the map exposes its authored oil fields', fields);
    check.ok(Object.keys(fields.codes).length >= 6, 'oil fields are distributed across several countries', fields.codes);
    check.ok(new Set(fields.yields).size > 3, 'oil-field yields are not uniform', fields.yields);

    const outside = await page.json(`(() => {
      const me = GEOTEST.player('IRN'); me.cents = 400000;
      const f = economicSites(me)[0];
      return { field: f && f.n, cost: costOf(me, 'economy'),
        wrong: canPlaceBuilding(me.idx, 'economy', f.x + 260, f.y + 260) };
    })()`);
    check.eq(outside.cost, 1400, 'skirmish Economic Complex costs 1400 cr', outside);
    check.ok(/oil field/i.test(outside.wrong), 'an Economic Complex is refused off an oil field', outside.wrong);

    const built = await page.json(`(() => {
      const me = GEOTEST.player('IRN'); me.cents = 400000;
      const f = economicSites(me)[0];
      const reason = canPlaceBuilding(me.idx, 'economy', f.x, f.y);
      const b = placeBuilding(me.idx, 'economy', f.x, f.y);
      return { reason, id: b && b.id, field: f.n, fieldYield: f.yieldCpm, buildT: b && b.buildT,
        costPaid: +((400000 - me.cents) / 100).toFixed(0), hp: b && b.hp };
    })()`);
    check.ok(built.id, 'the Economic Complex can be built on an oil field', built);
    check.eq(built.buildT, 360, 'skirmish construction takes six minutes', built);
    check.eq(built.costPaid, 1400, 'the field build pays the skirmish price', built);

    await page.eval('GEOTEST.sim(365)');
    const done = await page.json(`(() => {
      const me = GEOTEST.player('IRN'); const b = ent(${built.id});
      const near = world.buildings.filter(x => !x.dead && x.owner === me.idx &&
        ['aa','tower'].includes(x.kind) && dist2(x.x, x.y, b.x, b.y) < 120 * 120).map(x => x.kind);
      updateEconomy();
      return { buildT: b.buildT, hp: b.hp, maxHp: b.maxHp, near: [...new Set(near)],
        industry: +me.eco.industry.toFixed(1), fieldY: ${built.fieldYield} };
    })()`);
    check.eq(done.buildT, 0, 'the complex finishes its construction clock', done);
    check.eq(done.hp, 2400, 'the completed complex has 2400 HP', done);
    check.ok(done.near.includes('aa') && done.near.includes('tower'), 'completion deploys an AA gun and a bunker', done);
    check.eq(done.industry, built.fieldYield, 'complex income follows its oil-field yield', done);

    /* ---------------- advisors: modes, recommendations, budgets ---------------- */
    await boot(['IRN', 'SAU', 'TUR', 'EGY'], 'IRN');
    await quiet();
    const recommend = await page.json(`(() => {
      world.advisorTick = 99; updateAdvisors();
      const out = {};
      for (const k of ['eco','military','air','diplomacy','intel']) out[k] = world.advisors[k].recs.map(r => r.text);
      return out;
    })()`);
    check.ok(Object.values(recommend).every(list => list.length > 0), 'all five advisors produce state-based recommendations', recommend);

    const suggest = await page.json(`(() => {
      const me = GEOTEST.player('IRN'); me.cents = 600000;
      world.advisors.eco.mode = 'suggest'; world.advisors.eco.cap = 5000;
      const before = world.buildings.filter(b => !b.dead && b.owner === me.idx && b.kind === 'economy').length;
      world.advisorTick = 99; updateAdvisors();
      const rec = world.advisors.eco.recs.find(r => r.execute);
      const still = world.buildings.filter(b => !b.dead && b.owner === me.idx && b.kind === 'economy').length;
      const approved = rec ? executeAdvisorRec('eco', rec.id) : false;
      const after = world.buildings.filter(b => !b.dead && b.owner === me.idx && b.kind === 'economy').length;
      return { before, still, approved, after, spent: world.advisors.eco.spent };
    })()`);
    check.eq(suggest.still, suggest.before, 'Suggest mode does not build on its own', suggest);
    check.eq(suggest.approved, true, 'the player can approve a recommendation', suggest);
    check.eq(suggest.after, suggest.before + 1, 'approval constructs exactly one complex', suggest);
    check.gt(suggest.spent, 0, 'advisor spending is attributed', suggest);

    const budget = await page.json(`(() => {
      GEOTEST.boot({ mode: 'classic', diff: 'Normal', human: 'IRN', countries: ['IRN','SAU','TUR'], seed: ${seed}, allAI: false });
      const me = GEOTEST.player('IRN'); me.cents = 900000;
      world.advisors.eco.mode = 'auto'; world.advisors.eco.cap = 0; world.advisors.eco.reserve = 0;
      world.advisors.eco.maxInvestments = 1;
      world.advisorTick = 99; updateAdvisors();
      const zero = world.buildings.filter(b => !b.dead && b.owner === me.idx && b.kind === 'economy').length;
      world.advisors.eco.cap = 5000; world.advisorTick = 99; updateAdvisors();
      const one = world.buildings.filter(b => !b.dead && b.owner === me.idx && b.kind === 'economy').length;
      world.advisorTick = 99; updateAdvisors();
      const twice = world.buildings.filter(b => !b.dead && b.owner === me.idx && b.kind === 'economy').length;
      return { zero, one, twice, spent: world.advisors.eco.spent };
    })()`);
    check.eq(budget.zero, 0, 'an Auto advisor respects a zero budget', budget);
    check.eq(budget.one, 1, 'Auto builds within an approved budget', budget);
    check.eq(budget.twice, 1, 'Auto refuses duplicate construction on one field', budget);

    const ui = await page.json(`(() => {
      const btn = document.querySelector('#advisorHudBtn');
      btn.click();
      return { visible: !btn.classList.contains('hidden'), panel: !document.querySelector('#advisorScr').classList.contains('hidden'),
        rows: document.querySelectorAll('#advisorList .advMode').length, doctrine: !!document.querySelector('#advisorDoctrine .docPick') };
    })()`);
    check.eq(ui.panel, true, 'the National Advisors panel opens from the HUD', ui);
    check.eq(ui.rows, 15, 'each advisor exposes Off, Suggest and Auto in the UI', ui);
    check.eq(ui.doctrine, true, 'the doctrine selector is present', ui);
    await page.eval(`document.querySelector('#advisorClose').click()`);

    /* ---------------- ground classes and transport ---------------- */
    check.ok((await page.json('CFG.UNITS.heavyTank.hp')) > (await page.json('CFG.UNITS.tank.hp')), 'heavy tanks have more HP than main battle tanks');
    check.ok((await page.json('CFG.UNITS.tankDestroyer.range')) > (await page.json('CFG.UNITS.tank.range')), 'tank destroyers out-range main battle tanks');
    check.eq(await page.json("CFG.DAMAGE.TABLE.atgm.heavy > CFG.DAMAGE.TABLE.atgm.armor"), true, 'ATGMs are especially dangerous to heavy armour');
    const trans = await page.json(`(() => {
      GEOTEST.boot({ mode: 'classic', diff: 'Normal', human: 'IRN', countries: ['IRN','SAU'], seed: ${seed}, allAI: false });
      const me = GEOTEST.player('IRN'); const camp = ent(me.campId);
      const apc = newUnit(me.idx, 'apc', camp.x + 40, camp.y + 40);
      world.units.push(apc); world.ents.set(apc.id, apc);
      const baseAlive = world.units.filter(u => !u.dead && u.owner === me.idx && u.type === 'soldier').length;
      const foot = [];
      for (let i = 0; i < 4; i++) {
        const u = newUnit(me.idx, 'soldier', camp.x + 50 + i * 4, camp.y + 46);
        world.units.push(u); world.ents.set(u.id, u); foot.push(u.id);
      }
      sel.units = [apc.id];
      const loaded = loadTransports();
      const cargo = apc.cargo.length;
      const deployed = unloadTransports();
      const alive = world.units.filter(u => !u.dead && u.owner === me.idx && u.type === 'soldier').length;
      return { loaded, cargo, deployed, alive, baseAlive, cap: apc.maxCargo };
    })()`);
    check.eq(trans.cap, 4, 'the APC carries four infantry squads', trans);
    check.eq(trans.loaded, 4, 'LOAD embeds nearby infantry', trans);
    check.eq(trans.cargo, 4, 'the transport records its cargo', trans);
    check.eq(trans.deployed, 4, 'UNLOAD deploys the whole squad', trans);
    check.eq(trans.alive, trans.baseAlive + 4, 'deployed infantry return as live units', trans);

    /* ---------------- aircraft readiness and airbase loss ---------------- */
    const air = await page.json(`(() => {
      GEOTEST.boot({ mode: 'classic', diff: 'Normal', human: 'IRN', countries: ['IRN','SAU'], seed: ${seed}, allAI: false });
      const me = GEOTEST.player('IRN');
      let base = world.buildings.find(b => !b.dead && b.owner === me.idx && b.kind === 'airbase');
      if (!base) { base = placeBuilding(me.idx, 'airbase', me.startX + 80, me.startY + 60); }
      me.cents = 100000;
      const jet = newUnit(me.idx, 'f35', base.x + 4, base.y + 4);
      jet.airbaseId = base.id; jet.ammo = 0; jet.hp = Math.round(jet.maxHp * 0.4);
      world.units.push(jet); world.ents.set(jet.id, jet);
      const t0 = { ammo: jet.ammo, hp: jet.hp };
      GEOTEST.sim(1.2);
      const rearming = jet.readiness;
      GEOTEST.sim(7);
      const t1 = { ammo: jet.ammo, hp: jet.hp, readiness: jet.readiness };
      // Destroy the home base and provide one surviving alternative.
      base.dead = true;
      const alt = world.buildings.find(b => !b.dead && b.owner === me.idx && b.kind === 'airbase' && b.id !== base.id) ||
        placeBuilding(me.idx, 'airbase', me.startX + 150, me.startY + 90);
      GEOTEST.sim(0.3);
      return { t0, rearming, t1, gotAlt: jet.airbaseId === alt.id, altId: alt && alt.id, state: jet.readiness, dead: jet.dead };
    })()`);
    check.ok(['REARMING','REPAIRING'].includes(air.rearming), 'an empty, damaged aircraft enters a rearm/repair state', air);
    check.eq(air.t1.ammo, 7, 'aircraft rearm automatically after a sortie', air);
    check.gt(air.t1.hp, air.t0.hp, 'damaged aircraft repair automatically at base', air);
    check.eq(air.dead, false, 'an aircraft is not deleted when its airbase falls if another exists', air);
    check.eq(air.gotAlt, true, 'the wing relocates to a surviving airbase', air);

    /* ---------------- diplomacy and doctrines ---------------- */
    const dip = await page.json(`(() => {
      GEOTEST.boot({ mode: 'classic', diff: 'Normal', human: 'IRN', countries: ['IRN','SAU','TUR','EGY'], seed: ${seed}, allAI: false });
      const a = GEOTEST.player('IRN'), b = GEOTEST.player('TUR');
      const initial = getRelation(a.idx, b.idx);
      const matrix = world.players.map(p => world.players.map(q => getRelation(p.idx, q.idx)));
      setAgreement(a.idx, b.idx, 'NAP', true);
      const ag = getAgreement(a.idx, b.idx);
      const hostileNow = hostile(a, b);
      const beforeCred = a.credibility == null ? 100 : a.credibility;
      breakAgreement(a.idx, b.idx);
      const afterCred = a.credibility;
      const expired = getAgreement(a.idx, b.idx);
      Math.random = () => 0;
      const offer = proposeAgreement(a.idx, GEOTEST.player('EGY').idx, 'TRADE');
      return { initial, matrix, ag: ag && ag.type, hostileNow, beforeCred, afterCred, expired: !!expired, offer: offer.ok,
        tradeRel: getRelation(a.idx, GEOTEST.player('EGY').idx) };
    })()`);
    check.note('diplomacy matrix ' + JSON.stringify(dip.matrix) + ' initial=' + dip.initial);
    check.eq(dip.initial, 'NEUTRAL', 'a multi-country skirmish does not start in an automatic world war', dip);
    check.eq(dip.ag, 'NAP', 'a non-aggression pact is recorded', dip);
    check.eq(dip.hostileNow, false, 'a pact makes the parties non-hostile', dip);
    check.eq(dip.afterCred, dip.beforeCred - 22, 'breaking a pact costs diplomatic credibility', dip);
    check.eq(dip.expired, false, 'breaking a pact removes it', dip);
    check.eq(dip.offer, true, 'an accepted trade proposal becomes an agreement', dip);
    check.eq(dip.tradeRel, 'TRADE', 'a trade agreement sets the trade relation', dip);

    const doc = await page.json(`(() => {
      app.doctrine = 'ground';
      GEOTEST.boot({ mode: 'classic', diff: 'Normal', human: 'TUR', countries: ['TUR','IRN'], seed: ${seed}, allAI: false });
      const me = GEOTEST.player('TUR');
      const groundTank = costOf(me, 'tank');
      const mix = doctrineMix(me, countryOf(me).mix || { soldier: 1, tank: 1 });
      me.cents = 90000;
      const beforeDoctrine = doctrineOf(me);
      const switched = switchDoctrine('air');
      return { d: beforeDoctrine, groundTank, hasIfv: !!mix.ifv, switched, after: me.doctrine,
        airMul: doctrineCostMul(me, 'air'), spent: me.stats.spent };
    })()`);
    check.eq(doc.d, 'ground', 'the chosen doctrine is attached to the player', doc);
    check.ok(doc.groundTank < 60, 'Ground doctrine discounts armour', doc);
    check.eq(doc.hasIfv, true, 'Ground doctrine expands the mechanised build mix', doc);
    check.eq(doc.switched, true, 'doctrine can be changed mid-match', doc);
    check.eq(doc.after, 'air', 'the switch persists', doc);
    check.ok(doc.airMul < 1, 'Air doctrine discounts aircraft', doc);
    check.gt(doc.spent, 0, 'the doctrine transition is paid for', doc);

    /* ---------------- Real mode isolation ---------------- */
    const real = await page.json(`(() => {
      GEOTEST.boot({ mode: 'real', diff: 'Normal', human: 'ISR', countries: ['ISR','IRN'], seed: ${seed}, allAI: false });
      const me = GEOTEST.player('ISR');
      return { advisors: world.advisors || null, fields: world.oilFields || null,
        cost: costOf(me, 'economy'), buildT: CFG.BUILDINGS.economy.buildTime, hp: CFG.BUILDINGS.economy.hp,
        doctrine: me.doctrine, agreement: getAgreement(me.idx, GEOTEST.player('IRN').idx) };
    })()`);
    check.eq(real.advisors, null, 'Real mode has no skirmish advisor layer', real);
    check.eq(real.fields, null, 'Real mode keeps its existing resource model', real);
    check.eq(real.cost, 400, 'Real-mode Economic Complex price is unchanged', real);
    check.eq(real.buildT, 180, 'Real-mode construction time is unchanged', real);
    check.eq(real.hp, 2400, 'Real-mode Economic Complex HP is unchanged', real);

    /* ---------------- 19-country free-for-all ---------------- */
    const ffa = await page.json(`(() => {
      app.doctrine = 'balanced';
      GEOTEST.boot({ mode: 'classic', diff: 'Medium', human: 'IRN', countries: REAL_KEYS.slice(), seed: ${seed}, allAI: true });
      const start = world.players.map(p => p.country);
      const personalities = [...new Set(world.players.filter(p => !p.isHuman).map(p => p.aiCtl.personality))];
      GEOTEST.sim(120);
      const wars = world.players.filter(p => p.alive && atWar(p)).length;
      const agreements = Object.keys(world.agreements || {}).length;
      world.advisorTick = 99; updateAdvisors();
      const recs = Object.values(world.advisors).reduce((n, a) => n + a.recs.length, 0);
      return { start: start.length, alive: world.players.filter(p => p.alive).length, personalities, wars, agreements, recs,
        time: +world.time.toFixed(0) };
    })()`);
    check.eq(ffa.start, 19, 'the full 19-country skirmish roster boots', ffa);
    check.eq(ffa.alive >= 16, true, 'the free-for-all is not decided in the first two minutes', ffa);
    check.gt(ffa.personalities.length, 2, 'AI countries use distinct personalities', ffa);
    check.ok(ffa.wars < 19, 'not every country is automatically at war', ffa);
    check.gt(ffa.agreements, 3, 'AI diplomacy keeps agreements in the 19-country map', ffa);
    check.gt(ffa.recs, 0, 'advisors remain functional in a large match', ffa);
  }
};
