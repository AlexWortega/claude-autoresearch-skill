# FINDINGS.md — shared research board for <run slug>

> The **message board** the parallel agent teams read and write each generation. Proposers
> read it to build on what works and avoid what failed; the Share phase appends to it after
> every generation. The machine-readable mirror is `board.jsonl` (one event per line).

## Champion (best verified config so far)
- exp_id: <none yet — baseline stands>
- metric: `<METRIC>` = <value>
- change vs baseline: <one line>
- crowned in generation: <g>

## What works (verified wins, newest first)
| gen | exp_id | change (one line) | metric | Δ | note |
|-----|--------|-------------------|--------|---|------|
| 0   | 0      | baseline          | <base> | 0 | base |

## What does NOT work (dead ends — do not re-propose)
- <change> — <why it failed / no improvement> (gen <g>)

## Open directions (within the current lever, not yet run)
- <hypothesis> — why it might help — which champion it builds on

## Next levers (structural reframes — climb here when the current axis stalls)
> rung-3 ideas: a *different method*, not a tweak (new algorithm/solver, new harness, new modelling
> approach). The loop escalates to these on stagnation; each becomes its own `program.md` baseline.
- <lever> — what it replaces — why it could beat the current approach — source (DEEPRESEARCH §)

## Stagnation / lever log
- gen <g>: <new champion | no improvement, rung <1|2|3> (escalates at STAGNATION / 2×STAGNATION)>
