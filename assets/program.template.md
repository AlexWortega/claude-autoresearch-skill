# program.md — <run slug>

> karpathy/autoresearch style: **you program this file, not the Python.** The harness
> (`train.py`, eval) is fixed; each experiment is a small diff to `train.py`. Keep one
> file under experiment so results are comparable.

## Baseline (experiment 0)
- task: <one line>
- harness file under experiment: `train.py`
- dataset: <slug / path / URL> (see DATA.md)
- baseline config: <key hyperparams: model size, lr, batch, optimizer, steps>
- baseline metric: `<METRIC>` = <value> (held-out split)

## Rules of the loop
- Each experiment changes **one thing** vs the baseline (or vs the current best).
- Time budget per experiment: **<SECONDS>s** of wall-clock training (fixed → comparable).
- Metric: **`<METRIC>`**, **<lower|higher>** is better, measured on the held-out split.
- Keep a change iff it improves the metric beyond noise; otherwise discard and revert.
- A low metric is not proof — a kept winner must survive an independent re-eval (no leak, no lucky seed).

## Ideas tried (append one row per experiment; mirrors EXPERIMENTS.md)
| exp | change (one line) | metric | Δ vs base | verdict |
|-----|-------------------|--------|-----------|---------|
| 0   | baseline          |        | 0         | base    |

## Open ideas (not yet run)
- <hypothesis> — why it might help — expected metric move
