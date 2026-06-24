---
name: autoresearch
description: Autonomously research an ML task and run MANY bounded experiments to find the best config — a fixed-budget edit→train→eval→keep-or-discard loop in the spirit of karpathy/autoresearch, wrapped in the ml-intern orchestrator model and fanned out with a Claude Code dynamic workflow. Runs LONG: an iterative generational loop (mims-harvard/AutoScientists style) where parallel agent teams propose hypotheses, peer-critique them before spending any GPU, share findings on a common board, promote a champion, and keep going until budget/stagnation/convergence. Triggers when the user wants to "run many experiments", "sweep / search for the best config", "beat a benchmark", "do an ablation", "autoresearch X", "run for a long time / overnight / for days", or "find what improves metric Y on dataset Z". Deep-researches existing solutions across the internet FIRST (fan-out web search + PapersWithCode + GitHub, sources cross-checked into a cited DEEPRESEARCH.md), then ASKS where to get GPUs ("cards") and data before spending any compute, generates an experiment matrix seeded from diverse literature angles, runs it as a background workflow under an explicit budget, keeps a running leaderboard + shared findings board, verifies winners, and reports the best config. Reuses ml-intern's notify.sh + hf_push.sh for milestone alerts and HF Hub publishing.
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
leaderboard of bounded experiments. Research the SOTA with **PapersWithCode + GitHub + web search
before asking the user anything**, then **ask where the GPUs ("cards") and data come from before
spending compute**, run the experiment matrix as a background **dynamic workflow**, and verify every
kept winner against a real held-out metric. The experiment matrix must be **maximally diverse** —
ideas from different papers, different algorithmic families, different ML communities — not
variations of the same guess.

## Autonomy mandate (do NOT be lazy — this is the most important rule)

This skill's failure mode is **stopping too early and handing the work back to the human**. Fight it:

- **Cards + data are the ONLY approval gate.** Once `COMPUTE.md` and `DATA.md` are settled, launching
  in-budget, non-destructive experiments — and **generating the next lever when the current one is
  exhausted** — is your *default action*, not something to confirm. You already have standing
  authorization; use it.
- **Never end a turn with "should I continue?" / "Поехали?" / "запустить?" while budget remains and
  the backlog is non-empty.** Proposing a good idea and then waiting to be poked is the exact lazy
  behaviour this skill exists to prevent. See a promising, in-budget, non-destructive lever → **launch
  it**, then report what you launched. Asking permission to keep researching is a failure of the skill.
- **"Stuck" means escalate the search space, not stop.** Running out of one-variable tweaks is NOT a
  done condition — it is the trigger to climb the **lever ladder** (below). You only truly stop when
  the budget is spent or you have climbed the whole ladder and the lever-generator itself returns
  nothing new for two rounds. Exhausting a *sub*-space is never exhausting the *task*.
- **The budget is a floor as well as a ceiling.** The caps and the doom-loop guard exist to stop
  *runaway repetition* — they do **not** license quitting with budget left. While `compute_cap` /
  generations / tokens remain and there is any untried promising direction, you must keep going on
  your own initiative.
- Genuine blockers (no compute reachable, a true ambiguity only the user can resolve, a destructive
  op) still pause and ask. "I'm out of small tweaks" is not a blocker — it's the next lever.

## Lever ladder (how to escape a stuck search)

A **lever** is the axis the search moves along. autoresearch is excellent at optimizing *within* a
lever and blind to *changing* the lever unless told to — so make changing it explicit. When a lever
stagnates, climb one rung; each rung is a wider reframe and becomes its own new baseline to optimize:

1. **Hyperparameter tweak** — one variable vs the champion (lr, depth, schedule…). The default loop.
2. **Orthogonal axis** — a different family of one-variable changes (regularization, data mix,
   tokenizer, augmentation) the champion's family doesn't touch.
3. **New lever / structural reframe** — a *different method*, not a tweak: replace the algorithm,
   swap the harness file, change the solver (e.g. "learned edge-ranker instead of BFS", "graph
   transformer over the state graph", "distillation instead of RL"). This is normally outside the
   "one diff to `train.py`" frame — **on stagnation you are required to generate levers at this rung**,
   give each its own `program.md` baseline, and sweep within it. Mine `DEEPRESEARCH.md` /
   `FINDINGS.md` "future work" for these.

Record candidate levers in `FINDINGS.md` → "Next levers" so the loop always has somewhere to climb.

## Workflow — orchestrator model

You are the **orchestrator**. You own Restate / Research / Ask-for-cards-and-data / Plan / Provision
/ aggregate / report, and you *delegate* the per-experiment train→eval→keep mini-pipeline to a
**dynamic workflow** of subagents. For every run, create `~/autoresearch-runs/<slug>/` (override the
parent with `$AUTORESEARCH_RUNS_DIR`) and populate:

1. **Restate** — write `TASK.md`: one paragraph of what the user asked, the unknowns and assumptions,
   the run mode (interactive vs headless/`-p`), and whether the task admits **many hypotheses worth
   sweeping** (it almost always does — that's the point of this skill).

2. **Deep research — diverse literature + GitHub mining (before clarify)** — *always start by going
   out to the internet* and surveying what already exists across **multiple distinct angles**; never
   jump to experiments on priors alone and never mine only one source. The goal is to seed the
   experiment matrix with ideas from **maximally different communities** — not ten variations of the
   same paper. Run the full multi-source sweep below:

   **A. PapersWithCode + arXiv sweep (methods, benchmarks, SOTA):**
   - `bash scripts/pwc_search.sh "<task>" papers` (and `… methods` / `… datasets`)
   - arXiv recent: `WebSearch "site:arxiv.org <task> 2024 OR 2025"` — pick 3-5 most-cited recent papers
   - HF Papers: fetch `https://huggingface.co/papers?q=<task>` — note any models with top downloads

   **B. GitHub idea mining (first-class source — do not skip):**
   Run all three search angles; each surfaces different ideas than papers do:
   - `gh search repos "<task>" --language python --sort stars --limit 20` — top implementations
   - `gh search code "<key_function_or_class>" --language python --limit 15` — reusable building blocks
   - `gh search repos "<task> tricks OR ablation OR improve" --sort updated --limit 10` — experiment logs
   For the top 3-5 repos: fetch `README.md`, skim `CHANGELOG` or `EXPERIMENTS.md` if they exist,
   and note every technique listed under "what helped", "ablations", or "tips". These are proven
   engineering tricks that rarely appear in papers — they are high-value hypotheses.

   **C. Blog posts, tech reports, community tricks:**
   - `WebSearch "<task> tricks site:reddit.com OR site:huggingface.co/blog OR site:sebastianraschka.com"`
   - `WebSearch "<task> what works surprising result"` — surface counterintuitive findings
   - Fetch the top 2-3 hits and extract concrete, reproducible changes

   **D. Cross-domain transplant mining:**
   For each "idea angle" in `IDEA_ANGLES.md` (see "Diversity-first idea mining" below), run one extra
   query: `WebSearch "<angle_domain> <task equivalent>"` — techniques from adjacent fields that haven't
   been ported. Example: task = "sequence classification" → angles include "time-series anomaly
   detection", "protein secondary structure", "code understanding".

   Cross-check claims: when two sources disagree on a number or a claim, note both and trust the one
   with code/leaderboard backing. Synthesize all findings into a cited `DEEPRESEARCH.md` (see format
   below). Then distil into `RESEARCH.md` from `assets/research_card.template.md`. Fire
   `notify.sh research_ready`.

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

4. **Plan (diversity-constrained)** — write `program.md` from `assets/program.template.md` and
   `PLAN.md` (the **experiment matrix**). The matrix **must be maximally diverse**: apply the
   angle-coverage check from "Diversity-first idea mining" before finalizing — every hypothesis must
   (a) cite a paper/repo/post from `DEEPRESEARCH.md`, and (b) come from a **different idea angle**
   than its neighbours. No two seed experiments may belong to the same angle-family unless the
   matrix has more experiments than angles. If the first-pass matrix is too homogeneous, run idea
   spinning (see below) to fill the gaps. Fire `notify.sh code_ready "<N experiments queued>"`.

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

6. **Run the generational research loop (dynamic workflow)** — this is the long-running heart of the
   skill (see "Long-running iterative loop" below). Substitute the placeholders in
   `assets/research_loop.template.js` (`__RUN_DIR__`, `__SECONDS__`, `__METRIC__`, `__DIRECTION__`,
   `__SEED_EXPERIMENTS_JSON__` from `PLAN.md`, plus `__MAX_GENERATIONS__`, `__HYPOTHESES_PER_GEN__`,
   `__PROPOSERS__`, `__CRITICS__`, `__STAGNATION__` from `BUDGET.md`), write it to `<run>/workflow.js`,
   seed the shared board from `assets/board.template.md` → `<run>/FINDINGS.md`, and run it with the
   **`Workflow` tool** (`{scriptPath: "<run>/workflow.js"}`, in the background). The workflow loops
   over **generations**: parallel proposer teams each covering a **distinct idea angle** read the board
   and propose fresh one-variable hypotheses, a peer-critic panel prunes redundant/weak ones **before**
   any GPU is spent, survivors train for the fixed budget and eval the metric, kept winners are
   adversarially re-checked, and the `Share` phase appends results to `board.jsonl`/`FINDINGS.md` +
   rewrites `leaderboard.md` and the champion. Each experiment returns a **concise structured result
   only** (`exp_id, metric, delta, keep, note`) — never log dumps. The loop keeps going until
   `__MAX_GENERATIONS__`, `__STAGNATION__` consecutive no-improvement generations, or the token budget
   runs low. Append one `EXPERIMENTS.md` row per result and update `BUDGET.md` spent. Fire the
   additive `experiment_kept` when a verified winner takes the top spot (new champion).
   - **Single-pass fallback**: if the matrix is tiny (≤3) or you explicitly want one round only, use
     `assets/experiment_workflow.template.js` instead (no propose/critique loop — just fan out the
     matrix once, verify, report).
   - If workflows are disabled, fall back to spawning `Agent` subagents in parallel (one per
     experiment) and run the propose→critique→experiment→verify→share generations yourself,
     turn-by-turn — same contract, just orchestrated by you.

7. **Aggregate & report** — write `RESULTS.md`: the **best verified config**, the full comparison
   table from `EXPERIMENTS.md`, and the winning diff vs baseline. Update `program.md`'s idea table.
   Optionally publish the winning config to the HF Hub via ml-intern's `hf_push.sh` (see
   "Publishing"). Fire `notify.sh train_done "<best metric> @ <run slug>"`.

---

## Diversity-first idea mining

**The single biggest failure mode of autoresearch is converging on a cluster of similar ideas** —
ten variations of "change the learning rate schedule" while ignoring regularization, architecture,
data augmentation, and cross-domain transplants entirely. This section exists to prevent that.

### Idea angle taxonomy

Before writing any hypothesis, assign each idea to one **angle**. A healthy seed matrix covers at
least 5 distinct angles. Default angle list (extend for the specific task):

| # | Angle | Examples |
|---|-------|---------|
| A | Optimization & schedule | LR warmup/decay, optimizer choice, gradient clipping, momentum |
| B | Regularization | Dropout, weight decay, label smoothing, mixup, stochastic depth |
| C | Architecture / model structure | Layer count, hidden dim, attention variant, normalization |
| D | Data & augmentation | Sampling strategy, synthetic data, curriculum, data mix ratios |
| E | Training objective / loss | Auxiliary heads, contrastive loss, distillation, self-supervised pre-task |
| F | Efficiency / engineering | Mixed precision, activation checkpointing, batch packing, quantization |
| G | Cross-domain transplant | A technique from an adjacent field (e.g. protein folding → NLP) |
| H | Scaling & compute allocation | Wider vs deeper, more epochs vs more data, ensemble size |
| I | GitHub / open-source trick | A concrete technique found in a top-starred repo, not in papers |
| J | Counterintuitive / antithesis | Something the community believes true — test its negation |

Write `IDEA_ANGLES.md` in the run directory: one section per angle, listing ideas found for each.
At minimum, seed experiments must cover angles A–E. If PapersWithCode + GitHub yield ideas for G/I/J,
include at least one each — those are the highest-surprise hypotheses.

### Anti-convergence check

Before finalizing `PLAN.md`, count how many hypotheses share an angle. If any angle holds >30% of
the total (e.g. 5 of 12 are all optimization tweaks), **replace the excess with ideas from under-
represented angles**, sourced from `DEEPRESEARCH.md`. This is not optional — a homogeneous matrix
wastes budget rediscovering the same gradient.

### Idea spinning (generate diverse variants from a seed)

When a literature search yields one good idea but the matrix needs more diversity, **spin it** into
orthogonal variants using these transformations. Apply each transformation to the seed idea and check
whether the result falls in a different angle — if yes, add it:

1. **Scale** — what happens at 0.1×, 10×, 100× the magnitude? (e.g. dropout 0.1 → 0.5 → 0.9)
2. **Inversion / antithesis** — what if the opposite is true? (e.g. "larger batch helps" → test tiny batch)
3. **Cross-domain transplant** — what analogous technique exists in CV / RL / audio / bioinformatics?
4. **Simplification** — what is the simplest possible version? (remove 80% of the idea, keep the core)
5. **Combination** — combine two ideas from different angles that have never been tested together
6. **Temporal shift** — apply the idea at a different stage (warm-up only, end-of-training only, alternating)
7. **Negation of assumption** — identify the implicit assumption the idea makes and remove it

Record every spun variant in `IDEA_ANGLES.md` under its angle, with the parent idea and which
transformation produced it. In each generation's Propose phase, the idea-spinner transformation set
is shared with proposers so they can apply it to the current champion — not just to the seed ideas.

### GitHub search protocol (mandatory step in deep research)

GitHub surfaces ideas that never made it into papers — engineering tricks, ablation logs, bug-fixes
that happen to improve accuracy, configuration files from top-performing teams. Do not skip this step.

```bash
# Step 1 — find top repos for the task
gh search repos "<task>" --language python --sort stars --limit 20

# Step 2 — look for active experiment logs / ablation notes
gh search repos "<task> ablation OR tricks OR experiment" --sort updated --limit 10

# Step 3 — find code patterns (key functions, architectural motifs)
gh search code "<task_key_symbol>" --language python --limit 15

# Step 4 — for the top 3-5 repos: mine the README, issues, and any RESULTS or EXPERIMENTS file
gh api repos/<owner>/<repo>/contents/README.md --jq '.content' | base64 -d
gh search issues "<task> what helped OR improved" --repo <owner>/<repo> --limit 10
```

For each repo: extract **concrete, one-line-testable claims** (e.g. "layer norm before attention
gave +0.3 val acc"). Add each to `IDEA_ANGLES.md` under angle I ("GitHub / open-source trick").
Note the repo URL and commit/issue that surfaces the claim — cite it in `DEEPRESEARCH.md`.

---

## Long-running iterative loop (the AutoScientists model + diversity enforcement)

The default fan-out (step 6) is **not** a single pass over a fixed matrix — it is a long-running
**generational loop**, adapted from `mims-harvard/AutoScientists`: parallel agent *teams* self-organize
around the best ideas, **critique each other before spending compute**, and **share what they learn on
a common board** so the search compounds instead of repeating itself. One generation:

1. **Propose (parallel teams — diversity-assigned).** `__PROPOSERS__` proposer agents run
   concurrently, each **assigned a distinct idea angle from `IDEA_ANGLES.md`**. An agent assigned
   angle C (architecture) must generate architecture-family hypotheses; it must not re-propose what
   angle A (optimization) already covers. Each proposer reads the shared board (`FINDINGS.md`,
   `leaderboard.md`, `DEEPRESEARCH.md`, `IDEA_ANGLES.md`, `program.md`) and the current **champion**,
   then proposes **fresh one-variable hypotheses** that (a) build on what works in their angle, (b)
   are not on the already-tried list, and (c) cite a concrete source (paper, GitHub repo, blog post)
   from `DEEPRESEARCH.md` or `IDEA_ANGLES.md`. Proposers are also given the **idea-spinner
   transformations** and may apply them to the champion's best feature to generate orthogonal variants.
   If a proposer's angle is exhausted, it climbs to "cross-domain transplant" (angle G) rather than
   re-proposing from the same family.

2. **Peer-critique (before any GPU) — diversity + quality filter.** A panel of `__CRITICS__` critic
   agents scores every proposal on three axes: (a) **quality** (expected impact × plausibility,
   0-10), (b) **novelty vs the board** (not a near-duplicate of a tried idea), and (c) **angle
   diversity** (does this generation cover at least 3 distinct angles in the surviving set?). Only
   proposals with a majority "novel" vote, a mean quality score ≥ 6/10, **and** a passing angle
   diversity check survive. The top `__HYPOTHESES_PER_GEN__` go to compute; if the surviving set is
   angle-homogeneous, critics must substitute a lower-scored but angle-diverse proposal for one of
   the high-scored homogeneous ones.

3. **Experiment + verify.** Survivors fan out exactly like the single-pass mode: copy harness, apply
   one diff, train for `seconds_per_experiment`, eval, and adversarially re-check kept winners.

4. **Share (update the board).** The `Share` phase appends this generation's results to
   `board.jsonl`, rewrites the human `FINDINGS.md` (what worked, what to avoid, open directions),
   updates `leaderboard.md` + the champion, **and updates `IDEA_ANGLES.md`** — marking each tried
   idea with its outcome so the next proposers know what territory is already mapped.

5. **Champion + stagnation → climb the lever ladder.** The best *verified* config is the champion; a
   new champion resets the stagnation counter. After `__STAGNATION__` no-champion generations the loop
   does **not** quit — it climbs one rung of the lever ladder: first switch proposers to **orthogonal
   axis** mode (rung 2), and if still stuck after another `__STAGNATION__` generations switch to
   **new-lever mode** (rung 3) — proposers must now propose *structural reframes* (a different method,
   a new harness/baseline), each becoming its own `program.md` and a fresh sub-search. Before
   triggering rung 3, run one **GitHub re-search** (`gh search repos` + `gh search code`) with the
   current champion's architecture/technique as the query — surface repos that already implement a
   superior variant and haven't been mined yet. Append every reframe to `FINDINGS.md` → "Next levers".

The loop only truly **exits** when: the `compute_cap` / token budget is spent, OR you have climbed to
rung 3 and the lever-generator returns no new structural idea for two consecutive rounds (real
convergence), OR `max_generations` is hit *and* budget remains *and* there are queued "Next levers" —
in which case you **relaunch** (see "Staying alive") rather than report-and-stop. `max_generations` is
a per-workflow batch size, **not** the end of the task. This is what lets a run go for **hours or
days** — across many workflow relaunches, not one finite run.

### Staying alive across context windows

A workflow runs in the background and survives your own context compaction — you are notified when it
finishes. For genuinely long runs:

- **Launch in the background** and let the completion `<task-notification>` re-invoke you; do **not**
  poll in a tight loop (that wastes the prompt cache — see ScheduleWakeup guidance).
- **Checkpoint to disk every generation** (the `Share` phase already does this) so progress is durable.
  If the workflow is killed or interrupted, **resume** it with `{scriptPath, resumeFromRunId}` — the
  unchanged prefix of generations returns from cache and only the unfinished tail re-runs. The
  on-disk board lets a fresh workflow pick up where the last one stopped.
- If you must babysit an external provider (a Kaggle session, a cloud SSH job) the harness can't
  notify you about, use `ScheduleWakeup` with a delay matched to how fast that state changes — not a
  fixed short poll.
- Update `BUDGET.md` spent and fire `notify.sh experiment_kept "<new champion>"` on each champion
  change so the user sees progress without reading logs.

**Outer driver (this is what makes it actually long-running).** A `Workflow` runs once and returns —
it does **not** relaunch itself. So *you*, the orchestrator, are the loop around the loop. When a
workflow returns, do **not** stop to ask: read its result + `FINDINGS.md` "Next levers" +
`IDEA_ANGLES.md` uncovered angles, and **if the budget still has room and any untried promising
direction remains, immediately launch the next batch on your own initiative** (a new generation batch
on the current lever, or a fresh `program.md` for the next lever up the ladder). Only write
`RESULTS.md` and stop when the budget is spent or the lever ladder is genuinely exhausted (rung 3 dry
for two rounds). To survive your own context limits across this outer loop, drive it with `/loop`
(self-paced) or `ScheduleWakeup` so a fresh context re-enters the skill, reads the on-disk board, and
relaunches — the run continues for days without the user poking it.

---

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

---

## Deep research (existing solutions — diversity-first)

Before designing any experiment, do a real internet survey of what already works — this is what makes
the experiment matrix good instead of guessed. The survey must be **multi-angle**, not a single pass
over one source. Prefer the strongest tool available, in this order:

1. **`deep-research` workflow / skill** — if a `/deep-research` bundled workflow or a `deep-research`
   skill is available, invoke it with a focused question ("existing solutions, SOTA methods, and known
   tricks for `<task>` on `<benchmark>`; include GitHub repos, engineering tricks, counterintuitive
   results, and cross-domain transplants; return methods, metrics, code links, and what improved
   results"). It fans out web searches across angles, fetches and **cross-checks** sources, and
   returns a cited report — capture that report into `DEEPRESEARCH.md`.

2. **Manual fan-out (fallback)** — run all four source groups; skip none:
   - **Papers**: `pwc_search.sh` + arXiv + HF Papers (angles A–F, H in the taxonomy)
   - **GitHub**: the full GitHub search protocol from "Diversity-first idea mining" (angle I)
   - **Community tricks**: Reddit/HF blog/tech reports (`WebSearch`, angle J)
   - **Cross-domain**: adjacent-field search for each under-represented angle (angle G)

`DEEPRESEARCH.md` must capture, with a URL on every claim: the current SOTA + metric, the top
existing solutions (method → result → code), the **concrete tricks/hyperparameters that moved the
metric** (these become experiment hypotheses, tagged with their angle), known failure modes/pitfalls,
and dataset notes. Add a section "GitHub findings" listing repo names and the engineering tricks each
surfaced. Keep it cited and skimmable — no page dumps. `RESEARCH.md` is the distilled decision layer
on top of it; `PLAN.md`'s experiment matrix should be **traceable to ideas found here** (each
hypothesis points at the source AND its angle tag). Never spend compute on an idea the literature
already shows fails unless you're deliberately re-checking it.

---

## Research-before-clarify rule

**If the user mentions something you don't recognize — a paper, repo, model, method, dataset,
benchmark, metric, or acronym — research it before asking them about it.** `pwc_search.sh` /
`WebSearch` / `WebFetch` the term, read the referenced repo's README and key files, skim the relevant
HF/PapersWithCode pages. Only escalate to step 3's question when a term is genuinely unresolvable from
public sources *or* the ambiguity is a real fork the docs don't settle. Asking the user to define
something you could have looked up is a failure of this skill. (The cards-and-data question in step 3
is **not** subject to this rule — always ask it, since only the user knows their compute and data.)

---

## PapersWithCode usage

`scripts/pwc_search.sh "<query>" [papers|datasets|methods]` curls the **live PapersWithCode API at
`https://paperswithcode.co/api/v1/...`** (the old `.com` was retired; override with `PWC_BASE` if it
moves again) and prints compact JSON (papers: id/title/arxiv_id/url; datasets: id/name/slug;
methods: id/name/description). The `papers/`, `datasets/`, and `methods/` endpoints work; there is no
`search/` or `sota/` endpoint — for a benchmark leaderboard, pull the top `papers` hits plus a
targeted `WebSearch`/`WebFetch` of the benchmark page. The script exits non-zero with a one-line
notice if the API is unreachable or returns nothing — when it does, **fall back** to `WebSearch` +
arXiv + HF Papers and note the fallback in `RESEARCH.md`. Never hang on a dead endpoint.

---

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

---

## Experiment budget

Always write `BUDGET.md` at step 3, even for a small matrix. It bounds the fan-out and the
keep/discard loop:

```
metric                = <name>     # e.g. val_bpb | val_loss | accuracy
direction             = lower|higher   # which way is better
seed_experiments      = N          # size of the generation-0 matrix from PLAN.md
seconds_per_experiment = S         # fixed wall-clock train budget per experiment (karpathy default ~300)
parallelism           = P          # concurrent experiments (≤ workflow cap of 16; lower if VRAM-bound)
compute_cap           = H          # total GPU-hours OR wall-clock-hours for the whole run
# --- generational loop (long-running) ---
max_generations       = G          # hard cap on generations (the long-run bound)
hypotheses_per_gen    = K          # how many proposals survive critique → run, per generation
proposers             = Pn         # parallel proposer teams per generation (each assigned a distinct angle)
critics               = Cn         # peer critics per proposal round (critique-before-compute)
stagnation            = St         # exit after this many no-new-champion generations
--- spent ---
generations_run = 0
experiments_run = 0
gpu_min_used    = 0
best_metric     = <baseline>
champion        = <none yet>
```

Defaults when the user gives nothing: `seed_experiments=6`, `seconds_per_experiment=300`,
`parallelism=4` (or 1 on a single local GPU), `compute_cap=2 GPU-h`, `max_generations=8`,
`hypotheses_per_gen=4`, `proposers=3`, `critics=3`, `stagnation=3`. For a one-round run set
`max_generations=1` (degenerates to the single-pass template). Scale `max_generations`/`compute_cap`
up for "overnight" / "for days" requests. Update the `spent` block as experiments finish. **Stop
launching new experiments the moment a *compute/token cap* is hit** — part of the doom-loop guard, not
optional. But note the asymmetry: hitting `max_generations` or `stagnation` is **not** a cap — it is a
signal to climb the lever ladder and relaunch (see Autonomy mandate). Only the `compute_cap` / token
budget actually ends the run early.

Note on proposer angles: with `proposers=3` and angles A–J available, assign the three most under-
represented angles in `IDEA_ANGLES.md` to the three proposers. As angles get exhausted, rotate to
the next under-represented ones. Angle I (GitHub tricks) and G (cross-domain) are always valid
fallback angles — re-run the GitHub search with the current champion as the query term before
claiming an angle is exhausted.

---

## `EXPERIMENTS.md` ledger

The orchestrator maintains this table — it is the source for the `RESULTS.md` comparison and
`leaderboard.md`:

```
| exp_id | angle | change (one line) | source (url) | status | metric | delta | verified | seconds | note |
|--------|-------|-------------------|--------------|--------|--------|-------|----------|---------|------|
| 0      | —     | baseline          | —            | passed | <base> | 0     | n/a      |         |      |
```

`angle` uses the letter from the taxonomy (A–J). `source` is the URL from `DEEPRESEARCH.md` that
suggested the idea. `status` ∈ `queued | running | passed | failed | dropped`. `verified` is
`yes|no|n/a`. A row is a **kept winner** only when `delta` moves in the wanted `direction` **and**
`verified=yes`. The angle column lets you spot at a glance which parts of the search space are
over/under-explored.

---

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

---

## Doom-loop guard

If you make the same tool call (same args, same effect) **3 times in a row** with no new information,
**stop**, write what's stuck to `BLOCKER.md`, fire `notify.sh blocker "<one-line>"`, and ask the
user. Never silently retry forever — and never relaunch a failing workflow more than twice.

---

## Permission posture

- Headless / `-p`: auto-approve safe ops (`mkdir`, `python -m py_compile`, `pip install`, training,
  `scripts/*.sh`, `gh search`). Never run `rm -rf`, `git push --force`, or `kill -9` without explicit
  instruction.
- Interactive: ask before destructive ops.
- Network downloads (HF/Kaggle datasets, model weights) are allowed. GitHub API calls via `gh` are
  allowed — they are read-only searches.

---

## Context discipline

- `DEEPRESEARCH.md`, `RESEARCH.md`, `PLAN.md`, `program.md`, `FINDINGS.md`, `IDEA_ANGLES.md` are for
  humans skimming later: bullets, URLs, tables — no dumps. `DEEPRESEARCH.md` keeps citations;
  `RESEARCH.md` is the distilled layer; `IDEA_ANGLES.md` is the living taxonomy of explored vs
  unexplored idea space; `FINDINGS.md`/`board.jsonl` is the shared board the agent teams read+write
  each generation. The dynamic workflow keeps the champion / seen-set / per-experiment results in
  script variables, **not** your context — only the structured per-generation summaries cross into it.
- Never paste >50 lines of a dataset / log / file into chat; use `head`, `tail`, `wc -l`, `grep`.
- If context is filling: write to `~/autoresearch-runs/<slug>/notes/` and move on.

---

## Publishing to HF Hub (optional, after a verified winner)

When the user wants the winning config shipped, reuse **ml-intern's** `hf_push.sh` on the winning
experiment dir (it holds `ckpts/`, logs, config):

```
bash ~/.claude/skills/ml-intern/scripts/hf_push.sh ~/autoresearch-runs/<slug>/exp-<winner> <slug>
```

Copy `RESULTS.md` / `PLAN.md` / `RESEARCH.md` / `IDEA_ANGLES.md` into `exp-<winner>/` first so the
bundle is complete. No `HF_TOKEN` (in ml-intern's `.env`) → fire `blocker` and skip publishing; don't
push to anon.

---

## Done conditions

A run is **done** when the generational loop hits an exit condition (`max_generations`, `stagnation`,
or budget) and:
- `BUDGET.md`, `EXPERIMENTS.md`, `leaderboard.md`, `IDEA_ANGLES.md`, and the shared board
  (`FINDINGS.md` + `board.jsonl`) exist; every experiment is `passed`, `dropped`, or `failed` (none
  left `running`), or the budget cap was hit and remaining experiments are recorded as not-run.
- `RESULTS.md` exists naming the **best verified config** with the comparison table (including the
  `angle` column) — **or**, in design-only mode, the experiment matrix + runnable harness + run
  instructions.
- `notify.sh train_done "<best metric> @ <slug>"` fired (or `approval_required` for design-only).

If **no** experiment beats the baseline after the budget is exhausted, the run is still done — say so
plainly in `RESULTS.md` (baseline stands, with the negative results table and which angles were
covered vs which weren't), and fire `train_done` with `"baseline unbeaten"`. Do not fabricate a winner.
