/* Presentation layer: menu geometry, command bar, selection card, effect
 * quality persistence, and a clean console while the map animates.
 * These assert the UI shell only; simulation behaviour stays in its own specs. */
'use strict';

module.exports = {
  name: 'ui/command-surface',
  timeoutMs: 120000,
  async run({ page, check }) {
    /* The situation board must stay inside the viewport at laptop width. */
    const layout = await page.json(`(() => {
      const board = document.querySelector('.menu-board').getBoundingClientRect();
      const shell = document.querySelector('.menu-shell').getBoundingClientRect();
      return { boardRight: Math.round(board.right), shellRight: Math.round(shell.right), vw: innerWidth,
        scrollW: document.documentElement.scrollWidth };
    })()`);
    check.ok(layout.boardRight <= layout.vw + 1, 'situation board fits the viewport', JSON.stringify(layout));
    check.ok(layout.scrollW <= layout.vw + 1, 'menu has no horizontal overflow', layout.scrollW);

    await page.eval('GEOTEST.boot({mode:"real",diff:"Normal",human:"IRN",countries:["IRN","ISR"],seed:4})');
    await page.eval('for (const p of world.players) p.aiCtl = null; updateHud(); drawWorld();');
    const hud = await page.json(`(() => {
      const bar = document.getElementById('topbar');
      const r = bar.getBoundingClientRect();
      return { visible: !bar.classList.contains('hidden'), h: Math.round(r.height),
        coins: document.getElementById('hudCoins').textContent,
        army: document.getElementById('tbArmy').textContent,
        cities: document.getElementById('tbCities').textContent };
    })()`);
    check.ok(hud.visible, 'command bar is shown in a match');
    check.ok(hud.h >= 44, 'command bar keeps a usable height', hud.h);
    check.ok(hud.coins.length > 0 && hud.army.length > 0 && hud.cities.length > 0, 'command bar carries treasury, army and city strength');

    /* Selecting a real unit must render its type and strength in the card. */
    const sel = await page.json(`(() => {
      const p = world.players[0];
      const id = GEOTEST.spawn('IRN', 'tank', p.startX + 30, p.startY + 10);
      sel.units = [id]; sel.inspect = null; sel.bId = 0;
      updateHud();
      const card = document.getElementById('selinfo');
      return { text: card.textContent.replace(/\\s+/g, ' ').trim(), idle: card.classList.contains('idle'),
        hasIcon: !!card.querySelector('.si-icon svg'), hasBar: !!card.querySelector('.hp-bar i') };
    })()`);
    check.ok(!sel.idle, 'selection card is active when a unit is selected');
    check.ok(sel.text.includes('HP') || sel.text.includes('/'), 'selection card reports hit points', sel.text.slice(0, 90));
    check.ok(sel.hasIcon, 'selection card uses a vector unit symbol');
    check.ok(sel.hasBar, 'selection card shows an integrity bar');

    /* Effects quality is a real, persisted preference. */
    const fx = await page.json(`(() => {
      showScreen('settingsScr');
      const buttons = [...document.querySelectorAll('#setFx button')];
      const before = app.fxQuality;
      document.querySelector('#setFx button[data-fx="off"]').click();
      const off = app.fxQuality;
      const stored = JSON.parse(localStorage.getItem('geodots.prefs') || '{}').fx;
      document.querySelector('#setFx button[data-fx="high"]').click();
      return { buttons: buttons.length, before, off, stored, restored: app.fxQuality };
    })()`);
    check.eq(fx.buttons, 3, 'three battlefield-effect levels are offered');
    check.eq(fx.off, 'off', 'effects can be disabled');
    check.eq(fx.stored, 'off', 'effect choice is persisted');
    check.eq(fx.restored, 'high', 'effect choice can be restored');

    /* Animated map with effects on, then off, must throw nothing. */
    await page.eval(`(() => {
      showScreen('menuScr');
      app.state = 'play'; app.paused = false; app.fxQuality = 'high';
      GEOTEST.sim(12); drawWorld();
      app.fxQuality = 'off'; GEOTEST.sim(2); drawWorld();
      app.paused = true;
    })()`);
    const errors = page.logs.filter(l => l.startsWith('[EXCEPTION]') || l.startsWith('[log:error]'));
    check.eq(errors.length, 0, 'no JavaScript errors while rendering the command surface', errors.slice(0, 3).join(' | '));
  }
};
