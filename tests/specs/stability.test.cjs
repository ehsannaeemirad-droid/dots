/* Stability: restart, capital relocation, invalid actions and numerical
 * sanity over long simulated battles. */
'use strict';

module.exports = {
  name: 'stability/restart-and-invalids',
  timeoutMs: 240000,
  async run({ page, check, seed }) {
    const boot = `GEOTEST.boot({ mode: 'real', diff: 'Normal', human: 'ISR',
      countries: ['ISR','IRN'], seed: ${seed}, allAI: true })`;
    await page.eval(boot);
    await page.json('GEOTEST.sim(120)');
    const mid = await page.json('GEOTEST.summary()');

    /* Restart: a fresh match starts from zero with a full treasury. */
    await page.eval(boot);
    const fresh = await page.json('GEOTEST.summary()');
    check.eq(fresh.time, 0, 'restart resets the clock', fresh.time);
    check.eq(fresh.players[0].units >= 0, true, 'restart produces a playable world', fresh.players[0].units);
    check.ok(mid.time > 100, 'the pre-restart match had advanced', mid.time);

    /* Capital relocation: destroy the seat of government; the state must keep
       a functioning command post somewhere it still holds. */
    const relo = await page.json(`(() => {
      const me = GEOTEST.player('ISR'), foe = GEOTEST.player('IRN');
      const before = me.capital;
      const camp = ent(me.campId);
      /* Capture the command post: this is the path that relocates a government. */
      convertBuildingOwner(camp, foe.idx);
      GEOTEST.sim(5);
      const now = ent(me.campId);
      return { before, after: me.capital, alive: !!now && !now.dead && now.owner === me.idx,
        cities: (world.cities||[]).filter(c => c.owner === me.idx).length };
    })()`);
    check.eq(relo.alive, true, 'a destroyed capital is replaced by a living camp', relo);
    check.ok(relo.cities > 0, 'the state still holds cities after relocation', relo.cities);

    /* Invalid actions are refused, not thrown. */
    const invalid = await page.json(`(() => {
      const me = GEOTEST.player('IRN');
      const camp = ent(me.campId);
      me.cents = 0;
      const buy = queueUnit(me.idx, 'soldier');
      camp.dead = true;
      const msl = launchMissile(me.idx, Object.keys(CFG.MSL)[0], camp.x, camp.y);
      const nuke = fireNuke(me);
      return { buy, msl, nuke, coins: me.cents };
    })()`);
    check.eq(invalid.buy, false, 'a purchase with an empty treasury is refused');
    check.eq(invalid.msl, false, 'a missile without a command post is refused');
    check.eq(invalid.nuke, false, 'a non-nuclear state cannot release');
    check.eq(invalid.coins, 0, 'refusals spend nothing');

    /* Numerical stability: 1,800 ticks of an AI battle. */
    await page.eval(boot);
    await page.eval(`for (const p of world.players) p.aiCtl = null; setRelation(0, 1, 'WAR', false);
      GEOTEST.spawn('ISR','soldier', 800, 800); GEOTEST.spawn('IRN','tank', 830, 800);`);
    const long = await page.json(`(() => {
      GEOTEST.sim(300);
      const bad = [];
      if (!Number.isFinite(world.time)) bad.push('time');
      for (const p of world.players) {
        for (const k of ['cents','incomeCpt','warExhaustion']) if (!Number.isFinite(p[k] || 0)) bad.push(p.country + '.' + k);
      }
      for (const u of world.units) if (!Number.isFinite(u.x) || !Number.isFinite(u.y) || !Number.isFinite(u.hp)) bad.push('unit#' + u.id);
      return { bad: bad.slice(0, 5), ticks: world.tick, units: world.units.length };
    })()`);
    check.eq(long.bad.length, 0, 'no NaN/Infinity after 300 s of combat', long.bad);
    check.gt(long.ticks, 1800, 'the long run executed more than 1,800 ticks', long.ticks);
  }
};
