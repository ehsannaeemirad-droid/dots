/* Ownership conversion: in skirmish the ground command post decides which
 * player owns a city, and city ownership drives city income. */
'use strict';

module.exports = {
  name: 'ownership/city-income',
  timeoutMs: 180000,
  async run({ page, check, seed }) {
    await page.eval(`GEOTEST.boot({ mode: 'classic', diff: 'Normal', human: 'IRN',
      countries: ['IRN','SAU','EGY'], seed: ${seed}, allAI: true })`);
    const base = await page.json(`(() => {
      const me = GEOTEST.player('IRN');
      const city = (world.cities || []).find(c => c.owner === me.idx);
      const post = world.buildings.find(b => !b.dead && (b.kind === 'camp' || b.kind === 'outpost')
        && b.owner === me.idx && cityForBuilding(b) === city);
      updateEconomy();
      return { mode: world.mode, city: city.name, cityOwnerCode: world.players[city.owner].country,
        postId: post && post.id, postKind: post && post.kind,
        out: +me.eco.out.toFixed(2), share: +me.cityShare.toFixed(3),
        changed: !!syncCityOwnersToGround() };
    })()`);
    check.eq(base.mode, 'classic', 'skirmish mode boots');
    check.eq(base.changed, false, 'an idle ownership sync changes nothing');
    check.ok(base.postId, 'the city has a ground command post', base);

    const taken = await page.json(`(() => {
      const me = GEOTEST.player('IRN');
      const foe = GEOTEST.player('SAU');
      const city = GEOTEST.city(${JSON.stringify(base.city)});
      const post = ent(${base.postId});
      if (!post) return { error: 'no post' };
      convertBuildingOwner(post, foe.idx);
      const changed = !!syncCityOwnersToGround();
      updateEconomy();
      return { changed, cityOwnerCode: world.players[city.owner].country,
        out: +me.eco.out.toFixed(2), share: +me.cityShare.toFixed(3) };
    })()`);
    if (taken.error) check.ok(false, 'ground post still exists for the capture test');
    else {
      check.eq(taken.changed, false, 'capture transfers the city immediately; the later sync has nothing left to do');
      check.eq(taken.cityOwnerCode, 'SAU', 'the city follows its command post');
      check.ok(taken.out < base.out, 'the former owner loses city income', { before: base.out, after: taken.out });
    }

    const back = await page.json(`(() => {
      const me = GEOTEST.player('IRN');
      const city = GEOTEST.city(${JSON.stringify(base.city)});
      const post = ent(${base.postId});
      if (!post) return { error: 'no post' };
      convertBuildingOwner(post, me.idx);
      syncCityOwnersToGround();
      updateEconomy();
      return { cityOwnerCode: world.players[city.owner].country, out: +me.eco.out.toFixed(2) };
    })()`);
    if (back.error) check.ok(false, 'command post survived for the retake test');
    else {
      check.eq(back.cityOwnerCode, 'IRN', 'the city returns with the post');
      check.near(back.out, base.out, 0.01, 'income returns exactly to its previous value');
    }

    const real = await page.json(`(() => {
      const saved = world.mode; world.mode = 'real';
      const changed = !!syncCityOwnersToGround();
      world.mode = saved;
      return changed;
    })()`);
    check.eq(real, false, 'the skirmish ground sync is inert in Real mode');
  }
};
