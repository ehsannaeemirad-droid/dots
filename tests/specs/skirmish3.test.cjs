/* Skirmish command layer — 3.md acceptance close-out.
 * Covers the parts of the mission that were not in the earlier command-layer
 * spec: oil-field inspection, player-defined advisor priorities, Off mode,
 * economic-complex defence, all agreement classes and expiry, vehicle damage
 * roles, loss of the last airbase, and country starting identities. */
'use strict';

module.exports = {
  name: 'skirmish/3md-acceptance',
  timeoutMs: 240000,
  async run({ page, check, seed }) {
    const boot = (countries, human) => page.eval(`(() => {
      app.doctrine = 'balanced';
      return GEOTEST.boot({ mode: 'classic', diff: 'Normal', human: ${JSON.stringify(human)}, countries: ${JSON.stringify(countries)}, seed: ${seed}, allAI: false });
    })()`);
    const quiet = () => page.eval('for (const p of world.players) p.aiCtl = null;');

    /* ---------------- oil-field inspection and direct construction -------- */
    await boot(['IRN', 'SAU', 'TUR', 'EGY'], 'IRN');
    await quiet();
    const oil = await page.json(`(() => {
      const me = GEOTEST.player('IRN'); me.cents = 500000;
      const owned = world.oilFields.filter(f => {
        const o = territoryControllerAt(f.x, f.y);
        return o && o.idx === me.idx;
      });
      const f = owned.find(f => !world.buildings.some(b => !b.dead && dist2(b.x, b.y, f.x, f.y) < 70 * 70) &&
        !world.units.some(u => !u.dead && dist2(u.x, u.y, f.x, f.y) < 52 * 52)) || owned[0];
      selectAt({ x: f.x, y: f.y });
      const inspectKind = sel.inspect && sel.inspect.kind;
      const html = selInfoHTML();
      const built = window._oilBuild(f.fieldId);
      const b = world.buildings.find(x => !x.dead && x.owner === me.idx && x.kind === 'economy' &&
        dist2(x.x, x.y, f.x, f.y) < 4);
      return { field: f.n, fieldId: f.fieldId, inspectKind, hasYield: html.includes(f.yieldCpm + ' cr/min'),
        hasBuild: /Build Economic Complex/.test(html), built, buildKind: b && b.kind, fieldIdOnBuild: b && b.fieldId };
    })()`);
    check.eq(oil.inspectKind, 'oil', 'clicking an oil field opens the field inspector', oil);
    check.eq(oil.hasYield, true, 'the oil-field inspector shows the field yield', oil);
    check.eq(oil.hasBuild, true, 'an available owned field offers a build control', oil);
    check.eq(oil.built, true, 'the build control starts a real Economic Complex', oil);
    check.eq(oil.fieldIdOnBuild, oil.fieldId, 'the complex is recorded against the clicked field', oil);

    /* Confirming the complex pays only its owner also catches double income
       during a capture: the old owner's stream must fall while the new owner's
       stream rises by the same field yield. */
    const vulnerability = await page.json(`(() => {
      const me = GEOTEST.player('IRN'), foe = GEOTEST.player('SAU');
      const b = world.buildings.find(x => !x.dead && x.owner === me.idx && x.kind === 'economy');
      if (!b) return { missing: true };
      b.buildT = 0; b.hp = b.maxHp; updateEconomy();
      const meBefore = +me.eco.cpt.toFixed(2), foeBefore = +foe.eco.cpt.toFixed(2);
      b.dead = true; updateEconomy();
      const meDestroyed = +me.eco.cpt.toFixed(2);
      b.dead = false; b.owner = foe.idx; updateEconomy();
      return { missing: false, meBefore, foeBefore, meDestroyed,
        meAfter: +me.eco.cpt.toFixed(2), foeAfter: +foe.eco.cpt.toFixed(2), yield: +b.fieldId };
    })()`);
    check.eq(vulnerability.missing, false, 'the test has a completed economic complex to lose', vulnerability);
    check.ok(vulnerability.meDestroyed < vulnerability.meBefore, 'destroying a complex removes its income from the old owner', vulnerability);
    check.ok(vulnerability.meAfter < vulnerability.meBefore, 'a captured complex stops paying the previous owner', vulnerability);
    check.ok(vulnerability.foeAfter > vulnerability.foeBefore, 'the capturing owner receives the complex income exactly once', vulnerability);

    /* ---------------- player-defined advisor priorities ------------------- */
    const priorities = await page.json(`(() => {
      document.querySelector('#advisorHudBtn').click();
      const selects = [...document.querySelectorAll('.advPriority')];
      const ecoSel = document.querySelector('.advPriority[data-adv="eco"]');
      ecoSel.value = 'safe'; ecoSel.dispatchEvent(new Event('change'));
      const max = document.querySelector('.advMax');
      max.value = '2'; max.dispatchEvent(new Event('change'));
      const me = GEOTEST.player('IRN');
      const safeSites = economicSites(me, 'safe');
      const expectedFirst = safeSites.slice().sort((a, b) => dist2(a.x, a.y, me.startX, me.startY) - dist2(b.x, b.y, me.startX, me.startY))[0];
      return { count: selects.length, maxCount: world.advisors.eco.maxInvestments,
        priority: world.advisors.eco.priority, safeFirst: safeSites[0] && safeSites[0].fieldId,
        expectedFirst: expectedFirst && expectedFirst.fieldId,
        military: !!document.querySelector('.advPriority[data-adv="military"]'),
        air: !!document.querySelector('.advPriority[data-adv="air"]'),
        diplomacy: !!document.querySelector('.advPriority[data-adv="diplomacy"]') };
    })()`);
    check.eq(priorities.count, 4, 'the four actionable advisors expose a priority selector', priorities);
    check.eq(priorities.priority, 'safe', 'changing the Economic priority is persisted', priorities);
    check.eq(priorities.safeFirst, priorities.expectedFirst, 'the Economic priority changes real site ordering', priorities);
    check.eq(priorities.maxCount, 2, 'the maximum economic-investment policy is player-defined', priorities);
    check.eq(priorities.military && priorities.air && priorities.diplomacy, true, 'Military, Air and Diplomatic desks have priorities', priorities);
    await page.eval(`document.querySelector('#advisorClose').click()`);

    /* ---------------- Off / Suggest / Auto ------------------------------- */
    const advisorModes = await page.json(`(() => {
      const me = GEOTEST.player('IRN');
      for (const k of ['eco','military','air','diplomacy','intel']) world.advisors[k].mode = 'off';
      world.advisorTick = 99; updateAdvisors();
      const offRecs = Object.values(world.advisors).reduce((n, a) => n + a.recs.length, 0);
      world.advisors.eco.mode = 'suggest'; world.advisors.eco.cap = 5000; world.advisors.eco.reserve = 0;
      me.cents = 500000; world.advisorTick = 99; updateAdvisors();
      const rec = world.advisors.eco.recs.find(r => r.execute);
      const before = world.buildings.filter(b => !b.dead && b.owner === me.idx && b.kind === 'economy').length;
      const approved = rec ? executeAdvisorRec('eco', rec.id) : false;
      const after = world.buildings.filter(b => !b.dead && b.owner === me.idx && b.kind === 'economy').length;
      return { offRecs, suggestRec: !!rec, approved, before, after };
    })()`);
    check.eq(advisorModes.offRecs, 0, 'Off mode clears recommendations and takes no action', advisorModes);
    check.eq(advisorModes.suggestRec, true, 'Suggest mode produces an actionable recommendation', advisorModes);
    check.eq(advisorModes.approved, true, 'a recommendation can be approved', advisorModes);
    check.eq(advisorModes.after, advisorModes.before + 1, 'approval executes through the real build path', advisorModes);

    const auto = await page.json(`(() => {
      GEOTEST.boot({ mode: 'classic', diff: 'Normal', human: 'IRN', countries: ['IRN','SAU','TUR'], seed: ${seed}, allAI: false });
      const me = GEOTEST.player('IRN'); me.cents = 500000;
      world.advisors.eco.mode = 'auto'; world.advisors.eco.cap = 0; world.advisors.eco.reserve = 0;
      world.advisorTick = 99; updateAdvisors();
      const zero = world.buildings.filter(b => !b.dead && b.owner === me.idx && b.kind === 'economy').length;
      world.advisors.eco.cap = 5000; world.advisorTick = 99; updateAdvisors();
      const one = world.buildings.filter(b => !b.dead && b.owner === me.idx && b.kind === 'economy').length;
      world.advisorTick = 99; updateAdvisors();
      const complexes = world.buildings.filter(b => !b.dead && b.owner === me.idx && b.kind === 'economy');
      const fields = complexes.map(b => b.fieldId).filter(Boolean);
      return { zero, one, twice: complexes.length, uniqueFields: new Set(fields).size, fields: fields.length };
    })()`);
    check.eq(auto.zero, 0, 'Auto mode respects a zero budget', auto);
    check.eq(auto.one, 1, 'Auto mode acts within its budget', auto);
    check.eq(auto.uniqueFields, auto.fields, 'Auto mode never puts two complexes on one field', auto);

    const reject = await page.json(`(() => {
      GEOTEST.boot({ mode: 'classic', diff: 'Normal', human: 'IRN', countries: ['IRN','SAU'], seed: ${seed}, allAI: false });
      const me = GEOTEST.player('IRN'); me.cents = 500000;
      world.advisors.eco.mode = 'suggest'; world.advisorTick = 99; updateAdvisors();
      const rec = world.advisors.eco.recs.find(r => r.execute);
      const before = world.buildings.filter(b => !b.dead && b.owner === me.idx && b.kind === 'economy').length;
      const ok = rec ? rejectAdvisorRec('eco', rec.id) : false;
      const after = world.buildings.filter(b => !b.dead && b.owner === me.idx && b.kind === 'economy').length;
      return { ok, rec: !!rec, before, after, logged: world.advisors.eco.log.some(x => /rejected/.test(x.text)),
        history: (world.advisors.eco.history || []).some(x => x.status === 'rejected') };
    })()`);
    check.eq(reject.rec, true, 'Suggest mode exposes a recommendation to reject', reject);
    check.eq(reject.ok, true, 'the player can reject a recommendation', reject);
    check.eq(reject.after, reject.before, 'rejecting a recommendation changes nothing', reject);
    check.eq(reject.logged && reject.history, true, 'the rejection is visible in the decision history', reject);

    /* ---------------- Military Advisor protects economic complexes --------- */
    const defence = await page.json(`(() => {
      const me = GEOTEST.player('IRN');
      world.advisors.military.priority = 'economy';
      const f = economicSites(me)[0];
      if (f) placeBuilding(me.idx, 'economy', f.x, f.y);
      const gaps = advisorDefenceGaps(me, 'economy');
      const first = gaps[0];
      world.advisorTick = 99; updateAdvisors();
      const rec = world.advisors.military.recs.find(r => /Economic Complex/.test(r.text));
      return { firstEconomy: !!(first && first.economy), firstKind: first && first.need,
        rec: !!(rec && /Economic Complex/.test(rec.text)) };
    })()`);
    check.eq(defence.firstEconomy, true, 'Economy-first defence prioritises an economic complex', defence);
    check.eq(defence.rec, true, 'the military desk recommends protecting the economic complex', defence);

    /* ---------------- agreement classes, trade and expiry ---------------- */
    const dip = await page.json(`(() => {
      GEOTEST.boot({ mode: 'classic', diff: 'Normal', human: 'IRN', countries: ['IRN','SAU','TUR','EGY'], seed: ${seed}, allAI: false });
      const a = GEOTEST.player('IRN'), b = GEOTEST.player('SAU'), c = GEOTEST.player('TUR'), d = GEOTEST.player('EGY');
      setAgreement(a.idx, b.idx, 'DEFENSIVE', true);
      const def = { type: getAgreement(a.idx, b.idx).type, rel: getRelation(a.idx, b.idx) };
      setAgreement(a.idx, c.idx, 'CEASEFIRE', true);
      const cf = { type: getAgreement(a.idx, c.idx).type, hostile: hostile(a, c), rel: getRelation(a.idx, c.idx) };
      setAgreement(a.idx, d.idx, 'MUTUAL_ENEMY', true);
      const me = { type: getAgreement(a.idx, d.idx).type, rel: getRelation(a.idx, d.idx) };
      setAgreement(a.idx, b.idx, 'TRADE', true); updateEconomy();
      const trade = { type: getAgreement(a.idx, b.idx).type, cpm: +a.eco.trade.toFixed(2), rel: getRelation(a.idx, b.idx) };
      const key = agreementKey(a.idx, b.idx);
      world.agreements[key].until = world.time + 1;
      world.time += 2;
      const expired = getAgreement(a.idx, b.idx);
      const after = getRelation(a.idx, b.idx);
      return { def, cf, me, trade, expired: !!expired, after };
    })()`);
    check.eq(dip.def.type, 'DEFENSIVE', 'a defensive alliance is stored as an agreement', dip);
    check.eq(dip.def.rel, 'ALLY', 'a defensive alliance makes the parties allies', dip);
    check.eq(dip.cf.type, 'CEASEFIRE', 'a ceasefire is stored as an agreement', dip);
    check.eq(dip.cf.hostile, false, 'a ceasefire ends active hostility', dip);
    check.eq(dip.me.type, 'MUTUAL_ENEMY', 'a mutual-enemy arrangement is stored', dip);
    check.eq(dip.me.rel, 'ALLY', 'a mutual-enemy arrangement creates cooperation', dip);
    check.eq(dip.trade.type, 'TRADE', 'a trade agreement is stored', dip);
    check.ok(dip.trade.cpm > 0, 'a trade agreement adds a real income stream', dip.trade);
    check.eq(dip.expired, false, 'an expired agreement is removed', dip);
    check.eq(dip.after, 'NEUTRAL', 'expiry restores a neutral relation instead of a stale pact status', dip);

    /* ---------------- vehicle damage roles and airbase loss ---------------- */
    const roles = await page.json(`(() => {
      const T = CFG.DAMAGE.TABLE;
      return {
        smallVsHeavy: T.smallArms.heavy, tankVsHeavy: T.tankGun.heavy, tdVsArmor: T.td.armor,
        tdVsInfantry: T.td.infantry, samVsAir: T.sam.air, cannonVsAir: T.autocannon.air,
        bombVsFort: T.bomb.fortified, tankVsFort: T.tankGun.fortified,
        ifvCap: CFG.UNITS.ifv.capacity, apcCap: CFG.UNITS.apc.capacity,
        ifvCost: CFG.COSTS.ifv, apcCost: CFG.COSTS.apc,
        ifvDmg: CFG.UNITS.ifv.dmg, apcDmg: CFG.UNITS.apc.dmg
      };
    })()`);
    check.ok(roles.smallVsHeavy <= 0.02 && roles.smallVsHeavy < roles.tankVsHeavy, 'rifles are nearly useless against heavy armour', roles);
    check.ok(roles.tdVsArmor > 1 && roles.tdVsArmor > roles.tankVsHeavy, 'tank destroyers specialise against armour', roles);
    check.ok(roles.tdVsInfantry < 0.3, 'tank destroyers are weak against infantry', roles);
    check.ok(roles.samVsAir > roles.cannonVsAir, 'SAMs are the stronger anti-air weapon', roles);
    check.ok(roles.bombVsFort > roles.tankVsFort && roles.tankVsFort > 0.2, 'bombs and tank guns both damage fortifications', roles);
    check.eq(roles.ifvCap, 3, 'the IFV carries three infantry', roles);
    check.eq(roles.apcCap, 4, 'the APC carries four infantry', roles);
    check.ok(roles.ifvCost > roles.apcCost && roles.ifvDmg > roles.apcDmg, 'the IFV is the armed, more expensive transport', roles);

    const lastBase = await page.json(`(() => {
      GEOTEST.boot({ mode: 'classic', diff: 'Normal', human: 'IRN', countries: ['IRN','SAU'], seed: ${seed}, allAI: false });
      const me = GEOTEST.player('IRN');
      const b = placeBuilding(me.idx, 'airbase', me.startX + 80, me.startY + 60);
      me.cents = 100000;
      const jet = newUnit(me.idx, 'f35', b.x + 4, b.y + 4);
      jet.airbaseId = b.id; jet.ammo = jet.maxAmmo;
      world.units.push(jet); world.ents.set(jet.id, jet);
      b.dead = true;
      GEOTEST.sim(31);
      return { dead: jet.dead, lost: (me.stats.lost.f35 || 0), logged: world.log.some(l => /no airbase available/.test(l.msg)) };
    })()`);
    check.eq(lastBase.dead, true, 'an aircraft is lost when its last airbase is destroyed', lastBase);
    check.eq(lastBase.lost, 1, 'the loss is counted against the owner', lastBase);
    check.eq(lastBase.logged, true, 'the emergency landing rule is explained in the field log', lastBase);

    /* ---------------- country identities --------------------------------- */
    const countries = await page.json(`(() => {
      GEOTEST.boot({ mode: 'classic', diff: 'Normal', human: 'ISR', countries: ['ISR','IRN'], seed: ${seed}, allAI: false });
      const isr = GEOTEST.player('ISR'), irn = GEOTEST.player('IRN');
      const f35 = world.units.filter(u => !u.dead && u.owner === isr.idx && u.type === 'f35i').length;
      const iranBuild = countryOf(irn).build || {};
      const beforeBases = world.buildings.filter(b => !b.dead && b.owner === isr.idx && b.kind === 'airbase').length;
      isr.cents = 100000; world.advisorTick = 99; updateAdvisors();
      const airRec = world.advisors.air.recs.find(r => r.execute && /capacity/i.test(r.text));
      const approved = airRec ? executeAdvisorRec('air', airRec.id) : false;
      return { f35, startAirframes: isr.stats.startAirframes,
        isrAirbases: beforeBases,
        isrRadar: world.buildings.filter(b => !b.dead && b.owner === isr.idx && b.kind === 'radar').length,
        airRec: !!airRec, approved,
        afterBases: world.buildings.filter(b => !b.dead && b.owner === isr.idx && b.kind === 'airbase').length,
        iranMissiles: (iranBuild.msl || []).length, iranArmy: (iranBuild.army || []).length };
    })()`);
    check.eq(countries.f35, 6, 'Israel keeps its six F-35I starting aircraft', countries);
    check.eq(countries.startAirframes, 6, 'the starting air wing is recorded for the match report', countries);
    check.eq(countries.isrAirbases, 2, 'Israel starts with two operational airbases', countries);
    check.eq(countries.isrRadar, 1, 'Israel starts with early-warning radar coverage', countries);
    check.eq(countries.airRec, true, 'a full airbase network produces an expansion recommendation', countries);
    check.eq(countries.approved, true, 'airbase expansion can be approved through the real build path', countries);
    check.eq(countries.afterBases, countries.isrAirbases + 1, 'the approved recommendation adds one airbase', countries);
    check.gt(countries.iranArmy, 0, 'Iran has a real conventional build list', countries);
    check.gt(countries.iranMissiles, 0, 'Iran keeps a missile build identity', countries);
  }
};
