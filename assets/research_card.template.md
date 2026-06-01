# RESEARCH.md — <run slug>

> Distilled decision layer on top of `DEEPRESEARCH.md` (the cited internet survey). Filled before any
> compute is spent. Bullets + URLs only, no page dumps (context discipline).
> Sources: the deep-research pass, `scripts/pwc_search.sh` (PapersWithCode), `WebSearch`/`WebFetch`,
> arXiv, HF Papers, `gh search code`.

## Task restatement
<one line of what we're trying to beat / build>

## Benchmark & metric
- benchmark / dataset: <name>
- metric: `<METRIC>` — **<lower|higher>** is better
- current SOTA: <value> (source URL)

## SOTA methods (from PapersWithCode + search)
| method | benchmark | metric | year | code |
|--------|-----------|--------|------|------|
|        |           |        |      | <repo URL> |

## Leaderboard snapshot
<top 3–5 rows: rank · method · metric · paper/code URL>

## Reference implementations
- <repo URL> — <one line: what to borrow>

## Proven ideas to turn into experiments (from DEEPRESEARCH.md)
- <trick / hyperparameter that moved the metric elsewhere> — expected effect — source URL

## Dataset candidates
- <HF slug / Kaggle dataset / URL> — size, license, why it fits (→ DATA.md)

## Chosen baseline + why
<which method/config we start from as experiment 0, and the rationale>

## Notes / caveats
- <e.g. PapersWithCode API was unreachable → used WebSearch + arXiv instead>
