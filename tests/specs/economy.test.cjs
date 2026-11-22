/* Economy: the income identity, city-share income, spending guards, the
 * sovereign-wealth reserve, and numerical stability. */
'use strict';

module.exports = {
  name: 'economy/income-and-spending',
  timeoutMs: 180000,
  async run({ page, check, seed }) {
    async function fresh(countries) {
      await page.eval(`GEOTEST.boot({ mode: 'real', diff: 'Normal', human: '${(countries || ['IRN', 'ISR'])[0]}',
        countries: ${JSON.stringify(countries || ['IRN', 'ISR'])}, seed: ${seed}, allAI: true })`);
      await page.eval('for (const p of world.players) p.aiCtl = null;');
      await page.json('GEOTEST.sim(61)');
      await page.eval('GEOTEST.clearUnits()');
    }

    await fresh();
    const eco = await page.json('GEOTEST.eco("IRN")');
    const parts = eco.eco;
    const sum = parts.base + parts.res + parts.out + parts.trade + parts.mine + parts.workers + parts.aid + parts.choke;
    check.near(sum, parts.cpt, 0.5, 'income breakdown sums to the headline rate', { sum, cpt: parts.cpt });
    check.near(eco.income, parts.cpt * 100 / 60, 0.5, 'incomeCpt is the coins-per-minute rate converted once', { income: eco.income, cpt: parts.cpt });
    check.gt(parts.cpt, 0, 'a country earns a positive income', parts.cpt);

    /* Losing cities must hurt: income scales with city control. */
    const loss = await page.json(`(() => {
      const me = GEOTEST.player('IRN'), foe = GEOTEST.player('ISR');
      updateEconomy();
      const before = +(me.incomeCpt / 100).toFixed(2);
      const cities = (world.cities||[]).filter(c => c.owner === me.idx && !c.razed).slice(0, 2);
      for (const c of cities) c.owner = foe.idx;
      refreshCityShares(); applyCityCaps(); updateEconomy();
      return { names: cities.map(c => c.name), before, after: +(me.incomeCpt / 100).toFixed(2), share: +me.cityShare.toFixed(3) };
    })()`);
    check.ok(loss.after < loss.before, 'losing two cities lowers income', loss);
    check.ok(loss.share < 1, 'city share falls below 1 after the loss', loss.share);

    /* Industrial infrastructure: mines are the only building that pays income.
       Each mine is worth 9 cr/min; destroying it removes exactly that. */
    await fresh();
    const ind = await page.json(`(() => {
      const me = GEOTEST.player('IRN');
      const before = +me.eco.cpt.toFixed(1);
      const built = [];
      for (const d of world.deposits) {
        if (built.length >= 2) break;
        if (d.mineId) continue;
        if (!canPlaceBuilding(me.idx, 'mine', d.x, d.y)) {
          const b = placeBuilding(me.idx, 'mine', d.x, d.y);
          if (b) built.push(b.id);
        }
      }
      updateEconomy();
      const withMines = +me.eco.cpt.toFixed(1);
      const perMine = +((withMines - before) / Math.max(1, built.length)).toFixed(1);
      for (const id of built) { const b = ent(id); if (b) b.dead = true; }
      updateEconomy();
      return { built: built.length, before, withMines, perMine, after: +me.eco.cpt.toFixed(1),
        mineStream: +me.eco.mine.toFixed(1) };
    })()`);
    check.eq(ind.built, 2, 'two mines can be built on free deposits', ind);
    check.near(ind.perMine, 9, 0.2, 'each mine adds 9 cr/min', ind);
    check.near(ind.after, ind.before, 0.2, 'destroying the mines removes that income', ind);
    check.eq(ind.mineStream, 0, 'the mine income stream is zero after the loss');

    /* War must not silently change the income rate: there is no upkeep, and the
       only war-specific money event is a one-off patron package later on. */
    const warEco = await page.json(`(() => {
      const me = GEOTEST.player('IRN'), foe = GEOTEST.player('ISR');
      updateEconomy();
      const before = +me.incomeCpt.toFixed(3);
      const c0 = me.cents;
      setRelation(me.idx, foe.idx, 'WAR', false);
      GEOTEST.sim(30);
      updateEconomy();
      return { before, after: +me.incomeCpt.toFixed(3), gain: +((me.cents - c0) / 100).toFixed(1) };
    })()`);
    check.near(warEco.after, warEco.before, 0.01, 'declaring war does not change the income rate', warEco);
    check.gt(warEco.gain, 30, 'a belligerent still earns its full income for the first 30 s', warEco);

    /* Spending guards: no negative treasury, unaffordable purchases refused. */
    const broke = await page.json(`(() => {
      const me = GEOTEST.player('IRN');
      me.cents = 500;
      const bought = queueUnit(me.idx, 'tank');
      return { bought, coins: +(me.cents / 100).toFixed(2), negative: me.cents < 0 };
    })()`);
    check.eq(broke.bought, false, 'a 5-coin treasury cannot buy a 100-coin tank');
    check.eq(broke.negative, false, 'the treasury never goes negative');
    check.eq(broke.coins, 5, 'a refused purchase costs nothing');

    /* Sovereign wealth is a bounded reserve, not a money printer. */
    await fresh(['SAU', 'ISR']);
    const sw = await page.json(`(() => {
      const me = GEOTEST.player('SAU');
      me.swCd = 0; updateEconomy();
      const income = me.incomeCpt / 100;
      const before = me.cents / 100;
      const ok = useSovereignWealth(me);
      const gain = me.cents / 100 - before;
      const again = useSovereignWealth(me);
      return { ok, gain: +gain.toFixed(1), income: +income.toFixed(2), cooldown: me.swCd, again };
    })()`);
    check.eq(sw.ok, true, 'a rich state can liquidate its fund once');
    check.lt(sw.gain, sw.income * 180, 'the payout is at most ~3 minutes of income', sw);
    check.gt(sw.gain, 0, 'the payout is positive', sw);
    check.eq(sw.again, false, 'the same fund cannot be drawn twice inside the cooldown');
    check.gt(sw.cooldown, 600, 'the cooldown is long (20 min)', sw.cooldown);

    /* Stability: 10 minutes of a two-player war without NaN in the economy. */
    await fresh();
    const stable = await page.json(`(() => {
      const me = GEOTEST.player('IRN'), foe = GEOTEST.player('ISR');
      setRelation(me.idx, foe.idx, 'WAR', false);
      GEOTEST.sim(600);
      const bad = [];
      for (const p of world.players) {
        if (!Number.isFinite(p.cents) || !Number.isFinite(p.incomeCpt) || !Number.isFinite(p.warExhaustion || 0)) bad.push(p.country);
      }
      return { bad, coins: +(me.cents / 100).toFixed(0), time: +world.time.toFixed(0) };
    })()`);
    check.eq(stable.bad.length, 0, 'no non-finite economy values after 10 minutes', stable.bad);
    check.gt(stable.coins, 0, 'treasury stays positive while at war', stable.coins);
  }
};
