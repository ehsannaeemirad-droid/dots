/* In-page driver for the GeoDots test suite.
 *
 * Injected after the game has loaded. It only uses the game's own public
 * functions (startMatch, createWorld, stepSim, queueUnit, …) — the same code
 * paths a player exercises — plus deterministic seeding so a failure can be
 * reproduced from the printed seed.
 */
window.GEOTEST = (() => {
  const state = { seed: 1, base: 0, samples: null };

  function seedRandom(seed) {
    state.seed = seed >>> 0;
    let a = state.seed;
    Math.random = function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    /* startMatch derives the map seed from Date.now() ^ Math.random(); pinning
       the clock makes the whole match reproducible. */
    state.realNow = state.realNow || Date.now;
    Date.now = () => 1700000000000;
  }

  function codes(list) { return list.map(c => typeof c === 'string' ? c : c.country); }

  const api = {
    /* boot({mode, diff, human, countries, teams, seed, allAI})
       Returns a plain description so the caller can assert on it. */
    boot(o) {
      o = o || {};
      const countries = codes(o.countries || ['ISR', 'IRN']);
      const human = o.human || countries[0];
      const mode = o.mode || 'real';
      seedRandom(o.seed == null ? 1 : o.seed);

      app.gameMode = mode;
      app.difficulty = o.diff || 'normal';
      if (app.bbTab === 'aid') app.bbTab = 'army';
      app.lobby = countries.map((code, i) => ({
        human: code === human,
        country: code,
        team: o.teams ? o.teams[i] : i
      }));
      app.myCountry = human;

      world = null;
      startMatch();
      const count = document.getElementById('countScr');
      if (count) count.classList.add('hidden');
      app.state = 'play';
      app.paused = true;
      world.time = 0;
      world.tick = 0;

      if (o.allAI) {
        /* A human seat is created without an AI controller, so an all-AI run
           must attach one; otherwise that side sits inert for the whole match. */
        for (const p of world.players) {
          p.isHuman = false;
          if (!p.aiCtl) p.aiCtl = makeAI(p.idx, app.difficulty || 'normal');
        }
      }
      /* Recompute derived goals for whoever just changed hands. */
      for (const p of world.players) { p.objs = objectivesFor(p); p.objDone = 0; }
      updateEconomy();
      return {
        mode: world.mode, diff: o.diff || 'normal', seed: state.seed,
        countries: world.players.map(p => p.country),
        humanIdx: humanPlayer() ? humanPlayer().idx : -1,
        cities: (world.cities || []).length,
        buildings: world.buildings.filter(b => !b.dead).length
      };
    },

    /* Step the simulation deterministically for `seconds` of game time.
       Returns steps actually executed and whether the match ended. */
    sim(seconds, opts) {
      opts = opts || {};
      const maxSteps = Math.ceil(seconds / CFG.DT) + 5;
      const target = world.time + seconds;
      let steps = 0;
      while (world.time < target && !world.over && steps < maxSteps) {
        stepSim();
        steps++;
        if (opts.each && steps % (opts.each || 1) === 0) opts.each(steps);
      }
      return { steps, time: +world.time.toFixed(2), over: !!world.over, winner: world.winnerTeam };
    },

    /* Convenience: run until a predicate is true or the budget expires. */
    until(fn, seconds, opts) {
      const maxSteps = Math.ceil(seconds / CFG.DT) + 5;
      const t0 = world.time;
      let steps = 0;
      while (!fn() && !world.over && steps < maxSteps) {
        stepSim(); steps++;
        if (opts && opts.each && steps % (opts.each || 1) === 0) opts.each(steps);
      }
      return { steps, elapsed: +(world.time - t0).toFixed(2), met: !!fn(), over: !!world.over, time: +world.time.toFixed(2) };
    },

    player(code) {
      return world.players.find(p => p.country === code) || null;
    },

    city(name) {
      return (world.cities || []).find(c => c.name === name) || null;
    },

    citiesOf(code) {
      const p = api.player(code);
      if (!p) return [];
      return (world.cities || []).filter(c => c.owner === p.idx).map(c => ({
        name: c.name, capital: !!c.capital, pop: c.pop || 0,
        buildings: c.buildings ? c.buildings.filter(b => !b.dead).length : null
      }));
    },

    unitsOf(code, type) {
      const p = api.player(code);
      if (!p) return [];
      return world.units.filter(u => !u.dead && u.owner === p.idx && (!type || u.type === type));
    },

    /* Everything a match report needs, for every player. */
    summary() {
      const out = [];
      for (const p of world.players) {
        const units = world.units.filter(u => !u.dead && u.owner === p.idx);
        const byType = {};
        for (const u of units) byType[u.type] = (byType[u.type] || 0) + 1;
        const buildings = world.buildings.filter(b => !b.dead && b.owner === p.idx);
        const bKind = {};
        for (const b of buildings) bKind[b.kind] = (bKind[b.kind] || 0) + 1;
        const lost = {};
        let lostTotal = 0;
        for (const k in (p.stats.lost || {})) { lost[k] = p.stats.lost[k]; lostTotal += p.stats.lost[k]; }
        const built = {};
        let builtTotal = 0;
        for (const k in (p.stats.built || {})) { built[k] = p.stats.built[k]; builtTotal += p.stats.built[k]; }
        const idle = units.filter(u => u.owner === p.idx && !u.target &&
          (!u.order || u.order.k === 'guard' || u.order.k === 'hold') && !u.path).length;
        out.push({
          code: p.country, name: p.name, alive: p.alive, team: p.team,
          coins: +(p.cents / 100).toFixed(1),
          income: p.incomeCpt == null ? null : +p.incomeCpt.toFixed(2),
          cities: (world.cities || []).filter(c => c.owner === p.idx).length,
          buildings: buildings.length, buildingKinds: bKind,
          units: units.length, byType, power: Math.round(units.reduce((s, u) => s + u.hp, 0)),
          idle,
          kills: p.stats.kills || 0, lost, lostTotal, built, builtTotal,
          missiles: p.stats.missiles || 0, aidReceived: p.stats.aidReceived || 0,
          earned: Math.round(p.stats.earned / 100),
          spent: Math.round(p.stats.spent / 100),
          nukes: p.nukes || 0, objectives: p.objDone || 0,
          warExhaustion: p.warExhaustion == null ? null : +p.warExhaustion.toFixed(2),
          siegeTarget: p.aiCtl ? p.aiCtl.siegeId || 0 : null
        });
      }
      return {
        time: +world.time.toFixed(1), over: !!world.over, winner: world.winnerTeam,
        winReason: world.winReason || null, mode: world.mode, diff: world.difficulty,
        nukeUsed: !!world.nukeUsed, players: out
      };
    },

    /* --- capture laboratory ------------------------------------------------ */

    /* Spawn `count` attackers of `type` `dist` pixels from a building and order
       them to attack-move onto it. Tracks: first arrival, progress start and
       ownership change, plus the four requested timings. */
    captureLab(o) {
      const p = api.player(o.country || 'IRN');
      /* Real-mode capture is a property of the city object, not of a building. */
      const c = api.city(o.city);
      if (!p || !c || c.razed) return { error: 'bad city or country' };
      const dist = o.dist == null ? 30 : o.dist;
      const baseAng = o.angle == null ? 0.7 : o.angle;
      /* Place on legal ground at roughly the requested ring: a raw coordinate
         can land in water or a mountain, and such a unit is removed on spawn. */
      const placeNear = (want, ang) => {
        for (let r = want; r <= want + 200; r += 15) {
          for (let k = 0; k < 12; k++) {
            const a = ang + k * Math.PI / 6;
            const s = freeSpotLocal(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r,
              world.w, world.h, world.obstacles, world.terrainBlocked);
            if (!insideObstacle(s.x, s.y, 6) && !(world.terrainBlocked && world.terrainBlocked(s.x, s.y))) return s;
          }
        }
        return { x: c.x + want, y: c.y };
      };
      const spawned = [], spawnedObjs = [];
      const type = o.type || 'soldier';
      for (let i = 0; i < (o.count || 1); i++) {
        const s = placeNear(dist, baseAng + i * (Math.PI * 2 / Math.max(1, o.count || 1)));
        const u = newUnit(p.idx, type, s.x, s.y);
        if (!u) return { error: 'cannot spawn ' + type };
        world.ents.set(u.id, u); if (world.units.indexOf(u) < 0) world.units.push(u);
        u.order = { k: 'amove', x: c.x, y: c.y };
        u.path = null; u.target = 0;
        spawned.push(u.id); spawnedObjs.push(u);
      }
      if (c.owner < 0) return { error: 'city has no owner' };
      const ownerP = world.players[c.owner];
      if (ownerP && ownerP.idx !== p.idx) setRelation(p.idx, ownerP.idx, 'WAR', false);
      if (o.defenders && ownerP) {
        for (let i = 0; i < o.defenders; i++) {
          const s = placeNear(12, 1.1 + i * 1.3);
          const u = newUnit(ownerP.idx, o.defenderType || 'soldier', s.x, s.y);
          if (!u) break;
          world.ents.set(u.id, u); if (world.units.indexOf(u) < 0) world.units.push(u);
          u.order = { k: 'guard', x: c.x, y: c.y };
        }
      }
      const startOwner = c.owner;
      const t0 = world.time;
      const RADIUS = 45;
      let tReach = null, tProgress = null, tDone = null;
      let maxProgress = 0;
      const budget = o.budget == null ? 400 : o.budget;
      const maxSteps = Math.ceil(budget / CFG.DT);
      const inRegion = () => spawned.filter(id => {
        const u = ent(id);
        return u && !u.dead && dist2(u.x, u.y, c.x, c.y) <= RADIUS * RADIUS;
      }).length;
      const codeOf = i => (i >= 0 && world.players[i]) ? world.players[i].country : 'neutral';
      let reinforced = null;
      for (let i = 0; i < maxSteps && !world.over; i++) {
        stepSim();
        if (tReach == null && inRegion() > 0) tReach = +(world.time - t0).toFixed(1);
        const prog = c.captureT || 0;
        if (tProgress == null && prog > 0.02) tProgress = +(world.time - t0).toFixed(1);
        /* Reinforcements: arrive once the siege has actually started. */
        if (o.reinforce && tProgress != null && !reinforced) {
          reinforced = { at: +(world.time - t0).toFixed(1), progress: +prog.toFixed(2), added: o.reinforce.add };
          for (let k = 0; k < o.reinforce.add; k++) {
            const u = newUnit(p.idx, o.type || 'soldier', c.x + 55 + k * 5, c.y + 55);
            if (!u) break;
            world.ents.set(u.id, u); if (world.units.indexOf(u) < 0) world.units.push(u);
            u.order = { k: 'amove', x: c.x, y: c.y };
            spawned.push(u.id);
          }
        }
        if (prog > maxProgress) maxProgress = prog;
        if (c.owner !== startOwner) { tDone = +(world.time - t0).toFixed(1); break; }
      }
      return {
        target: { city: c.name, pop: c.pop || 0, capital: !!c.capital,
          class: c.capital ? 'capital' : ((c.pop || 0) >= 6 ? 'major' : 'minor') },
        ownerBefore: startOwner, ownerAfter: c.owner,
        ownerBeforeCode: codeOf(startOwner), ownerAfterCode: codeOf(c.owner),
        count: o.count || 1, type, defenders: o.defenders || 0, dist,
        tReach, tProgress, progressTime: tProgress != null && tDone != null ? +(tDone - tProgress).toFixed(1) : null,
        tDone, total: tDone, reinforced,
        maxProgress: +maxProgress.toFixed(1),
        progressNow: +(c.captureT || 0).toFixed(1),
        attackersInRegion: inRegion(), alive: spawnedObjs.filter(u => !u.dead).length,
        defendersAlive: world.units.filter(u => !u.dead && u.owner !== p.idx && dist2(u.x, u.y, c.x, c.y) < 90 * 90).length
      };
    },

    /* Remove every unit on the map (keeps the economy/buildings intact). */
    clearUnits() {
      for (const u of world.units) { u.dead = true; world.ents.delete(u.id); }
      world.units = [];
    },

    /* Order an existing player's whole army at a point, as a player would. */
    sendArmy(code, x, y) {
      const p = api.player(code);
      if (!p) return 0;
      let n = 0;
      for (const u of world.units) {
        if (u.dead || u.owner !== p.idx || u.isWorker) continue;
        u.order = { k: 'attack', x, y, id: 0 }; u.path = null; u.target = 0; n++;
      }
      return n;
    },

    /* Queue one unit of `type` and return whether it was accepted. */
    buy(code, type) {
      const p = api.player(code);
      return p ? queueUnit(p.idx, type) : false;
    },

    /* Force the treasury to an exact coin value (economy experiments). */
    setCoins(code, coins) {
      const p = api.player(code);
      if (!p) return false;
      p.cents = Math.round(coins * 100);
      return true;
    },

    spawn(code, type, x, y) {
      const p = api.player(code);
      if (!p) return 0;
      const u = newUnit(p.idx, type, x, y);
      if (!u) return 0;
      world.ents.set(u.id, u); if (world.units.indexOf(u) < 0) world.units.push(u);
      return u.id;
    },

    /* Damage every unit/building in a radius (nuclear-blast measurement). */
    blastReport(x, y, r) {
      const units = world.units.filter(u => !u.dead && dist2(u.x, u.y, x, y) <= r * r);
      return { units: units.length, byOwner: units.reduce((m, u) => (m[u.owner] = (m[u.owner] || 0) + 1, m), {}) };
    },

    /* Snapshot of the economy breakdown as the HUD computes it. */
    eco(code) {
      const p = api.player(code);
      if (!p) return null;
      updateEconomy();
      return {
        code: p.country, coins: +(p.cents / 100).toFixed(2),
        income: p.incomeCpt == null ? null : +p.incomeCpt.toFixed(3),
        eco: JSON.parse(JSON.stringify(p.eco || {})),
        cityShare: p.cityShare == null ? null : +p.cityShare.toFixed(3),
        buildRate: p.buildRate == null ? null : +p.buildRate.toFixed(2),
        exhaustion: p.warExhaustion == null ? null : +p.warExhaustion.toFixed(2),
        earned: Math.round(p.stats.earned / 100), spent: Math.round(p.stats.spent / 100)
      };
    },

    world() { return world; },
    CFG() { return CFG; },
    seed() { return state.seed; }
  };
  return api;
})();
