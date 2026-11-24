/* City capture: force thresholds, the ten/seven-minute occupation clock,
 * defenders, recapture, contested factions, siege decay and the capture radius. */
'use strict';

module.exports = {
  name: 'capture/rules',
  timeoutMs: 300000,
  async run({ page, check, seed }) {
    async function fresh() {
      await page.eval(`GEOTEST.boot({ mode: 'real', diff: 'Normal', human: 'IRN',
        countries: ['IRN','ISR'], seed: ${seed}, allAI: true })`);
      await page.eval('for (const p of world.players) p.aiCtl = null; world.patronTick = -1e12;');
      await page.json('GEOTEST.sim(61)');
      await page.eval('world.patronTick = -1e12;');
      /* Isolate the capture rule from static defences. */
      await page.eval(`GEOTEST.clearUnits();
        for (const b of world.buildings) if (!b.dead && ['tower','sam','outpost','ncamp','aa'].includes(b.kind)) b.dead = true;`);
    }
    const target = async () => page.json(`(() => {
      const isr = GEOTEST.player('ISR');
      const list = (world.cities||[]).filter(c => !c.razed && c.owner === isr.idx);
      const cap = list.find(c => c.capital) || list[0];
      const minor = list.filter(c => !c.capital).sort((a,b) => (a.pop||0)-(b.pop||0))[0] || cap;
      return { capital: cap && cap.name, minor: minor && minor.name, radius: CFG.CAPTURE.RADIUS,
        citySec: CFG.CAPTURE.CITY_SEC, capitalSec: CFG.CAPTURE.CITY_CAPITAL_SEC };
    })()`);

    await fresh();
    const t = await target();
    check.ok(!!t.capital && !!t.minor, 'found an enemy capital and a minor city', t);
    check.eq(t.radius, 110, 'capture radius is the configured 110 px');
    check.eq(t.citySec, 420, 'ordinary cities are configured at seven minutes');
    check.eq(t.capitalSec, 600, 'capitals are configured at ten minutes');

    async function lab(city, count, extra) {
      return page.json(`GEOTEST.captureLab(${JSON.stringify({ city, country: 'IRN', count, budget: 700, ...extra })})`);
    }

    /* A minor city takes roughly seven minutes. Numbers no longer compress it. */
    await fresh();
    const one = await lab(t.minor, 1, { budget: 520 });
    check.note('capture-lab one: ' + JSON.stringify(one));
    check.eq(one.ownerAfterCode, 'IRN', 'one soldier captures a minor city');
    check.between(one.progressTime, 405, 445, 'minor city occupation ≈ 420 s for one attacker', one.progressTime);

    await fresh();
    const three = await lab(t.minor, 3, { budget: 520 });
    check.between(three.progressTime, 405, 445, '3 attackers still take about 420 s', three.progressTime);
    check.near(three.progressTime, one.progressTime, 6, 'extra infantry do not shorten the occupation clock');
    await fresh();
    const six = await lab(t.minor, 6, { budget: 520 });
    check.between(six.progressTime, 405, 445, '6 attackers still take about 420 s', six.progressTime);
    check.near(six.progressTime, one.progressTime, 6, 'a large force cannot compress the city clock');

    /* Capital needs a company: below 3 does nothing, 3 works at ten minutes. */
    await fresh();
    const capOne = await lab(t.capital, 1);
    check.eq(capOne.ownerAfterCode, 'ISR', 'a lone scout cannot take a capital');
    check.eq(capOne.progressNow, 0, 'no progress accrues below the capital threshold');
    await fresh();
    const capTwo = await lab(t.capital, 2);
    check.eq(capTwo.ownerAfterCode, 'ISR', 'two infantry still cannot take a capital');
    await fresh();
    const capThree = await lab(t.capital, 3, { budget: 700 });
    check.eq(capThree.ownerAfterCode, 'IRN', 'three infantry take a capital');
    check.between(capThree.progressTime, 585, 625, 'capital occupation ≈ 600 s with three attackers', capThree.progressTime);

    /* A garrison blocks until it is cleared. */
    await fresh();
    const def3 = await lab(t.minor, 3, { defenders: 3, budget: 420 });
    check.eq(def3.ownerAfterCode, 'ISR', 'three defenders hold a minor city against three attackers');
    await fresh();
    const def1 = await lab(t.minor, 6, { defenders: 1, budget: 620 });
    check.eq(def1.ownerAfterCode, 'IRN', 'overwhelming force clears a single defender');
    check.ok(def1.tProgress != null && def1.tProgress >= 1, 'progress starts only after the defender is dealt with', def1.tProgress);

    /* Recapture. */
    await fresh();
    await page.eval(`(() => { const c = GEOTEST.city(${JSON.stringify(t.minor)});
      const isr = GEOTEST.player('ISR'); c.owner = isr.idx; refreshCityShares(); applyCityCaps(); })()`);
    const recap = await lab(t.minor, 4, { budget: 520 });
    check.eq(recap.ownerAfterCode, 'IRN', 'a captured city can be retaken');

    /* Two hostile factions: a tie blocks progress, a clear majority wins. */
    await fresh();
    const contest = await page.json(`(() => {
      const city = (world.cities||[]).find(c => !c.razed && c.owner < 0);
      if (!city) return { error: 'no neutral city' };
      const irn = GEOTEST.player('IRN'), isr = GEOTEST.player('ISR');
      const put = p => { const u = newUnit(p.idx,'soldier',city.x+8+p.idx*12,city.y+8);
        world.ents.set(u.id,u); world.units.push(u); u.order={k:'amove',x:city.x,y:city.y}; };
      for (let i=0;i<3;i++){ put(irn); put(isr); }
      const owner0 = city.owner, t0 = world.time; let steps = 0, peakTie = 0;
      while (steps < 2000 && world.time - t0 < 30 && city.owner === owner0) { stepSim(); steps++; peakTie = Math.max(peakTie, city.captureT || 0); }
      const tied = peakTie < 0.35;
      for (let i=0;i<10;i++){ put(isr); }
      const t1 = world.time; steps = 0;
      while (steps < 8000 && world.time - t1 < 700 && city.owner === owner0) { stepSim(); steps++; }
      return { tied, owner0, owner1: city.owner, name: city.name };
    })()`);
    if (!contest.error) {
      check.ok(contest.tied, 'an even two-faction contest does not flip the city', contest);
      check.eq(contest.owner1, 1, 'the side with the clear majority eventually takes it', contest);
    } else check.note('no neutral city on this map — contest case skipped');

    /* Abandoned siege decays; radius is honoured. */
    await fresh();
    const decay = await page.json(`(() => {
      const city = GEOTEST.city(${JSON.stringify(t.minor)});
      const atk = GEOTEST.player('IRN');
      if (city.owner !== atk.idx) setRelation(atk.idx, city.owner, 'WAR', false);
      const ids = [];
      for (let i=0;i<1;i++){ const u=newUnit(atk.idx,'soldier',city.x+30,city.y+30);
        world.ents.set(u.id,u); world.units.push(u); u.order={k:'amove',x:city.x,y:city.y}; ids.push(u.id); }
      const t0 = world.time;
      while (world.time - t0 < 100) stepSim();
      const peak = +(city.captureT||0).toFixed(3);
      for (const id of ids) { const u = ent(id); if (u) { u.dead = true; world.ents.delete(id); } }
      world.units = world.units.filter(u => !u.dead);
      const t1 = world.time;
      while (world.time - t1 < 20) stepSim();
      return { peak, after: +(city.captureT||0).toFixed(3) };
    })()`);
    check.gt(decay.peak, 0.18, 'siege progress accumulates while attackers stand in the city', decay.peak);
    check.lt(decay.after, decay.peak, 'progress decays once the siege is abandoned', decay);

    /* Radius: a unit at 100 px counts, one at 140 px does not. */
    const radius = await page.json(`(() => {
      const city = GEOTEST.city(${JSON.stringify(t.minor)});
      const atk = GEOTEST.player('IRN');
      const foe = GEOTEST.player('ISR');
      city.owner = foe.idx; city.captureT = 0;
      setRelation(atk.idx, foe.idx, 'WAR', false);
      const u = newUnit(atk.idx, 'soldier', city.x + 100, city.y);
      world.ents.set(u.id,u); world.units.push(u); u.order = { k: 'guard', x: u.x, y: u.y };
      for (let i=0;i<40;i++) stepSim();
      const at100 = +(city.captureT||0).toFixed(3);
      city.captureT = 0;
      u.x = city.x + 140;
      for (let i=0;i<40;i++) stepSim();
      return { at100, at140: +(city.captureT||0).toFixed(3) };
    })()`);
    check.gt(radius.at100, 0, 'infantry inside the 110 px radius make progress');
    check.eq(radius.at140, 0, 'infantry outside the radius make no progress');
  }
};
