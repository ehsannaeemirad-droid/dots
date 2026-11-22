/* Objectives: hold clocks are war clocks, contested cities are required,
 * losing a city resets its clock, and skirmish stays conquest-only. */
'use strict';

module.exports = {
  name: 'objectives/war-gated-holds',
  timeoutMs: 180000,
  async run({ page, check, seed }) {
    /* Egypt's objective is "hold Cairo and Suez for 20 min". */
    await page.eval(`GEOTEST.boot({ mode: 'real', diff: 'Normal', human: 'EGY',
      countries: ['EGY','ISR','IRN'], seed: ${seed}, allAI: true })`);
    await page.eval('for (const p of world.players) p.aiCtl = null;');
    await page.json('GEOTEST.sim(61)');
    await page.eval('GEOTEST.clearUnits()');

    const peace = await page.json(`(() => {
      const egy = GEOTEST.player('EGY'), isr = GEOTEST.player('ISR');
      setRelation(egy.idx, isr.idx, 'NEUTRAL', false);
      setRelation(egy.idx, GEOTEST.player('IRN').idx, 'NEUTRAL', false);
      const t0 = heldFor(egy, 'egy_hold');
      GEOTEST.sim(20);
      return { t0: +t0.toFixed(1), t1: +heldFor(egy, 'egy_hold').toFixed(1), atWar: atWar(egy) };
    })()`);
    check.eq(peace.atWar, false, 'Egypt starts at peace');
    check.eq(peace.t0, 0, 'no hold progress before the war');
    check.eq(peace.t1, 0, 'the hold clock does not run in peacetime', peace);

    const war = await page.json(`(() => {
      const egy = GEOTEST.player('EGY'), isr = GEOTEST.player('ISR');
      setRelation(egy.idx, isr.idx, 'WAR', false);
      GEOTEST.sim(12);
      const afterWar = +heldFor(egy, 'egy_hold').toFixed(1);
      /* A city that was never attacked cannot satisfy a hold objective. */
      const cairo = GEOTEST.city('Cairo');
      const neverContested = cairo && !cairo.everContested;
      const holdable = holdableCity(egy, 'Cairo');
      /* Now mark both cities as besieged and re-check. */
      for (const n of ['Cairo', 'Suez']) { const c = GEOTEST.city(n); if (c && c.owner === egy.idx) c.everContested = true; }
      GEOTEST.sim(12);
      return { afterWar, neverContested, holdable, afterContest: +heldFor(egy, 'egy_hold').toFixed(1) };
    })()`);
    check.eq(war.afterWar, 0, 'war alone does not start the clock: the cities must have been contested', war.afterWar);
    check.eq(war.holdable, false, 'a never-attacked city is not holdable');
    check.gt(war.afterContest, 0, 'a contested, held city advances the clock', war.afterContest);

    const reset = await page.json(`(() => {
      const egy = GEOTEST.player('EGY'), isr = GEOTEST.player('ISR');
      const cairo = GEOTEST.city('Cairo');
      const before = +heldFor(egy, 'egy_hold').toFixed(1);
      cairo.owner = isr.idx; refreshCityShares(); applyCityCaps();
      GEOTEST.sim(3);
      return { before, after: +heldFor(egy, 'egy_hold').toFixed(1) };
    })()`);
    check.gt(reset.before, 0, 'clock was running before the city fell');
    check.eq(reset.after, 0, 'losing a held city resets the clock to zero', reset);

    /* Skirmish: one conquest objective, no hold timers. */
    const skm = await page.json(`(() => {
      GEOTEST.boot({ mode: 'classic', diff: 'Normal', human: 'IRN',
        countries: ['IRN','SAU','EGY'], seed: ${seed}, allAI: true });
      const me = GEOTEST.player('IRN');
      const objs = objectivesFor(me);
      return { count: objs.length, id: objs[0] && objs[0].id, done: objs[0] && objs[0].done,
        target: objs[0] && objs[0].target };
    })()`);
    check.eq(skm.count, 1, 'skirmish has exactly one objective', skm);
    check.eq(skm.id, 'conquest', 'skirmish objective is total conquest', skm);
    check.eq(skm.done, false, 'conquest is not satisfied at the start', skm);
    check.eq(skm.target, 2, 'conquest target counts the other factions', skm);
  }
};
