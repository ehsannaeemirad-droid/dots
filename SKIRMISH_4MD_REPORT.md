# GeoDots — Skirmish 4.md Overhaul Report

Date: 2026-11-24  
Target: Skirmish mode (`world.mode === 'classic'`); Real mode left at its original scale and rules.

## A. Completed changes

### Diplomacy and relationships
- Central 0–100 relationship scale (`RELATION_BANDS`, `relationBand`, `SKIRMISH_RELATION_OVERRIDES`, `baseSkirmishScore`), with 50 as neutral and separate formal states (`WAR`, `CEASEFIRE`, `ALLY`, `TRADE`, `NEUTRAL`).
- Every Skirmish pair is seeded from the central table instead of defaulting to war/zero. Iran–Israel and Israel–PSE/HZB start at war; Iran–Saudi Arabia starts hostile but not at war. Opening pacts are explicit.
- State transitions now carry scores in both directions; ceasefire expiry returns to neutral rather than war, with a cooldown and score retained.
- Ceasefires last at least 600 s, refuse duplicates, require a war age before an AI asks, and penalise violations (agreement break, credibility loss, 300 s cooldown).
- Missile strikes call `noteSovereignAttack` before impact, so a neutral victim is identified from sovereignty/control even when no military building is at the impact point. They declare/escalate war, record `targetIdx`, notify defenders/allies, and apply damage.
- Impact classification distinguishes civilian city hits, military installations, and armed incursions; a strike on empty territory still escalates.
- Call-to-arms (`requestCallToArms`) evaluates relationship, alliance, force balance and current wars; acceptance creates a real war, a coalition record, and movement orders. Defensive assistance (`requestDefensiveAssistance`) sends real units to the capital.
- Diplomacy UI exposes formal state, score/100, active agreement time, transit rights, defensive help and call-to-arms. The menu description now matches actual Skirmish rules.

### National equipment and production
- Central national rosters (`SKIRMISH_GROUND`, `SKIRMISH_IMPORTED`, `skirmishBuildList`, `equipmentAvailability`, `importedSupplyCap`).
- `canBuildType`, `queueUnit`, `buyBlockedReason`, AI purchases and the ARMY build bar all use the roster. Iran cannot build the F-35; Israel can field its F-35I.
- Imported equipment is limited by supply tranches and trade/alliance partners; domestic equipment is not.
- Existing country starting economies and force lists remain the central source (`REAL_COUNTRY_DB` economy/build data).

### AI
- Personality profiles now drive real tempos and war thresholds (`AI_PERSONALITY_PROFILES`); Israel is a `hegemon`, not purely defensive.
- Strategic war initiation (`chooseWarTarget`) evaluates relationship, frontier distance, force ratio, target value, existing wars, and opportunities created by a target's other wars. All-AI matches now produce roughly 9–11 active belligerents instead of the four scripted opening wars.
- Strategic target scoring includes cities, capitals, airbases, missile factories, economic complexes, SAMs, radar, depots, mines and vulnerable structures; distance is normalised for the 3× world.
- Discounted/opportunistic targeting and victory-leader awareness (`world.victoryLeader`) are used by AI target selection.
- Persistent siege logic is retained and extended for suppressed objectives; AI assault units now focus the siege target (`u.assault`) instead of chasing every incidental target.
- Suppressed capturable installations are no longer shot forever: ground capture units inside the ring stop firing so the capture clock can complete.
- AI target knowledge uses discovered installations (`_seenBy`) rather than free perfect knowledge for non-city buildings; city seats remain public geography.
- AI border alerts issue real movement orders to the incursion.
- Offensive corps stage in a dispersed ring instead of stacking on the capital, so one ballistic strike cannot erase the reserve army.
- Target scoring prefers outer city seats over the 600-second capital, penalises the target's whole field army, and rejects seats that no ground formation can reach across the land mask.
- A committed siege survives unrelated war declarations, a single capital raider, and a ceasefire offer while the seat is suppressed. Reinforcements gather in groups instead of walking in one at a time.
- AI worker replacement is capped while its field army is small; previously every coin went into another engineer killed at the front, leaving no combat units.

### Borders, sovereignty and occupation
- `territoryControllerAt` separates static geographic sovereignty from current military control; captured city seats project control over nearby ground and oil fields.
- `updateBorders` detects unauthorized ground incursions, differentiates a single patrol from a large formation/duration, applies relationship damage, warns the defender, alerts AI defenders and issues withdrawal orders. Authorized `TRANSIT`/alliance movement is ignored.
- A unit carrying a live assault objective is not auto-returned at a neutral border; the crossing is still logged, still damages relations and still alerts the sovereign, but the offensive can reach its objective.
- Constructing on occupied oil fields is allowed through current control, including after capturing a city seat; static map ownership no longer blocks captured fields.
- Capturing a city seat updates the city immediately instead of waiting for the next ground sync.

### Map, cities, fog and UI
- Skirmish world is 1.732× linear (≈3× area): **6741 × 6228** instead of **3892 × 3596**. Map generation, pathfinding grid, unit speed/range, aircraft/missile speed, vision/fog radius, capture radius, building placement checks, border detection, target selection and camera start zoom all use the scale. Real mode remains 3892 × 3596.
- Skirmish city network reduced from 111 to **96** seats; Iran has **12** instead of ~31. Capitals and high-value ports/industrial/oil cities are retained; removed settlements remain geographic detail.
- Fog now records last-known contacts for 55 s with a timestamped faded “?” marker; contacts decay instead of remaining perfect.
- Notifications group duplicates, prioritise critical events (9 s), expose a FIELD LOG history panel and cap visible cards at four.
- The FIELD LOG has working category filters (ALL, ALERTS, WAR, DIPLO, ECON, FIELD). Selecting a category filters history and suppresses live cards outside it; the choice is visible as an active chip.
- Unavailable national equipment is shown in the ARMY bar as a disabled `LOCKED` entry. Hovering/its accessible label explains why (not in the national inventory, or foreign supply exhausted) instead of silently omitting it.
- Minimap enlarged (210 px desktop, responsive smaller), uses an undistorted 220×203 canvas, supports click/drag panning and wheel zoom of the camera in addition to click-to-navigate.
- Command bar adds IDLE selection and armed ATTACK MOVE (real `amove` orders), in addition to ALL ARMY, STOP, LOAD/UNLOAD, RALLY.
- Advisor mode Off clears recommendations and automatic actions; failed approvals now explain the cause. Recommendations carry map coordinates and a LOCATE button. History records completed actions.

## B. Fixed bugs
1. **Neutral missile strikes could disappear.** Root cause: launch did not establish a diplomatic victim and damage only affected already-hostile entities. Fix: pre-impact sovereignty/control resolution, war/escalation, target record, damage and notifications. Verified by acceptance test A.
2. **Iran could build the F-35.** Root cause: classic `canBuildType` allowed the global catalogue. Fix: national roster used by every production path. Verified by test C.
3. **Ceasefires erased the meaning of a war or flipped straight back.** Root cause: expiry deleted the agreement without a formal state/cooldown and `setRelation('NEUTRAL')` did not preserve scores. Fix: score-preserving expiry, 600 s minimum, cooldown, violation penalties. Verified by test H.
4. **Foreign transit had no consequences.** Root cause: no controller layer or border tick. Fix: sovereignty/controller split, transit agreements, incursion detection, warnings, relationship cost, AI alert and withdrawal. Verified by test B.
5. **Captured oil fields stayed unusable.** Root cause: construction checked static `field.code`. Fix: current controller and city transfer. Verified by test F.
6. **Map scaling initially broke pathfinding.** Root cause: `PF.CS` stayed 40 while the map's blocked mask used a scaled cell size, so the AI walked into invalid cells and stalled. Fix: one scaled cell size for both, larger A* budget. Verified by 30-minute simulations and the full suite.
7. **Suppressed structures were attacked forever at 1 HP.** Root cause: capturable buildings are floored at 1 HP; units kept selecting them. Fix: suppressed objectives become capture objectives, not fire targets. Verified in simulation and capture suite.
8. **AI had no way to request an ally attack.** Fix: real call-to-arms with movement orders and coalition tracking. Verified by test E.
9. **Advisor approval failed silently.** Fix: explicit failure toast/log with reasons and retained recommendation state. Verified by test D.
10. **City ownership waited for a later sync.** Fix: capture transfers the city immediately; ownership regression updated to assert immediate transfer.
11. **AI aborted every offensive when it declared an unrelated war.** Root cause: war declaration reset `siegeId` and `pushT`, re-pathing the committed corps and switching target. Fix: declarations no longer cancel an existing siege. This was one of the direct reasons captures never completed.
12. **Arriving AI ground units were ordered home at a neutral border.** Root cause: border return ran for every foreign unit, including a corps with a live assault target; `assault` was also cleared as soon as the target left weapon range. Fix: persistent assault objectives and a border exemption for committed assault units, while keeping the diplomatic penalty and defender alert. Aircraft suppressed the city while the ground force was bounced away; this is now resolved.
13. **Path smoothing cut straight across blocked terrain.** Root cause: A* used the blocked grid, but line-of-sight smoothing checked only obstacle rectangles, collapsing a land route into one waypoint across water; the unit then stalled at the coast. Fix: smoothing samples the same blocked/terrain mask, A* gets a full-grid budget and a BFS fallback, and target selection rejects seats outside the home land component. Ground offensives now march to the objective.
14. **AI starving its army to rebuild workers.** Root cause: dead engineers were replaced without counting the queue while combat units were under strength. Fix: worker target is reduced to two while at war below 16 combat units, and pending workers count toward the cap.
15. **One raider recalled the entire field army.** Root cause: any hostile within 380 px of the capital cancelled all unit orders. Fix: only six-plus raiders or a capital below 65% HP trigger a full recall; committed assault units keep their orders otherwise.
16. **Winning AI signed a ceasefire during a siege.** Root cause: the losing defender could ask and the attacker accepted while its target was suppressed. Fix: both proposer and recipient refuse a ceasefire while either has a suppressed/capturing seat.
17. **Idle AI trickled into the frontier.** Fix: the field army now stages at home until the offensive trigger, then commits all available combat units in a single push.

## C. New systems
- Central relationship matrix/bands and formal-state cooldown bookkeeping.
- National equipment roster + finite import supply.
- Strategic AI war initiation, target scoring, assault focus, victory-leader awareness, scouted-installation knowledge.
- Sovereignty/controller/occupancy model and transit rights.
- Occupied-territory construction/economy access.
- Real call-to-arms and defensive assistance.
- Scaled world pipeline (map, land-component pathfinding, movement, weapons, vision, capture, camera).
- Last-known-contact fog, grouped notification log with category filters, locked production entries with explanations, draggable/zoomable minimap, attack-move/idle controls.
- `tests/specs/overhaul.test.cjs` (51 checks) covering 4.md Tests A–J, map/mode isolation and the three completed UI surfaces.

## D. Testing results

### Automated
- `node tests/run.cjs` — **15 spec files, 337 checks, 0 failed in 179.5 s** (final re-run before commit).
- `node tests/run.cjs overhaul` — **51/51 checks** covering:
  - A neutral missile escalation, target record and damage;
  - B unauthorized/authorized transit;
  - C Iran F-35 denial and Israel F-35I availability;
  - D advisor Off mode and explained failure;
  - E ally call-to-arms with real movement orders;
  - F captured oil field construction;
  - H ceasefire duration/expiry/cooldown;
  - I stale contacts/decay;
  - map scale, city reduction and Real-mode isolation;
  - notification category filtering, disabled production entries with reasons, and real minimap drag/wheel events.
- Existing capture, structures, economy, AI composition, ownership, stability and UI specs pass.

### 30-minute simulations
| Focus | In-game time | City flips | Cities held by a foreign power | Focus cities/units at end | Missiles | Border logs |
|---|---|---|---|---|---|---|
| Iran, all-AI FFA | 1809.8 s | **1 — Bandar Abbas IRN→SAU at t=1062, via outpost** | 1 (IRN<SAU) | 11 cities / 29 units | 17 | 43 |
| Israel, all-AI FFA | 1809.8 s | 0 | 0 | 7 cities / 3 units | 12 | 45 |

The capture is a normal AI ground capture, not a harness shortcut. The recorder compares every city's owner every 10 in-game seconds and reported:

> `{"t":1062,"city":"Bandar Abbas","from":"IRN","to":"SAU","via":"outpost"}`

Saudi AI suppressed the Bandar Abbas seat, its ground formation entered the capture ring, completed the 420-second outpost capture, and `convertBuildingOwner` transferred the city. The city remained Saudi at the end of the match (foreign list `IRN<SAU(Bandar Abbas)`). The Israel-perspective match produced no flip in this sample, so capture is now proven end to end but is not yet a reliable outcome of every 30-minute match.

These are **headless automated simulations**, not human-played matches. The game clock ran 1800 in-game seconds at the 6× speed setting, with every seat AI-controlled, Medium difficulty and Balanced doctrine.

### Actual gameplay
Not manually played in a browser. The visual layer was not reviewed by a human in this run; only automated DOM/UI checks and source-level inspection were performed.

## E. Remaining issues / limits
- Capture is now demonstrated but still low-frequency: one of the two fresh matches produced a city flip (Bandar Abbas), the other none. AI forces can still attrition against a strong garrison before holding a seat for the full clock, so a longer or different sample may produce no flip. This needs further balancing of assault survivability versus defender concentration.
- AI economic and strength estimates for war initiation still use aggregate military power, not fully simulated intelligence; only non-city target knowledge is sensor-gated.
- Fog contacts show last position/age but not an explicit estimated force-strength/confidence number.
- Notification filters are single-select (one active category at a time); there is no saved per-category mute preference across sessions.
- Land-component checks and the BFS fallback add pathfinding work when the blocked mask changes; the measured 30-minute runs stayed within the performance below, but this is heavier than the original straight-line fallback.
- No human-played Iran/Israel match was conducted, so subjective readability/UX and manual command flow remain unverified.

## F. Real-mode regression
Real mode was booted in the acceptance spec and checked for scale (`spaceScale = 1`), map dimensions and full city count. The complete existing suite (including Real-mode scenarios for capture, economy, objectives, stability and UI) passes. No Real-mode regressions were observed in automated tests. Real mode was not manually played.

## G. Performance
- Scaled Skirmish: the two recorded 1800-second matches plus ten-second ownership comparisons completed in 225.2 s wall time (≈112 s per match; ≈16× real time with recorder overhead). Earlier uninstrumented runs were ≈83 s (21.7×). No crash or runaway memory was observed.
- Pathfinding initially degraded because of the grid mismatch, then failed again when smoothing cut across water. After matching the land mask, full-grid A*, BFS fallback and committed-assault border handling, ground units moved to their objectives and the measured capture occurred.
- 6× notification volume is controlled by four visible cards, duplicate grouping, longer critical retention and an on-demand history panel.
