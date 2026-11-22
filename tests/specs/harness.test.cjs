/* Harness smoke test: proves the deterministic boot, sim stepping and metrics
 * agree with each other before the other specs trust them. */
'use strict';

module.exports = {
  name: 'harness/smoke',
  timeoutMs: 120000,
  async run({ page, check, seed }) {
    const boot = await page.json('GEOTEST.boot({ mode: "real", diff: "normal", human: "ISR", countries: ["ISR","IRN"], seed: ' + seed + ' })');
    check.eq(boot.mode, 'real', 'boots a Real-mode duel');
    check.eq(boot.countries.length, 2, 'two players');
    check.eq(boot.humanIdx, 0, 'Israel is the human seat');

    const before = await page.json('GEOTEST.summary()');
    check.eq(before.time, 0, 'match clock starts at zero');
    check.eq(before.players.length, 2, 'summary reports both sides');
    check.ok(before.players[0].income > 0, 'Israel has positive income', before.players[0].income);

    const run1 = await page.json('GEOTEST.sim(30)');
    check.near(run1.time, 30, 0.6, '30 s of game time elapse');

    /* Determinism: the same seed, booted again, must reproduce the same state. */
    const a = await page.json('GEOTEST.summary()');
    await page.json('GEOTEST.boot({ mode: "real", diff: "normal", human: "ISR", countries: ["ISR","IRN"], seed: ' + seed + ' })');
    await page.json('GEOTEST.sim(30)');
    const b = await page.json('GEOTEST.summary()');
    check.eq(a.players[0].coins, b.players[0].coins, 'same seed reproduces the treasury');
    check.eq(a.players[0].units, b.players[0].units, 'same seed reproduces the army size');
    check.eq(a.players[0].cities, b.players[0].cities, 'same seed reproduces the city count');
    check.note('deterministic replay verified at seed ' + seed);
  }
};
