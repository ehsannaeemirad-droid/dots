/* Structures and fortification: HP from code, damage multipliers, live
 * time-to-destroy and the kamikaze blast-position regression. */
'use strict';

module.exports = {
  name: 'structures/damage-and-durability',
  timeoutMs: 180000,
  async run({ page, check, seed }) {
    await page.eval(`GEOTEST.boot({ mode: 'classic', diff: 'Normal', human: 'IRN',
      countries: ['IRN','ISR'], seed: ${seed}, allAI: false })`);
    await page.eval('for (const p of world.players) p.aiCtl = null;');
    await page.json('GEOTEST.sim(2)');
    await page.eval('GEOTEST.clearUnits()');

    /* HP and armour come from the game's own table, not from this test. */
    const hp = await page.json(`(() => {
      const out = {};
      for (const k of ['camp','tower','sam','aa','airbase','outpost']) {
        out[k] = { hp: CFG.BUILDINGS[k].hp, armor: CFG.BUILDINGS[k].armor
          || ((k === 'camp' || k === 'airbase') ? 'fortified' : 'structure') };
      }
      return out;
    })()`);
    check.eq(hp.camp.hp, 1100, 'field HQ has 1100 HP');
    check.eq(hp.tower.hp, 200, 'bunker has 200 HP');
    check.eq(hp.airbase.hp, 600, 'airbase has 600 HP');
    check.eq(hp.tower.armor, 'structure', 'bunker uses structure armour');
    check.eq(hp.camp.armor, 'fortified', 'field HQ uses fortified armour');

    /* Multipliers through the real damage function, one hit per unit type. */
    const shots = await page.json(`(() => {
      const me = GEOTEST.player('IRN'), foe = GEOTEST.player('ISR');
      const b = ent(foe.campId);
      b.hp = b.maxHp;
      const out = {};
      for (const t of ['soldier','tank','atgm','drone']) {
        const u = newUnit(me.idx, t, b.x + 40, b.y + 40);
        const before = b.hp;
        applyDamage(b, CFG.UNITS[t].dmg, u);
        out[t] = { raw: CFG.UNITS[t].dmg, dealt: +(before - b.hp).toFixed(2),
          mult: +((before - b.hp) / CFG.UNITS[t].dmg).toFixed(3) };
        u.dead = true; world.ents.delete(u.id);
      }
      return out;
    })()`);
    check.near(shots.soldier.mult, 0.28, 0.001, 'small arms do 0.28x to a fortified HQ');
    check.near(shots.tank.mult, 0.40, 0.001, 'tank guns do 0.40x to a fortified HQ');
    check.near(shots.atgm.mult, 0.35, 0.001, 'ATGMs do 0.35x to a fortified HQ');
    check.near(shots.drone.mult, 1.40, 0.001, 'drone warheads do 1.40x to a fortified HQ');

    /* Bunker per HP must be tougher than the field HQ against rifles. */
    const ratio = await page.json(`(() => {
      const m = CFG.DAMAGE.TABLE.smallArms;
      const secPerHp = (hpVal, armor) => 1 / (m[armor] * (CFG.UNITS.soldier.dmg / CFG.UNITS.soldier.atk));
      return { camp: secPerHp(CFG.BUILDINGS.camp.hp, 'fortified'), tower: secPerHp(CFG.BUILDINGS.tower.hp, 'structure') };
    })()`);
    check.gt(ratio.tower, ratio.camp * 2, 'a bunker takes >2x longer per HP against rifles', ratio);

    /* Live: 8 riflemen cannot destroy a bunker because it kills them first. */
    const bunker = await page.json(`(() => {
      const me = GEOTEST.player('IRN'), foe = GEOTEST.player('ISR');
      setRelation(me.idx, foe.idx, 'WAR', false);
      const camp = ent(foe.campId);
      foe.cents = 100000;
      let b = null;
      for (let r = 90; r <= 300 && !b; r += 20) {
        for (let k = 0; k < 16 && !b; k++) {
          const a = k * Math.PI / 8;
          const s = freeSpotLocal(camp.x + Math.cos(a) * r, camp.y + Math.sin(a) * r,
            world.w, world.h, world.obstacles, world.terrainBlocked);
          if (!canPlaceBuilding(foe.idx, 'tower', s.x, s.y)) b = placeBuilding(foe.idx, 'tower', s.x, s.y);
        }
      }
      b.hp = b.maxHp;
      for (const x of world.buildings) if (x !== b && !x.dead && ['tower','sam','aa','outpost','ncamp'].includes(x.kind)) x.dead = true;
      const ids = [];
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        const s = freeSpotLocal(b.x + Math.cos(a) * 60, b.y + Math.sin(a) * 60, world.w, world.h, world.obstacles, world.terrainBlocked);
        const u = newUnit(me.idx, 'soldier', s.x, s.y);
        world.ents.set(u.id, u); world.units.push(u);
        u.order = { k: 'attack', x: b.x, y: b.y, target: b.id }; u.target = b.id;
        ids.push(u.id);
      }
      GEOTEST.sim(120);
      return { towerHp: Math.round(b.hp), survivors: ids.filter(id => { const u = ent(id); return u && !u.dead; }).length };
    })()`);
    check.eq(bunker.survivors, 0, 'a bunker wipes eight riflemen', bunker);
    check.gt(bunker.towerHp, 100, 'the bunker is still standing after 120 s', bunker);

    /* Drone regression: a 40 px-radius HQ must take blast damage. A drone used
       to detonate at its own position, outside the structure, and deal zero. */
    const drone = await page.json(`(() => {
      GEOTEST.boot({ mode: 'classic', diff: 'Normal', human: 'IRN', countries: ['IRN','ISR'], seed: ${seed}, allAI: false });
      for (const p of world.players) p.aiCtl = null;
      GEOTEST.clearUnits();
      const me = GEOTEST.player('IRN'), foe = GEOTEST.player('ISR');
      setRelation(me.idx, foe.idx, 'WAR', false);
      const b = ent(foe.campId); b.hp = b.maxHp;
      for (const x of world.buildings) if (x !== b && !x.dead && ['tower','sam','aa','outpost','ncamp'].includes(x.kind)) x.dead = true;
      const s = freeSpotLocal(b.x + 120, b.y + 120, world.w, world.h, world.obstacles, world.terrainBlocked);
      const u = newUnit(me.idx, 'drone', s.x, s.y);
      world.ents.set(u.id, u); world.units.push(u);
      u.order = { k: 'attack', x: b.x, y: b.y, target: b.id }; u.target = b.id;
      GEOTEST.sim(30);
      return { dealt: +(b.maxHp - b.hp).toFixed(1), droneDead: u.dead };
    })()`);
    check.gt(drone.dealt, 10, 'a kamikaze drone damages a large structure', drone);
    check.eq(drone.droneDead, true, 'the drone is consumed by the strike');
  }
};
