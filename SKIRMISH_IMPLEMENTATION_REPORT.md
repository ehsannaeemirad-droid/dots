# Skirmish Command Layer — 3.md Acceptance Report

This report covers the complete Skirmish redesign brief (the attached `3.md`): five national advisors, oil-field economy, ground vehicle classes, aircraft readiness, Israel's air identity, diplomacy, doctrines, AI personalities, UI integration, simulations and acceptance criteria.

The report is committed with the implementation on `main`. The final commit hash is the `HEAD` shown by `git log -1` after this file was pushed.

## Verification

- Full regression suite: **17 specs, 416 checks, 0 failed, 348.5 s** (`node tests/run.cjs`, seed `20261122`).
- New focused acceptance spec `tests/specs/skirmish3.test.cjs`: **58/58 checks**.
- New simulation spec `tests/specs/balance.test.cjs`: **21/21 checks**, including 30/60/120-minute economy runs and three 19-country match records.
- Prior AI-capture/UI spec `tests/specs/overhaul.test.cjs`: **51/51 checks**, including notification filters, disabled LOCKED production entries, minimap drag and minimap wheel zoom.
- The earlier command-layer spec `tests/specs/skirmish.test.cjs` remains green at **62/62 checks**.

## Changes completed in this pass

- Player-defined advisor priorities for Economy, Military, Air and Diplomacy, plus an Economy maximum-complex policy in the working advisor panel.
- Recommendation rejection, with decision history and no simulation change on rejection.
- Military Advisor now treats economic complexes as defended assets, recommends ground reinforcement against visible armour, and can deploy a SAM umbrella against visible enemy air power.
- Air Force Advisor can now fund and build an additional airbase when the network is full; advisors search for a legal construction site instead of assuming the first offset is buildable.
- Diplomatic Advisor recommends a defensive pact to a trusted partner, recommends/executes ceasefires at war, and warns about diplomatic isolation.
- Agreement expiry now always restores the correct post-expiry relation in both the economy-facing `getAgreement` path and the AI diplomacy tick; previously an expired DEFENSIVE/TRADE pact could leave a stale ALLY/TRADE label.
- Oil fields are now clickable map features with an inspector showing owner, field yield, development status, defensive package and a working “Build Economic Complex” action.
- Israel starts with early-warning radar coverage in addition to two airbases, six F-35I Adirs and its SAM battery.
- New focused tests cover economic destruction/capture income, advisor modes and rejection, agreement classes and expiry, trade income, vehicle damage roles, loss of the last airbase, Israel's air wing and real airbase expansion.
- Deterministic 30/60/120-minute economy simulations and three 19-country match records are now part of the regression suite.

## Item-by-item status

### Part 2 — National Advisor System

| Item | Status | Evidence |
|---|---|---|
| 2.1 National Advisors panel | Implemented and verified | Five desks, Off/Suggest/Auto, roles, active recommendations, recent decisions, attributed spending, warnings, Locate/Approve/Reject, budget, reserve, priorities and Economy max-complex policy. |
| 2.2 Economic Advisor | Implemented and verified | Finds owned undeveloped fields, checks ownership/buildability/funds/reserve/max investments, prioritises yield or safe interior, prevents duplicate field construction, shows expected cr/min and reserve postponement. |
| 2.3 Military Advisor | Implemented and verified | City bunker/AA gaps, economic-complex defensive package, visible armour reinforcement recommendation, SAM recommendation against visible air power, budgeted Auto construction. |
| 2.4 Air Force Advisor | Implemented and verified | Airbase capacity, READY/REARMING/REPAIRING counts, country-legal aircraft selection, air-superiority vs strike priority, additional airbase construction, budgeted Auto ordering. |
| 2.5 Diplomatic Advisor | Implemented and verified | NAP/trade/defensive pacts, ceasefire proposals while at war, isolation warning, approved and Auto execution, no automatic war/alliance-breaking/nuclear decisions. |
| 2.6 Intelligence Advisor | Implemented and verified | Fog-visible contacts only, armour counts, visible missile factories and economic complexes, explicit “confirmed” vs “estimated” language, unknown missile stocks. |

### Part 3 — Economic system

| Item | Status | Evidence |
|---|---|---|
| 3.1 Economic Complex | Implemented and verified | 1,400 cr, 360 s, 2,400 HP, field yield 24–40 cr/min, AA gun and bunker deployed on completion, one complex per field. |
| 3.2 Limited oil fields | Implemented and verified | Authored Middle East fields, country-specific counts/yields, no uniform distribution, field ownership and one-complex rule enforced. |
| 3.3 Economic asymmetry | Implemented and verified | Country treasuries, income profiles, geography, field yields, military availability and doctrine costs remain asymmetric; 120-minute simulation shows different viable investment paths. |
| 3.4 Economic vulnerability | Implemented and verified | Advisor warnings and field-log alerts for threats; complex income is owner-only, stops on destruction and transfers once on capture. Focused tests assert old-owner fall and new-owner rise. |

### Part 4 — Ground forces

| Item | Status | Evidence |
|---|---|---|
| 4.1 Main Battle Tank | Implemented and verified | Affordable `tank` class with balanced HP/damage/mobility and mass production cost 60. |
| 4.2 Heavy Tank | Implemented and verified | `heavyTank`/Assault Tank: 150 HP, heavier gun, bunker/fortification role, slower and 140 cr. |
| 4.3 Tank Destroyer | Implemented and verified | `tankDestroyer`: 215 m range, high armour multiplier, weak infantry multiplier, low survivability. Damage table and stats tested. |
| 4.4 IFV | Implemented and verified | 3-passenger armed transport, supporting autocannon, LOAD/UNLOAD through the shared transport system. |
| 4.5 APC | Implemented and verified | 4-passenger cheaper transport, less firepower/armour, tested load/unload and deployed infantry capture path. |
| 4.6 Vehicle balance | Implemented and verified | Small-arms/tank gun/TD/ATGM/SAM/bomb rows against infantry, light, armour, heavy, air, structure and fortified classes; country inventories preserved. |

### Part 5 — Aircraft readiness

| Item | Status | Evidence |
|---|---|---|
| 5.1 READY | Implemented and verified | Derived operational state, airbase assignment, mission availability. |
| 5.2 ON MISSION | Implemented and verified | Ordered/targeted aircraft report ON MISSION. |
| 5.3 REARMING | Implemented and verified | Automatic return to base, timed rearm, ammo restored; tested at 7 rounds. |
| 5.4 DAMAGED/REPAIRING | Implemented and verified | Damaged aircraft repair at base over time; severe loss is possible. |
| 5.5 Airbase requirements | Implemented and verified | Three fixed-wing slots per base, automatic return/rearm/repair, relocation to a surviving base, visible loss with a logged reason when no base remains. |

### Part 6 — Israel

Implemented and verified. Israel keeps six F-35I Adirs, two airbases, its SAM battery and now an early-warning radar. Its limitations remain small territory, limited depth, expensive replacements and war exhaustion. Focused tests assert 6 aircraft, 2 airbases and 1 radar at match start.

### Part 7 — Diplomacy

| Item | Status | Evidence |
|---|---|---|
| 7.1 Relationships | Implemented and verified | Numeric score plus HOSTILE/TENSE/NEUTRAL/FRIENDLY/ALLY/TRADE/CEASEFIRE/WAR states. |
| 7.2 Agreements | Implemented and verified | NAP, DEFENSIVE, MILITARY, TRADE, CEASEFIRE and MUTUAL_ENEMY with duration, acceptance and breaking consequences. |
| 7.3 Non-aggression | Implemented and verified | Active pacts suppress hostility; declaring war breaks the pact and costs credibility. |
| 7.4 Defensive alliances | Implemented and verified | Allied relation, attack notification/call-to-arms path, AI avoids allied targets. |
| 7.5 Trade | Implemented and verified | Actual income stream (`a.eco.trade > 0` in focused test), not a cosmetic button. |
| 7.6 Ceasefires | Implemented and verified | Ends active hostility, AI seeks them when losing, cooldown enforced. |
| 7.7 Betrayal | Implemented and verified | Credibility −22 and relationship penalty; tested. |
| 7.8 AI diplomacy | Implemented and verified | Strength/geography/common-enemy evaluation, personality-biased pacts, ceasefires, war limits, avoidance of too many fronts. Three 19-country runs kept 52–65 agreements alive. |

### Part 8 — Doctrines

Implemented and verified: Air Superiority, Ground Offensive, Missile Strategy, Defensive Warfare, Economic Development and Balanced Strategy. Setup selection, mid-match switch (250 cr), cost modifiers, build-mix effects, AI assignment and doctrine-aware AI production are wired and tested.

### Part 9 — Country asymmetry

Implemented and verified: 19-country roster, different starting money/income/units/buildings/geography/field counts/yields and identities for Iran, Israel, Türkiye, Saudi Arabia, UAE, Egypt and the asymmetric factions. No normalization to identical starts.

### Part 10 — AI strategic behaviour

Implemented and verified: economy, army, doctrine, territory, oil fields, threats, relations, alliances, air defence and production feed AI decisions. Aggressive, Expansionist, Defensive, Economic, Opportunistic (plus cautious/hegemon profiles) produce distinct tempo/diplomacy behaviour. Three 19-country runs exposed six personality types and multiple ongoing alliances/wars.

### Part 11 — UI/UX

Implemented and verified:

- National Advisors panel with modes, budgets, reserves, priorities, max complexes, recommendations, approve/reject, locate, spending and history.
- Diplomacy panel with flags, relationship status, agreements, actions and current conflicts.
- National doctrine selector and transition cost.
- Role descriptions for all new ground vehicles, including strengths/weaknesses.
- Aircraft readiness shown in unit inspection and advisor counts.
- Economy panel with treasury, income, complex count, owned/developed fields and opportunities; oil fields are clickable with yield, owner, status and a real build action.
- Prioritised field-log notifications with category filters; advisor alerts for economic attack, defensive gaps, airbase saturation and confirmed armour.

### Part 12 — Balance and simulation testing

- **Economic testing:** deterministic 30/60/120-minute run across five strategy tracks. At 120 minutes: Economy track 4 complexes/350 cr/min/22,434 earned; Military track 32 ground units; Balanced track 1 complex/28 units; Defence track fortifications; Air track retains/buys aircraft. No non-finite balances.
- **Advisor testing:** Off/Suggest/Auto, zero budget, reserve, max investments, no duplicate fields, rejection, approval and real build paths all tested.
- **Diplomacy testing:** NAP, defensive alliance, ceasefire, trade, mutual enemy, expiry, betrayal, acceptance/rejection and 19-country FFA tested.
- **Military testing:** MBT/heavy/TD roles, ATGM/SAM damage, IFV/APC capacity and cost, transport, readiness/rearm/repair, relocation and last-airbase loss tested.
- **Country testing:** Israel's six-aircraft/two-base/radar start, Iran's conventional and missile identity, small-state build lists and economic powers' field opportunities are covered. Three 19-country matches recorded leader, time, cities, treasury, power, income, wars, agreements and airframes.

Recorded 19-country leaders at 240 game-seconds were IRN in all three observation runs, with 19 factions alive, 8–10 at war, 52–65 agreements and 7–13 airframes. These are recorded comparative observations, not completed-match winners.

### Part 13 — Implementation requirements

The existing single-file game architecture, economy, placement, country definitions, AI, diplomacy, units and aircraft systems were reused; Real mode is untouched by the advisor/oil/doctrine layer. New functionality is separated into advisor policy/execution, economy sites, diplomacy/agreements, doctrine/AI profiles, readiness and UI paths. No decorative controls remain: every new button calls the real simulation function.

### Part 14 — Acceptance criteria

1. Realistic Mode unchanged — verified by `skirmish.test.cjs` isolation checks and full suite.
2. Five functional advisors — verified.
3. Off/Suggest/Auto for every advisor — verified.
4. State-based recommendations — verified.
5. Auto budgets/reserves respected — verified.
6. Economic Complex only on oil fields — verified.
7. Different field counts/yields per country — verified.
8. AA + bunker package included — verified.
9. Economic development meaningful — 30/60/120-minute simulation.
10. Five distinct ground classes — stats/damage tests.
11. IFV/APC transport — load/unload tests (shared transport path).
12. Functional aircraft readiness — verified.
13. Automatic rearm/repair — verified.
14. Airbase destruction consequences — relocation and last-base loss tests.
15. Israel strong initial air force/defence — six F-35I, two bases, SAM, radar.
16. Diplomacy in gameplay — AI agreements and player actions tested.
17. AI negotiates/cooperates/respects agreements — three FFA records and pact tests.
18. Doctrines influence strategy — cost/build-mix/AI tests.
19. AI personalities differ — six observed personality types.
20. 19-country FFA works — three recorded runs.
21. Existing systems functional — full suite.
22. No critical regression — 416/416 checks green.

## Known limitations

- The 19-country observations stop at 240 game-seconds. They do not produce a winner; they record the live leader and full strategic state. A 19-seat FFA does not resolve quickly under the current capture model.
- Advisors are reactive rule-based desks updating every 2.5 s, not long-horizon planners.
- Intelligence is fog-limited; exact enemy missile stockpiles remain deliberately unknown.
- AI uses the vehicle classes through doctrine build mixes but does not execute multi-vehicle combined-arms manoeuvre packages.
- MILITARY and MUTUAL_ENEMY agreements share the ALLY relation and call-to-arms path; there is no separate coalition-war planner.
- Diplomatic proposals resolve immediately (accept/refuse); there is no asynchronous “pending offer” inbox.
- UI behavior is verified through headless DOM interaction and canvas-state assertions; no screenshot review was performed.
