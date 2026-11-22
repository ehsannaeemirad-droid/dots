/* Difficulty: every declared knob exists and differs where it should, the AI
 * controller receives its own profile, and difficulty never changes income. */
'use strict';

module.exports = {
  name: 'difficulty/wired-knobs',
  timeoutMs: 180000,
  async run({ page, check, seed }) {
    const cfg = await page.json(`(() => {
      const keys = Object.keys(CFG.AI.DIFF);
      return { keys, easy: CFG.AI.DIFF.Easy, medium: CFG.AI.DIFF.Medium, hard: CFG.AI.DIFF.Hard };
    })()`);
    check.ok(cfg.keys.includes('Easy') && cfg.keys.includes('Medium') && cfg.keys.includes('Hard'), 'three difficulty profiles exist', cfg.keys);
    check.lt(cfg.hard.pushEvery, cfg.easy.pushEvery, 'Hard pushes more often than Easy', { hard: cfg.hard.pushEvery, easy: cfg.easy.pushEvery });
    check.lt(cfg.hard.react, cfg.easy.react, 'Hard reacts faster', { hard: cfg.hard.react, easy: cfg.easy.react });
    check.gt(cfg.hard.maxTowers, cfg.easy.maxTowers, 'Hard builds more static defences', { hard: cfg.hard.maxTowers, easy: cfg.easy.maxTowers });
    check.gt(cfg.hard.cap, cfg.easy.cap, 'Hard fields a larger army cap', { hard: cfg.hard.cap, easy: cfg.easy.cap });
    check.eq(cfg.easy.missile, 'none', 'Easy never fires missiles', cfg.easy.missile);
    check.eq(cfg.hard.nuke, true, 'Hard is allowed nuclear release');
    check.eq(cfg.easy.nuke, false, 'Easy is not', cfg.easy.nuke);
    check.eq(cfg.easy.harass, false, 'Easy does not raid behind the lines');
    check.eq(cfg.hard.harass, true, 'Hard does', cfg.hard.harass);
    check.eq(cfg.easy.focus, false, 'Easy does not focus the enemy capital');
    check.eq(cfg.hard.focus, true, 'Hard does', cfg.hard.focus);
    check.gt(cfg.easy.mistakeEvery, 0, 'Easy has an explicit hesitation cadence', cfg.easy.mistakeEvery);
    check.eq(cfg.hard.mistakeEvery, 0, 'Hard never hesitates', cfg.hard.mistakeEvery);

    const controllers = await page.json(`(() => {
      GEOTEST.boot({ mode: 'real', diff: 'Hard', human: 'ISR', countries: ['ISR','IRN'], seed: ${seed}, allAI: true });
      const a = world.players.map(p => ({ code: p.country, diff: p.aiCtl.diff, t: p.aiCtl.cfg.pushEvery, n: p.aiCtl.cfg.nuke }));
      GEOTEST.boot({ mode: 'real', diff: 'Easy', human: 'ISR', countries: ['ISR','IRN'], seed: ${seed}, allAI: true });
      const b = world.players.map(p => ({ code: p.country, diff: p.aiCtl.diff, t: p.aiCtl.cfg.pushEvery, n: p.aiCtl.cfg.nuke }));
      return { hard: a, easy: b };
    })()`);
    check.eq(controllers.hard.filter(p => p.diff !== 'Hard').length, 0, 'every Hard AI receives the Hard profile', controllers.hard);
    check.eq(controllers.easy.filter(p => p.diff !== 'Easy').length, 0, 'every Easy AI receives the Easy profile', controllers.easy);

    /* No hidden income multiplier: same country, same time, same income. */
    const incomes = await page.json(`(() => {
      const out = {};
      for (const d of ['Easy','Medium','Hard']) {
        GEOTEST.boot({ mode: 'real', diff: d, human: 'ISR', countries: ['ISR','IRN'], seed: ${seed}, allAI: true });
        updateEconomy();
        out[d] = +(GEOTEST.player('IRN').incomeCpt / 100).toFixed(2);
      }
      return out;
    })()`);
    check.eq(incomes.Easy, incomes.Hard, 'difficulty does not change income', incomes);
    check.eq(incomes.Medium, incomes.Hard, 'Medium and Hard earn the same', incomes);
  }
};
