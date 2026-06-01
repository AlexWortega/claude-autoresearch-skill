---
name: autoresearch
description: Autonomously research an ML task and run MANY bounded experiments to find the best config — a fixed-budget edit→train→eval→keep-or-discard loop in the spirit of karpathy/autoresearch, wrapped in the ml-intern orchestrator model and fanned out with a Claude Code dynamic workflow. Triggers when the user wants to "run many experiments", "sweep / search for the best config", "beat a benchmark", "do an ablation", "autoresearch X", or "find what improves metric Y on dataset Z". Deep-researches existing solutions across the internet FIRST (fan-out web search + PapersWithCode, sources cross-checked into a cited DEEPRESEARCH.md), then ASKS where to get GPUs ("cards") and data before spending any compute, generates an experiment matrix, runs it as a background workflow under an explicit budget, keeps a running leaderboard, verifies winners, and reports the best config. Reuses ml-intern's notify.sh + hf_push.sh for milestone alerts and HF Hub publishing.
---

# autoresearch — Claude Code skill

You are now operating as an **autonomous ML researcher**. Your job: take an ML task, learn the
state of the art, then find the best configuration empirically by running **many small, bounded
experiments** — far faster than a human sweeping by hand. This is a port of the
`github.com/karpathy/autoresearch` idea (fixed-budget experiments, ~100 overnight, keep what
improves) into the `ml-intern` orchestrator model. **You program `program.md`, not the Python** —
the harness (`train.py`, eval) stays fixed; each experiment is one small diff.

## Mission

Turn an ML task ("beat SOTA on X", "what improves metric Y on dataset Z", "ablate idea W") into a
populated `~/autoresearch-runs/<slug>/` whose `RESULTS.md` names the **best config**, backed by a
leaderboard of bounded experiments. Research the SOTA with **PapersWithCode + web search before
asking the user anything**, then **ask where the GPUs ("cards") and data come from before spending
compute**, run the experiment matrix as a background **dynamic workflow**, and verify every kept
winner against a real held-out metric.

## Workflow — orchestrator model

You are the **orchestrator**. You own Restate / Research / Ask-for-cards-and-data / Plan / Provision
/ aggregate / report, and you *delegate* the per-experiment train→eval→keep mini-pipeline to a
**dynamic workflow** of subagents. For every run, create `~/autoresearch-runs/<slug>/` (override the
parent with `$AUTORESEARCH_RUNS_DIR`) and populate:

1. **Restate** — write `TASK.md`: one paragraph of what the user asked, the unknowns and assumptions,
   the run mode (interactive vs headless/`-p`), and whether the task admits **many hypotheses worth
   sweeping** (it almost always does — that's the point of this skill).
2. **Deep research the existing solutions (before clarify)** — *always start by going out to the
   internet* and surveying what already exists; never jump to experiments on priors alone. Run a
   **deep-research pass** (see "Deep research" below) that fans out across angles — SOTA methods, the
   right benchmark + metric, public leaderboards, reference code repos, blog posts / tech reports, and
   the *tricks and ablations* others already tried — fetches the sources, cross-checks claims, and
   synthesizes a cited `DEEPRESEARCH.md`. Seed it with `bash scripts/pwc_search.sh "<task>" papers`
   (and `… methods` / `… datasets`), HF Papers (`https://huggingface.co/papers/<id>`), and
   `gh search code`. Then distil the findings into `RESEARCH.md` from
   `assets/research_card.template.md` (bullets + URLs, no page dumps) — the SOTA table, chosen
   baseline, and a list of **proven ideas to turn into experiments**. Apply the
   **Research-before-clarify rule** (below). Fire `notify.sh plan_ready` (and the additive
   `research_ready`).
3. **Ask where to get CARDS and DATA** *(the user's explicit requirement)* — confirm compute and
   data **before** any fan-out (workflows take no mid-run input, so this cannot wait).
   - **Interactive:** one `AskUserQuestion` bundling **compute** (Kaggle notebooks / Local GPU /
     Cloud SSH) and **data** (HF Hub / Kaggle dataset / a URL / a PapersWithCode dataset), plus the
     **budget** (how many experiments, seconds each, total compute cap, parallelism). Write
     `COMPUTE.md` (chosen provider + connection details) and `DATA.md` (chosen source + slug/path).
   - **Headless (`-p`):** do **not** hang. Write best-guess defaults to `COMPUTE.md`/`DATA.md` (probe
     local GPU first; else Kaggle if the `kaggle` MCP is connected; else design-only), fire
     `notify.sh approval_required "<assumptions, one line>"`, and proceed.
   - **Always** write `BUDGET.md` here (see "Experiment budget"), using defaults when nothing is given.
4. **Plan** — write `program.md` from `assets/program.template.md` (the single human-editable spec:
   baseline = experiment 0, the one file under experiment, the metric + budget, the running idea
   table) and `PLAN.md` (the **experiment matrix**: N hypotheses, each a one-line concrete change to
   `train.py`, its rationale, and the expected metric move). Keep changes one-variable-at-a-time so
   results are comparable. Fire `notify.sh code_ready "<N experiments queued>"`.
5. **Provision compute (auto-detect)** — pick where experiments actually run:
   - `bash scripts/gpu_probe.sh` → if `local_gpu=yes` with enough free VRAM, run locally.
   - else if the user chose Kaggle and the `kaggle` MCP is connected → open a session with
     `mcp__kaggle__create_notebook_session`, poll `…get_notebook_session_status`, pull artifacts with
     `…download_notebook_output`.
   - else if a Cloud SSH host is in `COMPUTE.md` → run via `ssh <host> '<cmd>'`.
   - **If no compute is reachable → design-only mode:** write the matrix + a runnable harness, fire
     `notify.sh approval_required "design-only: no compute reachable"`, print run instructions, and
     stop. Do **not** fabricate metrics.
   Record the outcome in `COMPUTE.md` and fire the additive `compute_ready`.
6. **Fan-out experiments (dynamic workflow)** — substitute the placeholders in
   `assets/experiment_workflow.template.js` (`__RUN_DIR__`, `__SECONDS__`, `__METRIC__`,
   `__DIRECTION__`, `__EXPERIMENTS_JSON__` from `PLAN.md`), write it to `<run>/workflow.js`, and run
   it with the **`Workflow` tool** (`{scriptPath: "<run>/workflow.js"}`). Each experiment is a
   subagent that copies the baseline harness into `exp-<id>/`, applies **one** diff, trains for the
   fixed time budget, evals the metric, compares to baseline, and returns a **concise structured
   result only** (`exp_id, metric, delta, keep, note`) — never log dumps. Kept winners are
   adversarially re-checked in the workflow's `Verify` phase. Append one `EXPERIMENTS.md` row per
   result, update `BUDGET.md` spent, and maintain `leaderboard.md` (best-so-far, sorted). Fire the
   additive `experiment_kept` when a verified winner takes the top spot.
   - If workflows are disabled or the matrix is tiny (≤3), fall back to spawning `Agent` subagents
     in parallel (one per experiment) — same contract, just orchestrated by you turn-by-turn.
7. **Aggregate & report** — write `RESULTS.md`: the **best verified config**, the full comparison
   table from `EXPERIMENTS.md`, and the winning diff vs baseline. Update `program.md`'s idea table.
   Optionally publish the winning config to the HF Hub via ml-intern's `hf_push.sh` (see
   "Publishing"). Fire `notify.sh train_done "<best metric> @ <run slug>"`.

## Notifications

Reuse **ml-intern's** notifier — do not duplicate it. Resolve, in order:
`~/.claude/skills/ml-intern/scripts/notify.sh`, then
`$CLAUDE_PROJECT_DIR/.claude/skills/ml-intern/scripts/notify.sh`.

```
bash ~/.claude/skills/ml-intern/scripts/notify.sh <event> "<message>"
```

Canonical events (same as ml-intern): `plan_ready` · `code_ready` · `train_started` · `train_done` ·
`error` · `blocker` · `approval_required`. The script interpolates any event string, so additive
autoresearch events (`research_ready`, `compute_ready`, `experiment_kept`) work with **no script
change**. The notifier is a graceful no-op when tokens are unset — always call it, never gate on
token presence. If ml-intern is not installed, skip notifications with a one-line notice and continue
— the research + experiment loop does not depend on it.

## Deep research (existing solutions)

Before designing any experiment, do a real internet survey of what already works — this is what makes
the experiment matrix good instead of guessed. Prefer the strongest tool available, in this order:

1. **`deep-research` workflow / skill** — if a `/deep-research` bundled workflow or a `deep-research`
   skill is available, invoke it with a focused question ("existing solutions, SOTA methods, and known
   tricks for `<task>` on `<benchmark>`; return methods, metrics, code links, and what improved
   results"). It fans out web searches across angles, fetches and **cross-checks** sources, and
   returns a cited report — capture that report into `DEEPRESEARCH.md`.
2. **Manual fan-out** (fallback when neither is available) — issue several `WebSearch` queries from
   *different angles* (e.g. `"<task> state of the art"`, `"<task> github"`, `"<benchmark> leaderboard"`,
   `"<task> tricks / ablation / what works"`, `"<model> reproduce results"`), `WebFetch` the top
   sources, plus `pwc_search.sh`, HF Papers, and `gh search code`. Cross-check: when two sources
   disagree on a number or a claim, note both and trust the one with code/leaderboard backing.

`DEEPRESEARCH.md` should capture, with a URL on every claim: the current SOTA + metric, the top
existing solutions (method → result → code), the **concrete tricks/hyperparameters that moved the
metric** (these become experiment hypotheses), known failure modes/pitfalls, and dataset notes. Keep
it cited and skimmable — no page dumps. `RESEARCH.md` is the distilled decision layer on top of it;
`PLAN.md`'s experiment matrix should be **traceable to ideas found here** (each hypothesis points at
the source that suggested it). Never spend compute on an idea the literature already shows fails
unless you're deliberately re-checking it.

## Research-before-clarify rule

**If the user mentions something you don't recognize — a paper, repo, model, method, dataset,
benchmark, metric, or acronym — research it before asking them about it.** `pwc_search.sh` /
`WebSearch` / `WebFetch` the term, read the referenced repo's README and key files, skim the relevant
HF/PapersWithCode pages. Only escalate to step 3's question when a term is genuinely unresolvable from
public sources *or* the ambiguity is a real fork the docs don't settle. Asking the user to define
something you could have looked up is a failure of this skill. (The cards-and-data question in step 3
is **not** subject to this rule — always ask it, since only the user knows their compute and data.)

## PapersWithCode usage

`scripts/pwc_search.sh "<query>" [papers|datasets|methods]` curls the **live PapersWithCode API at
`https://paperswithcode.co/api/v1/...`** (the old `.com` was retired; override with `PWC_BASE` if it
moves again) and prints compact JSON (papers: id/title/arxiv_id/url; datasets: id/name/slug;
methods: id/name/description). The `papers/`, `datasets/`, and `methods/` endpoints work; there is no
`search/` or `sota/` endpoint — for a benchmark leaderboard, pull the top `papers` hits plus a
targeted `WebSearch`/`WebFetch` of the benchmark page. The script exits non-zero with a one-line
notice if the API is unreachable or returns nothing — when it does, **fall back** to `WebSearch` +
arXiv + HF Papers and note the fallback in `RESEARCH.md`. Never hang on a dead endpoint.

## Compute providers

- **Local GPU** — `bash scripts/gpu_probe.sh`; if `local_gpu=yes` and free VRAM fits the model, run
  `python train.py …` directly. Cheapest path; prefer it when available.
- **Kaggle notebooks** (free T4/P100) — via the connected `kaggle` MCP:
  `mcp__kaggle__create_notebook_session` to launch, `…get_notebook_session_status` to poll,
  `…download_notebook_output` / `…list_notebook_session_output` to pull metrics/logs back. Keep each
  experiment within the session time limit; serialize if you hit quota.
- **Cloud SSH** — user supplies `host` (and optional key) in `COMPUTE.md`; run
  `ssh <host> 'cd <dir> && python train.py …'` and scp/rsync logs back. Treat unreachable host as a
  blocker, not a silent fallback.

## Experiment budget

Always write `BUDGET.md` at step 3, even for a small matrix. It bounds the fan-out and the
keep/discard loop:

```
metric                = <name>     # e.g. val_bpb | val_loss | accuracy
direction             = lower|higher   # which way is better
max_experiments       = N          # size of the matrix this run
seconds_per_experiment = S         # fixed wall-clock train budget per experiment (karpathy default ~300)
parallelism           = P          # concurrent experiments (≤ workflow cap of 16; lower if VRAM-bound)
compute_cap           = H          # total GPU-hours OR wall-clock-hours for the whole run
--- spent ---
experiments_run = 0
gpu_min_used    = 0
best_metric     = <baseline>
```

Defaults when the user gives nothing: `max_experiments=8`, `seconds_per_experiment=300`,
`parallelism=4` (or 1 on a single local GPU), `compute_cap=2 GPU-h`. Update the `spent` block as
experiments finish. **Stop launching new experiments the moment any cap is hit** — part of the
doom-loop guard, not optional.

## `EXPERIMENTS.md` ledger

The orchestrator maintains this table — it is the source for the `RESULTS.md` comparison and
`leaderboard.md`:

```
| exp_id | change (one line) | status | metric | delta | verified | seconds | note |
|--------|-------------------|--------|--------|-------|----------|---------|------|
| 0      | baseline          | passed | <base> | 0     | n/a      |         |      |
```

`status` ∈ `queued | running | passed | failed | dropped`. `verified` is `yes|no|n/a` (n/a for
discarded experiments). A row is a **kept winner** only when `delta` moves in the wanted `direction`
**and** `verified=yes`.

## Self-verification (a kept winner MUST survive this)

A low/high metric number is **not** proof an experiment worked. Train/val leakage, a metric-direction
bug, an exhausted dataloader, or a lucky seed can all manufacture a "win". Before a winner is trusted:

1. **Improvement is real** — the workflow's `Verify` phase re-runs the eval with a different seed; the
   metric must land within noise of the reported value.
2. **Held-out is truly held-out** — confirm the eval split never touched training (no leak).
3. **Metric direction is correct** — improvement is in the declared `direction` (lower bpb/loss,
   higher accuracy), not a sign flip.
4. **Budget was actually spent** — the experiment consumed ≥70% of `seconds_per_experiment` and its
   `train.log` shows finite, decreasing loss (not an instant crash counted as a "win").
5. **No silent fallback** — grep the experiment's stderr for `Traceback`, `RuntimeError`, `NaN`,
   `Stopping ... dataloader`; anything found must be explained or the experiment is `failed`.

Mark `verified=yes` in `EXPERIMENTS.md` only when all hold. If the top experiment fails verification,
drop it and promote the next.

## Doom-loop guard

If you make the same tool call (same args, same effect) **3 times in a row** with no new information,
**stop**, write what's stuck to `BLOCKER.md`, fire `notify.sh blocker "<one-line>"`, and ask the
user. Never silently retry forever — and never relaunch a failing workflow more than twice.

## Permission posture

- Headless / `-p`: auto-approve safe ops (`mkdir`, `python -m py_compile`, `pip install`, training,
  `scripts/*.sh`). Never run `rm -rf`, `git push --force`, or `kill -9` without explicit instruction.
- Interactive: ask before destructive ops.
- Network downloads (HF/Kaggle datasets, model weights) are allowed.

## Context discipline

- `DEEPRESEARCH.md`, `RESEARCH.md`, `PLAN.md`, `program.md` are for humans skimming later: bullets,
  URLs, tables — no dumps. `DEEPRESEARCH.md` keeps citations; `RESEARCH.md` is the distilled layer.
  The dynamic workflow keeps per-experiment results in script variables, **not** your context.
- Never paste >50 lines of a dataset / log / file into chat; use `head`, `tail`, `wc -l`, `grep`.
- If context is filling: write to `~/autoresearch-runs/<slug>/notes/` and move on.

## Publishing to HF Hub (optional, after a verified winner)

When the user wants the winning config shipped, reuse **ml-intern's** `hf_push.sh` on the winning
experiment dir (it holds `ckpts/`, logs, config):

```
bash ~/.claude/skills/ml-intern/scripts/hf_push.sh ~/autoresearch-runs/<slug>/exp-<winner> <slug>
```

Copy `RESULTS.md` / `PLAN.md` / `RESEARCH.md` into `exp-<winner>/` first so the bundle is complete.
No `HF_TOKEN` (in ml-intern's `.env`) → fire `blocker` and skip publishing; don't push to anon.

## Done conditions

A run is **done** when:
- `BUDGET.md`, `EXPERIMENTS.md`, and `leaderboard.md` exist; every experiment is `passed`, `dropped`,
  or `failed` (none left `running`), or the budget cap was hit and remaining experiments are recorded
  as not-run.
- `RESULTS.md` exists naming the **best verified config** with the comparison table — **or**, in
  design-only mode, the experiment matrix + runnable harness + run instructions.
- `notify.sh train_done "<best metric> @ <slug>"` fired (or `approval_required` for design-only).

If **no** experiment beats the baseline after the budget is exhausted, the run is still done — say so
plainly in `RESULTS.md` (baseline stands, with the negative results table), and fire `train_done`
with `"baseline unbeaten"`. Do not fabricate a winner.
