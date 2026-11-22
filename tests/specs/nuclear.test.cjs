/* Nuclear release: last-resort gate, foreign-only razing, consequences, and
 * the single nuclear power. */
'use strict';

module.exports = {
  name: 'nuclear/escalation-gate',
  timeoutMs: 180000,
  async run({ page, check, seed }) {
    async function fresh() {
      await page.eval(`GEOTEST.boot({ mode: 'real', diff: 'Hard', human: 'IRN',
        countries: ['ISR','IRN'], seed: ${seed}, allAI: true })`);
      await page.eval('for (const p of world.players) p.aiCtl = null;');
      await page.json('GEOTEST.sim(62)');
      await page.eval('GEOTEST.clearUnits()');
    }

    await fresh();
    const scout = await page.json(`(() => {
      const isr = GEOTEST.player('ISR'), irn = GEOTEST.player('IRN');
      const camp = ent(isr.campId);
      for (let i=0;i<1;i++){ const u=newUnit(irn.idx,'soldier',camp.x+20,camp.y+20);
        world.ents.set(u.id,u); world.units.push(u); u.order={k:'amove',x:camp.x,y:camp.y}; }
      const can = canFireNuke(isr);
      GEOTEST.sim(15);
      return { can, nukes: isr.nukes, used: !!world.nukeUsed, razed: (world.cities||[]).filter(c=>c.razed).length };
    })()`);
    check.eq(scout.can, false, 'one scout is not a nuclear trigger');
    check.eq(scout.used, false, 'no release against a lone scout');
    check.eq(scout.razed, 0, 'no city is razed by a lone scout');
    check.eq(scout.nukes, 2, 'both warheads are retained');

    await fresh();
    const assault = await page.json(`(() => {
      const isr = GEOTEST.player('ISR'), irn = GEOTEST.player('IRN');
      const camp = ent(isr.campId);
      for (let i=0;i<8;i++){ const u=newUnit(irn.idx,'soldier',camp.x+25+i*3,camp.y+25);
        world.ents.set(u.id,u); world.units.push(u); u.order={k:'amove',x:camp.x,y:camp.y}; }
      const full = canFireNuke(isr);
      camp.hp = camp.maxHp * 0.4;
      const breached = canFireNuke(isr);
      return { full, breached, targets: nukeTargets(isr).length };
    })()`);
    check.eq(assault.full, false, 'a full-strength capital does not authorise release');
    check.eq(assault.breached, true, 'a breached capital under an eight-unit assault does authorise it');

    /* Fire: foreign cities only, aid ends, no friendly city is razed. */
    const blast = await page.json(`(() => {
      const isr = GEOTEST.player('ISR');
      const camp = ent(isr.campId);
      const ownBefore = (world.cities||[]).filter(c => c.owner === isr.idx && !c.razed).map(c => c.name);
      const fired = fireNuke(isr);
      const ownRazed = (world.cities||[]).filter(c => c.razed && ownBefore.includes(c.name)).map(c => c.name);
      return { fired, nukes: isr.nukes, ownRazed, aidZeroed: !!isr.aidZeroed,
        ownCities: (world.cities||[]).filter(c => c.owner === isr.idx).length,
        enemyLeft: world.units.filter(u => !u.dead && u.owner !== isr.idx).length };
    })()`);
    check.eq(blast.fired, true, 'the strike fires under the last-resort condition');
    check.eq(blast.nukes, 1, 'one warhead is expended');
    check.eq(blast.ownRazed.length, 0, 'the blast does not raze the defender\'s own cities', blast.ownRazed);
    check.eq(blast.enemyLeft, 0, 'the assaulting ground force is destroyed', blast.enemyLeft);
    check.eq(blast.aidZeroed, true, 'foreign aid is permanently suspended');

    /* Only Israel fields warheads. */
    const roster = await page.json(`(() => {
      GEOTEST.boot({ mode: 'real', diff: 'Hard', human: 'ISR',
        countries: REAL_KEYS.slice(0, 12), seed: ${seed}, allAI: true });
      const irn = world.players.find(p => p.country === 'IRN');
      const holders = world.players.filter(p => (p.nukes||0) > 0).map(p => p.country);
      irn.nukes = 2;
      return { holders, iranCanFire: canFireNuke(irn) };
    })()`);
    check.eq(roster.holders.join(','), 'ISR', 'Israel is the only nuclear power on the board', roster.holders);
    check.eq(roster.iranCanFire, false, 'another state cannot use the Israeli release path');
  }
};
