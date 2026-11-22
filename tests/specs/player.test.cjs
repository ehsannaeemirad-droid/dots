/* Player command path: select through the UI's ALL ARMY handler and order with
 * issueMoveOrder(), the function the canvas pointer handler calls. */
'use strict';

module.exports = {
  name: 'player/select-and-order',
  timeoutMs: 180000,
  async run({ page, check, seed }) {
    await page.eval(`GEOTEST.boot({ mode: 'real', diff: 'Normal', human: 'IRN',
      countries: ['IRN','ISR'], seed: ${seed}, allAI: false })`);
    await page.eval('for (const p of world.players) p.aiCtl = null;');
    await page.json('GEOTEST.sim(61)');
    await page.eval('GEOTEST.clearUnits()');

    const setup = await page.json(`(() => {
      const me = GEOTEST.player('IRN');
      const camp = ent(me.campId);
      const ids = [];
      for (let i = 0; i < 3; i++) {
        const s = freeSpotLocal(camp.x + 90 + i * 18, camp.y + 70, world.w, world.h,
          world.obstacles, world.terrainBlocked);
        const u = newUnit(me.idx, 'soldier', s.x, s.y);
        world.ents.set(u.id, u); world.units.push(u);
        ids.push(u.id);
      }
      return { ids, camp: { x: camp.x, y: camp.y },
        start: ids.map(id => { const u = ent(id); return [Math.round(u.x), Math.round(u.y)]; }) };
    })()`);

    const sel = await page.json(`(() => {
      document.getElementById('btnAllCombat').click();
      return { n: sel.units.length };
    })()`);
    check.eq(sel.n, 3, 'the ALL ARMY button selects all three riflemen', sel);

    /* A ground order inside projection range, issued through the real function. */
    const target = { x: setup.camp.x + 320, y: setup.camp.y };
    const ordered = await page.json(`(() => {
      issueMoveOrder(${target.x}, ${target.y});
      return ${JSON.stringify(setup.ids)}.map(id => { const u = ent(id); return u.order ? u.order.k : null; });
    })()`);
    check.eq(ordered.every(k => k === 'amove' || k === 'attack'), true,
      'the order path assigns every selected unit an order', ordered);

    const moved = await page.json(`(() => {
      GEOTEST.sim(25);
      return ${JSON.stringify(setup.ids)}.map((id, i) => {
        const u = ent(id);
        return u ? Math.round(dist(u.x, u.y, ${JSON.stringify(setup.start)}[i][0], ${JSON.stringify(setup.start)}[i][1])) : -1;
      });
    })()`);
    check.gt(Math.min.apply(null, moved), 20, 'the ordered units actually moved', moved);

    /* Right-clicking a hostile unit must produce an explicit attack order. */
    const atk = await page.json(`(() => {
      const me = GEOTEST.player('IRN'), foe = GEOTEST.player('ISR');
      setRelation(me.idx, foe.idx, 'WAR', false);
      GEOTEST.clearUnits();
      const camp = ent(me.campId);
      const s = freeSpotLocal(camp.x + 90, camp.y + 90, world.w, world.h, world.obstacles, world.terrainBlocked);
      const u = newUnit(me.idx, 'soldier', s.x, s.y);
      world.ents.set(u.id, u); world.units.push(u);
      const e = newUnit(foe.idx, 'soldier', camp.x + 160, camp.y + 160);
      world.ents.set(e.id, e); world.units.push(e);
      document.getElementById('btnAllCombat').click();
      issueMoveOrder(e.x, e.y);
      return { k: u.order && u.order.k, target: u.target === e.id,
        selected: sel.units.length };
    })()`);
    check.eq(atk.selected, 1, 'the UI selects the unit before the order');
    check.eq(atk.k, 'attack', 'ordering onto an enemy unit issues an attack order', atk);
    check.eq(atk.target, true, 'the attack order names the enemy unit');
  }
};
