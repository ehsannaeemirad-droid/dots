# Skirmish Command Layer — Implementation Report

Commit: `0afc1e2` (pushed to `origin/main`)

## Fully implemented and tested

- **Five national advisors** (`Economic`, `Military`, `Air Force`, `Diplomatic`, `Intelligence`) with `Off / Suggest / Auto`, per-advisor budget, cash reserve, recommendations, approval, action log, attributed spending, and a working HUD panel.
- **Functional advisor automation**: economic complexes, bunkers/AA, aircraft orders, airbases and diplomacy are executed through the real placement/queue/diplomacy code, not decorative buttons. Budget caps, reserve floors and duplicate-construction guards are enforced.
- **Oil-field economy**: authored `ME_OIL` fields are assigned per country with distinct counts and yields (24–40 cr/min). Skirmish Economic Complexes cost 1400 cr, take 360 s, have 2400 HP, are restricted to owned oil fields, allow one complex per field, and deploy an AA gun plus bunker. Income follows the field's yield.
- **Ground vehicle classes**: Assault Tank, Tank Destroyer, IFV and APC have distinct HP, armour, range, damage and cost profiles; a `td` damage row and a `heavy` armour class give ATGMs and tank destroyers real specialisation. IFV/APC loading and unloading is implemented through `LOAD`/`UNLOAD` and tested.
- **Aircraft readiness**: READY / ON MISSION / REARMING / REPAIRING states, automatic rearming and repair at base, and relocation to a surviving airbase when the home base is destroyed; airframes are lost with a logged reason when no base remains.
- **Diplomacy**: NAP, defensive/military alliance, trade, ceasefire and mutual-enemy agreements; duration/expiry, score/credibility consequences, AI proposal acceptance, AI pacts/ceasefires, and UI buttons for pacts and betrayal through war declaration.
- **Doctrines**: Air, Ground, Missile, Defence, Economy and Balanced; setup selector, in-match switch with a 250 cr transition cost, cost modifiers, build-mix effects and AI doctrine assignment.
- **AI personalities**: Aggressive, Expansionist, Defensive, Economic and Opportunistic mappings with tempo and diplomacy biases, fully exercised in a 19-country FFA test.
- **Skirmish diplomacy is no longer an automatic world war**: only 1v1 and authored regional rivalries begin at war; initial pacts exist and AI diplomacy evolves them.
- **Real mode isolation**: Real mode keeps its 400 cr economy price, 180 s construction, original HP/rules, its own relation matrix, and no skirmish advisor/oil-field layer.

## Test evidence

`node tests/run.cjs` — **14/14 specs, 0 failed, 286 checks, 153.4 s**.

New `tests/specs/skirmish.test.cjs` contributes **62 checks** covering oil fields and yields, off-field refusal, complex cost/time/HP/AA+bunker, all five advisor modes and budgets, no duplicate construction, five advisor UIs, vehicle roles, transport load/unload, aircraft rearm/repair/relocation, agreements and betrayal, doctrines and transition cost, a 19-country FFA, and Real-mode isolation.

## Implemented but not fully tested / limitations

- Advisor templates are rule-based rather than long-horizon planners; they react to current state every 2.5 s.
- Intelligence reports only fog-visible contacts; enemy missile stockpiles remain deliberately unknown.
- AI uses the new vehicle classes through doctrine build mixes, but does not conduct multi-vehicle combined-arms manoeuvres.
- Agreement "military alliance" and "mutual enemy" have data/effects and UI entry points, but no separate coalition-war planner.
- Aircraft readiness is derived per tick and has no fuel or maintenance-crew subsystem (intentionally avoided as micromanagement).

## Not done

- The requested 30/60/120-minute comparative economic simulations and multi-match winner records were **not** run. The suite covers a 10-minute economy stability run, a 120-second 19-country FFA and focused system tests, not a full strategic balance study.
- No visual screenshot review of the new panels was performed; UI behavior is verified through DOM interaction in the headless test harness.
