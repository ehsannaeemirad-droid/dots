/* AI: every seat has a controller, composition stays balanced, anti-air is
 * capped, tower building respects the difficulty cap, targeting is hostile,
 * and the affordability guard holds. */
'use strict';

module.exports = {
  name: 'ai/composition-and-targeting',
  timeoutMs: 240000,
  async run({ page, check, seed }) {
    await page.eval(`GEOTEST.boot({ mode: 'real', diff: 'Hard', human: 'ISR',
      countries: REAL_KEYS.slice(0, 19), seed: ${seed}, allAI: true })`);

    const ctl = await page.json(`world.players.map(p => ({ code: p.country, ai: !!p.aiCtl, human: !!p.isHuman }))`);
    check.eq(ctl.filter(p => p.ai).length, ctl.length, 'every AI seat has a controller', ctl.filter(p => !p.ai));
    check.eq(ctl.filter(p => p.human).length, 0, 'no seat is left human in an all-AI run', ctl);

    await page.json('GEOTEST.sim(480)');
    const comp = await page.json(`(() => {
      const AA = ['manpads','spaag','aa'];
      return world.players.filter(p => p.alive).map(p => {
        const us = world.units.filter(u => !u.dead && u.owner === p.idx);
        const by = {}; for (const u of us) by[u.type] = (by[u.type] || 0) + 1;
        const aa = AA.reduce((s, t) => s + (by[t] || 0), 0);
        const top = Object.entries(by).sort((a,b) => b[1]-a[1])[0] || ['none', 0];
        return { code: p.country, n: us.length, aaShare: us.length ? aa / us.length : 0,
          topType: top[0], topShare: us.length ? top[1] / us.length : 0 };
      });
    })()`);
    const big = comp.filter(c => c.n >= 20);
    check.gt(big.length, 3, 'at least four states field a real army after 8 minutes', big.length);
    const mono = big.filter(c => c.topShare > 0.85);
    check.eq(mono.length, 0, 'no large army is a single-unit monoculture', mono);
    const aaHeavy = big.filter(c => c.aaShare > 0.5);
    check.eq(aaHeavy.length, 0, 'anti-air never exceeds half of a large army', aaHeavy);

    const towers = await page.json(`(() => {
      const cap = {}; for (const k of ['Easy','Medium','Hard']) cap[k] = CFG.AI.DIFF[k].maxTowers;
      return world.players.map(p => ({ code: p.country,
        towers: world.buildings.filter(b => !b.dead && b.owner === p.idx && b.kind === 'tower').length,
        cap: p.aiCtl ? p.aiCtl.cfg.maxTowers : null })).filter(x => x.cap != null);
    })()`);
    check.eq(towers.filter(t => t.towers > t.cap).length, 0, 'no AI exceeds its difficulty tower cap', towers.filter(t => t.towers > t.cap));

    const target = await page.json(`(() => {
      const out = [];
      for (const p of world.players.filter(x => x.alive)) {
        const b = pickEnemyTargetFor(p);
        if (b) out.push({ code: p.country, kind: b.kind, hostile: hostile(p, b), owner: b.owner });
      }
      return out;
    })()`);
    check.gt(target.length, 3, 'the AI can find enemy camps/outposts to attack', target.length);
    check.eq(target.filter(t => !t.hostile).length, 0, 'every chosen target is hostile', target.filter(t => !t.hostile));
    check.eq(target.filter(t => !['camp', 'outpost'].includes(t.kind)).length, 0, 'targets are command posts or outposts', target.filter(t => !['camp','outpost'].includes(t.kind)));

    /* The chooser never proposes something the treasury cannot pay for. */
    const afford = await page.json(`(() => {
      const p = GEOTEST.player('IRN');
      const mix = { soldier: 0.4, tank: 0.3, atgm: 0.3 };
      const free = 12;
      const picks = [];
      for (let i=0;i<40;i++) picks.push(pickBuildType(p, mix, free));
      const bad = picks.filter(k => k && costOf(p, k) > free);
      return { picks: [...new Set(picks)], bad, cost: picks.filter(Boolean).map(k => costOf(p, k)) };
    })()`);
    check.eq(afford.bad.length, 0, 'pickBuildType only proposes affordable units', afford.bad);
    check.note('composition sample: ' + big.map(c => c.code + ' ' + c.n + ' (' + c.topType + ' ' + (100 * c.topShare).toFixed(0) + '%)').join(', '));
  }
};
