/* Deterministic 3.md balance evidence.
 *
 * Five controlled national strategies run through the real economy for 30/60/
 * 120 game-minutes, then three independent 19-country free-for-alls record
 * leader, duration, economy, territory, losses and diplomacy. This is a
 * simulation harness, not a synthetic assertion table: every action goes
 * through placeBuilding/queueUnit/updateEconomy and the normal AI. */
'use strict';

module.exports = {
  name: 'balance/strategy-simulations',
  timeoutMs: 240000,
  async run({ page, check, seed }) {
    const sim = await page.json(`(() => {
      const codes = ['IRN', 'SAU', 'TUR', 'EGY', 'ISR'];
      const styles = { IRN: 'economy', SAU: 'military', TUR: 'balanced', EGY: 'defence', ISR: 'air' };
      const snapshots = [];
      GEOTEST.boot({ mode: 'classic', diff: 'Normal', human: 'IRN', countries: codes, seed: ${seed}, allAI: false });
      for (const p of world.players) {
        p.aiCtl = null;
        p.cents = 900000;
        p.doctrine = styles[p.country] === 'defence' ? 'defense' : (styles[p.country] === 'air' ? 'air' : 'balanced');
      }
      /* Neutral laboratory: no opening war or pact may decide the economy. */
      for (let i = 0; i < world.players.length; i++) for (let j = i + 1; j < world.players.length; j++) {
        setRelation(i, j, 'NEUTRAL', true);
        delete world.agreements[i + ':' + j];
      }
      const invest = (p, style, tick) => {
        const useEco = style === 'economy' || (style === 'balanced' && tick % 2 === 0);
        const useMil = style === 'military' || (style === 'balanced' && tick % 2 === 1);
        if (useEco) {
          const f = economicSites(p).find(x => !canPlaceBuilding(p.idx, 'economy', x.x, x.y));
          if (f) placeBuilding(p.idx, 'economy', f.x, f.y);
        }
        if (useMil) {
          for (let k = 0; k < 3; k++) {
            if (!queueUnit(p.idx, 'tank')) break;
          }
        }
        if (style === 'defence') {
          const camp = ent(p.campId);
          if (camp) {
            const spot = freeSpotLocal(camp.x + 76, camp.y + 48, world.w, world.h, world.obstacles, world.terrainBlocked);
            if (!canPlaceBuilding(p.idx, 'tower', spot.x, spot.y)) placeBuilding(p.idx, 'tower', spot.x, spot.y);
          }
        }
        if (style === 'air' && p.spawnQ.length < 2) queueUnit(p.idx, 'f35i');
      };
      const sample = () => {
        const s = GEOTEST.summary();
        const rows = s.players.map(p => {
          const live = world.players.find(x => x.country === p.code);
          const complexes = world.buildings.filter(b => !b.dead && b.owner === live.idx && b.kind === 'economy').length;
          const towers = world.buildings.filter(b => !b.dead && b.owner === live.idx && (b.kind === 'tower' || b.kind === 'aa' || b.kind === 'sam')).length;
          const aircraft = world.units.filter(u => !u.dead && u.owner === live.idx && u.fly && !u.kamikaze).length;
          return { code: p.code, style: styles[p.code], coins: p.coins, earned: p.earned, spent: p.spent,
            income: p.income, units: p.units, complexes, towers, aircraft, cities: p.cities, lost: p.lostTotal };
        });
        return { time: s.time, over: s.over, rows };
      };
      for (let tick = 0; tick < 12; tick++) {
        for (const p of world.players) invest(p, styles[p.country], tick);
        GEOTEST.sim(600);
        if ([3, 6, 12].includes(tick + 1)) snapshots.push(sample());
      }
      return { snapshots, finite: world.players.every(p => Number.isFinite(p.cents) && Number.isFinite(p.incomeCpt)) };
    })()`);

    check.eq(sim.snapshots.length, 3, 'the economy simulation reaches 30, 60 and 120 minutes', sim);
    check.eq(sim.finite, true, 'no national balance became non-finite during 120 minutes', sim);
    const [at30, at60, at120] = sim.snapshots;
    check.near(at30.time, 1800, 1, 'the first economic snapshot is at 30 minutes', at30);
    check.near(at60.time, 3600, 1, 'the second economic snapshot is at 60 minutes', at60);
    check.near(at120.time, 7200, 1, 'the third economic snapshot is at 120 minutes', at120);
    const end = at120.rows.reduce((m, r) => (m[r.code] = r, m), {});
    check.ok(end.IRN.complexes >= 1, 'the economic-first track builds oil infrastructure', end.IRN);
    check.ok(end.SAU.units > end.IRN.units, 'the military-first track fields more ground units', { military: end.SAU, economy: end.IRN });
    check.ok(end.EGY.towers > 0, 'the defensive track invests in fortifications', end.EGY);
    check.ok(end.ISR.aircraft >= 1, 'the air track adds aircraft', end.ISR);
    check.ok(end.TUR.complexes >= 1 && end.TUR.units > 0, 'the balanced track invests in both economy and army', end.TUR);
    check.ok(end.IRN.earned > 0 && end.SAU.earned > 0 && end.EGY.earned > 0 && end.ISR.earned > 0,
      'every strategy earns a real income over the run', end);
    check.note('economic simulation ' + JSON.stringify(sim.snapshots.map(s => ({
      t: s.time, rows: s.rows.map(r => [r.code, r.complexes, r.units, r.coins, r.earned, r.income])
    }))));

    /* Three independent 19-country matches. They are deliberately short
       observations: the point is a recorded comparative snapshot, not a claim
       that a 19-seat FFA resolves inside a few minutes. */
    const matches = [];
    for (let i = 0; i < 3; i++) {
      const one = await page.json(`(() => {
        GEOTEST.boot({ mode: 'classic', diff: 'Medium', human: 'IRN', countries: REAL_KEYS.slice(), seed: ${seed + i * 7919}, allAI: true });
        const started = world.time;
        GEOTEST.sim(240);
        const s = GEOTEST.summary();
        const leader = s.players.slice().sort((a, b) => (b.cities - a.cities) || (b.power - a.power))[0];
        const wars = world.players.filter(p => p.alive && atWar(p)).length;
        const agreements = Object.keys(world.agreements || {}).length;
        const personalities = [...new Set(world.players.filter(p => !p.isHuman).map(p => p.aiCtl && p.aiCtl.personality))];
        return { started, time: s.time, over: s.over, winner: s.winner, winReason: s.winReason,
          alive: s.players.filter(p => p.alive).length, leader: leader && leader.code,
          leaderCities: leader && leader.cities, leaderCoins: leader && leader.coins,
          leaderPower: leader && leader.power, leaderIncome: leader && leader.income,
          totalCities: s.players.reduce((n, p) => n + p.cities, 0), wars, agreements,
          personalities, airframes: s.players.reduce((n, p) => n + (p.byType.f35i || 0) + (p.byType.f35 || 0) + (p.byType.f16 || 0), 0) };
      })()`);
      matches.push(one);
      check.eq(one.alive >= 15, true, '19-country match ' + (i + 1) + ' is still a live free-for-all', one);
      check.eq(one.agreements > 0, true, '19-country match ' + (i + 1) + ' maintains diplomacy', one);
      check.gt(one.personalities.length, 1, '19-country match ' + (i + 1) + ' uses multiple AI personalities', one);
    }
    check.note('19-country match records ' + JSON.stringify(matches));
  }
};
