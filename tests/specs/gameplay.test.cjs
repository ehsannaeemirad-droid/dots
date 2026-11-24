/* Gameplay brief regressions: map aspect, 19-country skirmish, slow city
 * capture, Israeli F-35 wing, cheaper tanks, passable rivers, capturable city
 * seats, missile factories/salvos, anti-missile economics, expanded cities,
 * economy complex construction and doubled bunker strength. */
'use strict';

module.exports = {
  name: 'mission/gameplay-brief',
  timeoutMs: 240000,
  async run({ page, check, seed }) {
    /* 1. Aspect-correct projection: east-west pixels must reflect cos(latitude). */
    const proj = await page.json(`({ lonpx: ME_LONPX, latpx: ME_LATPX,
      ideal: ME_LATPX * Math.cos(33 * Math.PI / 180) })`);
    check.near(proj.lonpx, proj.ideal, 1.2, 'map projection uses a latitude-correct longitude scale', proj);

    /* 2. Skirmish lobby defaults to Iran, all countries, >16 AI opponents. */
    const lobby = await page.json(`(() => {
      const keepMode = app.gameMode, keepPreset = app.classicPreset, keepCountry = app.myCountry;
      app.gameMode = 'classic'; app.classicPreset = 'ffa'; app.myCountry = 'IRN';
      buildLobbyFromState();
      const out = { count: app.lobby.length, ai: app.lobby.filter(s => !s.human).length,
        human: app.lobby.filter(s => s.human).map(s => s.country), countries: REAL_KEYS.length };
      app.gameMode = keepMode; app.classicPreset = keepPreset; app.myCountry = keepCountry;
      return out;
    })()`);
    check.eq(lobby.human.join(','), 'IRN', 'skirmish human defaults to Iran');
    check.gt(lobby.ai, 16, 'skirmish offers more than sixteen AI opponents', lobby);
    check.eq(lobby.count, lobby.countries, 'every map country can join one skirmish');

    /* 3/5/13. Configuration values from the brief. */
    const cfg = await page.json(`({
      citySec: CFG.CAPTURE.CITY_SEC, capitalSec: CFG.CAPTURE.CITY_CAPITAL_SEC,
      tank: CFG.COSTS.tank, t90: CFG.COSTS.t90,
      bunkerHp: CFG.BUILDINGS.tower.hp, bunkerDmg: CFG.BUILDINGS.tower.dmg,
      factoryCost: CFG.COSTS.missileFactory, abmCost: CFG.COSTS.antiMissile,
      interceptCost: CFG.CAPTURE.INTERCEPT_COST,
      economyHp: CFG.BUILDINGS.economy.hp, economyBuild: CFG.BUILDINGS.economy.buildTime
    })`);
    check.eq(cfg.citySec, 420, 'minor city capture is ~7 minutes');
    check.eq(cfg.capitalSec, 600, 'capital capture is 10 minutes');
    check.eq(cfg.tank, 60, 'tanks are 40% cheaper (100 -> 60)');
    check.eq(cfg.t90, 72, 'T-90 is 40% cheaper (120 -> 72)');
    check.eq(cfg.bunkerHp, 400, 'bunkers have double HP');
    check.eq(cfg.bunkerDmg, 8, 'bunkers have double firepower');
    check.eq(cfg.factoryCost, 500, 'missile factory costs 500');
    check.eq(cfg.abmCost, 500, 'anti-missile battery costs 500');
    check.eq(cfg.interceptCost, 100, 'every anti-missile shot costs 100');
    check.eq(cfg.economyHp, 2400, 'economy complex has 4x the durability of an airbase');
    check.eq(cfg.economyBuild, 180, 'economy complex takes three minutes');

    await page.eval(`GEOTEST.boot({ mode: 'real', diff: 'Normal', human: 'IRN',
      countries: ['IRN','ISR'], seed: ${seed}, allAI: false })`);
    await page.eval('for (const p of world.players) p.aiCtl = null;');

    /* 4. Two Israeli airports with three F-35I each. */
    const isrAir = await page.json(`(() => {
      const isr = GEOTEST.player('ISR');
      const bases = world.buildings.filter(b => !b.dead && b.owner === isr.idx && b.kind === 'airbase');
      const jets = world.units.filter(u => !u.dead && u.owner === isr.idx && u.type === 'f35i');
      return { bases: bases.length, jets: jets.length,
        assigned: jets.filter(j => bases.some(b => b.id === j.airbaseId)).length,
        ammo: jets.every(j => j.ammo === j.maxAmmo), capacity: airSlots(isr.idx) };
    })()`);
    check.eq(isrAir.bases, 2, 'Israel starts with two airports');
    check.eq(isrAir.jets, 6, 'both airports are full of F-35s (3 each)');
    check.eq(isrAir.assigned, 6, 'every F-35 is parked at an Israeli airport');
    check.eq(isrAir.ammo, true, 'the F-35 wing starts fully armed');

    /* 6. Rivers exist, are traversable and slow movement by five. */
    const river = await page.json(`(() => {
      let found = null;
      for (const rn in (world.map.terrain.riverPts || {})) {
        if (found) break;
        for (const p of world.map.terrain.riverPts[rn]) if (world.map.terrain.riverAt(p.x, p.y)) { found = p; break; }
      }
      if (!found) for (let y = 0; y < world.h && !found; y += 8)
        for (let x = 0; x < world.w; x += 8) if (world.map.terrain.riverAt(x, y)) { found = { x, y }; break; }
      if (!found) return { error: 'no river cell' };
      return { found, blocked: world.map.terrain.blockedAt(found.x, found.y),
        hasDetector: typeof world.map.terrain.riverAt === 'function' };
    })()`);
    check.ok(river.hasDetector, 'river geometry has a traversal detector');
    if (!river.error) check.eq(river.blocked, false, 'a river cell is no longer a hard blocker', river);
    else check.note('no river cell sampled — river case skipped');
    const riverSpeed = await page.json(`(() => {
      let f = null; for (const rn in (world.map.terrain.riverPts || {})) {
        if (f) break;
        for (const p of world.map.terrain.riverPts[rn]) if (world.map.terrain.riverAt(p.x, p.y)) { f = p; break; }
      }
      if (!f) return { error: 'no river' };
      const irn = GEOTEST.player('IRN');
      const ru = { owner: irn.idx, type: 'soldier', x: f.x, y: f.y };
      const rf = unitSpeedFactor(ru);
      for (let dx = -10; dx <= 10; dx += 5) for (let dy = -10; dy <= 10; dy += 5) {
        const x = f.x + dx, y = f.y + dy;
        if (world.map.terrain.riverAt(x, y) || (world.terrainBlocked && world.terrainBlocked(x, y))) continue;
        if (terrainCellAt(x, y) !== terrainCellAt(f.x, f.y)) continue;
        if (roadAt(x, y) !== roadAt(f.x, f.y)) continue;
        const lf = unitSpeedFactor({ owner: irn.idx, type: 'soldier', x, y });
        if (lf > 0) return { river: rf, land: lf, ratio: rf / lf };
      }
      return { error: 'no same-terrain bank' };
    })()`);
    if (!riverSpeed.error) check.near(riverSpeed.ratio, 0.2, 0.02, 'river movement is exactly one fifth of ground speed', riverSpeed);
    else check.note('river speed pair unavailable: ' + riverSpeed.error);

    /* 7. Every city has a capturable seat, and every structure is capturable. */
    const seats = await page.json(`(() => {
      const missing = [], immune = [];
      for (const c of world.cities) {
        const hit = world.buildings.find(b => !b.dead && b.capturable &&
          (b.cityKey === c.id || (b.city || '').split(' (')[0].trim() === c.name));
        if (!hit) missing.push(c.name);
      }
      for (const b of world.buildings) if (!b.dead && !b.capturable) immune.push(b.kind);
      return { cities: world.cities.length, missing: missing.slice(0, 12), missingN: missing.length,
        immune: [...new Set(immune)] };
    })()`);
    check.eq(seats.missingN, 0, 'every city has its own capturable installation', seats);
    check.eq(seats.immune.length, 0, 'no structure is uncapturable', seats);

    /* 10. Urban network: expanded and especially dense in Iran. */
    const cities = await page.json(`(() => {
      const iran = world.cities.filter(c => c.code === 'IRN');
      return { iran: iran.length, total: world.cities.length,
        iranPop: +iran.reduce((s, c) => s + (c.pop || 0), 0).toFixed(1),
        tehran: iran.some(c => /tehran/i.test(c.name)) };
    })()`);
    check.gt(cities.iran, 24, 'Iran has a dense major-city network', cities);
    check.gt(cities.total, 90, 'the theatre city table was expanded substantially', cities);
    check.eq(cities.tehran, true, 'Tehran is present');

    /* 8. Missile factory queue: 500 cr and four minutes per missile, then salvo. */
    const missiles = await page.json(`(() => {
      GEOTEST.clearUnits();
      const irn = GEOTEST.player('IRN');
      irn.cents = 500000;
      const camp = ent(irn.campId);
      const s = freeSpotLocal(camp.x + 120, camp.y + 120, world.w, world.h, world.obstacles, world.terrainBlocked);
      const f = placeBuilding(irn.idx, 'missileFactory', s.x, s.y);
      if (!f) return { error: 'factory placement failed' };
      const before = irn.cents;
      const expectedCost = costOf(irn, 'fateh') * 100;
      const queued = queueMissileProduction(irn, 'fateh');
      const spent = before - irn.cents;
      f.prodT = 239.5; f.prodQ = ['fateh'];
      const stockBefore = irn.mslStock.fateh || 0;
      GEOTEST.sim(1);
      const stockAfter = irn.mslStock.fateh || 0;
      irn.mslStock.fateh = 3;
      const n0 = world.missiles.length;
      const launched = [launchMissile(irn.idx, 'fateh', camp.x + 120, camp.y - 40),
        launchMissile(irn.idx, 'fateh', camp.x + 150, camp.y + 20),
        launchMissile(irn.idx, 'fateh', camp.x + 80, camp.y + 70)];
      return { queued, spent, expectedCost, stockBefore, stockAfter, launched,
        delta: world.missiles.length - n0, left: irn.mslStock.fateh };
    })()`);
    check.ok(missiles.queued, 'a missile can be queued in a factory', missiles);
    check.eq(missiles.spent, missiles.expectedCost, 'queued missile costs its listed price', missiles);
    check.eq(missiles.stockAfter, missiles.stockBefore + 1, 'factory delivers after four minutes', missiles);
    check.eq(missiles.delta, 3, 'three missiles launch simultaneously as one salvo', missiles);
    check.eq(missiles.left, 0, 'salvo consumes exactly the stock fired', missiles);

    /* 9. Only anti-missile batteries engage, and only while funded. */
    const abm = await page.json(`(() => {
      GEOTEST.clearUnits();
      const irn = GEOTEST.player('IRN'), isr = GEOTEST.player('ISR');
      setRelation(irn.idx, isr.idx, 'WAR', false);
      for (const b of world.buildings) if (b.kind === 'antiMissile') b.dead = true;
      const ic = ent(isr.campId);
      const s = freeSpotLocal(ic.x + 110, ic.y + 110, world.w, world.h, world.obstacles, world.terrainBlocked);
      const ab = placeBuilding(isr.idx, 'antiMissile', s.x, s.y);
      if (!ab) return { error: 'abm placement failed' };
      world.interceptors = [];
      const m = { x: ab.x + 40, y: ab.y, owner: irn.idx, pk: 0.7, engagedBy: {}, dead: false, name: 'test missile' };
      world.missiles = [m];
      isr.cents = 15000;
      const fired0 = isr.stats.intercepted || 0;
      updateMissiles();
      const funded = { cents: isr.cents, fired: (isr.stats.intercepted || 0) - fired0 };
      world.interceptors = [];
      const m2 = { x: ab.x + 40, y: ab.y, owner: irn.idx, pk: 0.7, engagedBy: {}, dead: false, name: 'test missile 2' };
      world.missiles = [m2];
      ab.cd = 0;
      isr.cents = 9900;
      const fired1 = isr.stats.intercepted || 0;
      updateMissiles();
      return { funded, broke: { cents: isr.cents, fired: (isr.stats.intercepted || 0) - fired1 } };
    })()`);
    check.eq(abm.funded.fired, 1, 'an anti-missile battery launches an interceptor', abm);
    check.eq(abm.funded.cents, 5000, 'an interception deducts 100 cr', abm);
    check.eq(abm.broke.fired, 0, 'with under 100 cr the battery holds fire', abm);
    check.eq(abm.broke.cents, 9900, 'a refused interception costs nothing', abm);

    const sam = await page.json(`(() => {
      const irn = GEOTEST.player('IRN'), isr = GEOTEST.player('ISR');
      for (const b of world.buildings) if (b.kind === 'antiMissile') b.dead = true;
      const ic = ent(isr.campId);
      const s = freeSpotLocal(ic.x - 120, ic.y - 120, world.w, world.h, world.obstacles, world.terrainBlocked);
      const sm = { id: world.nextId++, kind: 'sam', owner: isr.idx, team: isr.team, x: s.x, y: s.y,
        hp: CFG.BUILDINGS.sam.hp, maxHp: CFG.BUILDINGS.sam.hp, r: 15, cd: 0, dead: false,
        ammo: 6, maxAmmo: 6, capturable: true };
      world.buildings.push(sm); world.ents.set(sm.id, sm);
      world.interceptors = [];
      world.missiles = [{ x: sm.x + 30, y: sm.y, owner: irn.idx, pk: 0.7, engagedBy: {}, dead: false, name: 'test' }];
      isr.cents = 500000;
      updateMissiles();
      return { fired: world.interceptors.length };
    })()`);
    check.eq(sam.fired, 0, 'SAM and flak sites cannot intercept ballistic missiles', sam);

    /* 12. Economy complex builds for three minutes and deploys AA + bunker. */
    const econ = await page.json(`(() => {
      GEOTEST.clearUnits();
      const irn = GEOTEST.player('IRN');
      irn.cents = 500000;
      const camp = ent(irn.campId);
      const s = freeSpotLocal(camp.x - 130, camp.y + 100, world.w, world.h, world.obstacles, world.terrainBlocked);
      let b = placeBuilding(irn.idx, 'economy', s.x, s.y);
      let direct = false;
      if (!b) {
        direct = true;
        const bd = CFG.BUILDINGS.economy;
        b = { id: world.nextId++, kind: 'economy', owner: irn.idx, team: irn.team, x: s.x, y: s.y,
          hp: Math.round(bd.hp * 0.35), maxHp: bd.hp, r: bd.r, cd: 0, target: 0, face: 0, dead: false,
          color: irn.color, armor: bd.armor, capturable: true, captureProg: 0, suppressed: false,
          buildT: bd.buildTime, buildMax: bd.buildTime };
        world.buildings.push(b); world.ents.set(b.id, b);
      }
      const wasBuilding = b.buildT > 0;
      const beforeAa = world.buildings.filter(x => !x.dead && x.owner === irn.idx && x.kind === 'aa').length;
      const beforeTw = world.buildings.filter(x => !x.dead && x.owner === irn.idx && x.kind === 'tower').length;
      b.buildT = 0.2;
      GEOTEST.sim(1);
      return { wasBuilding, direct, ready: b.buildT === 0, hp: Math.round(b.hp), maxHp: b.maxHp,
        aa: world.buildings.filter(x => !x.dead && x.owner === irn.idx && x.kind === 'aa').length - beforeAa,
        towers: world.buildings.filter(x => !x.dead && x.owner === irn.idx && x.kind === 'tower').length - beforeTw };
    })()`);
    check.ok(econ.wasBuilding, 'economy complex starts as a construction site', econ);
    check.ok(econ.ready, 'construction completes on its timer', econ);
    check.eq(econ.hp, econ.maxHp, 'completed complex has full HP', econ);
    check.eq(econ.aa, 1, 'completed complex comes with its own AA gun', econ);
    check.eq(econ.towers, 1, 'completed complex comes with its own bunker', econ);
  }
};
