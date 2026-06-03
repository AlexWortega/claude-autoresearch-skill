# autoresearch — Claude Code skill

Autonomously research an ML task and run **many bounded experiments** to find the best config — a
fixed-budget `edit → train → eval → keep-or-discard → iterate` loop in the spirit of
[`karpathy/autoresearch`](https://github.com/karpathy/autoresearch), wrapped in the orchestrator
conventions of [`ml-intern`](https://github.com/AlexWortega/claude-ml-intern-skill) and fanned out
with a [Claude Code dynamic workflow](https://code.claude.com/docs/en/workflows).

It **runs long**. Instead of one fixed sweep, it runs an iterative **generational loop** modelled on
[`mims-harvard/AutoScientists`](https://github.com/mims-harvard/AutoScientists): each generation,
**parallel agent teams** read a shared findings board and propose new hypotheses, a **peer-critic
panel prunes them before any GPU is spent**, survivors train + verify, and the board + champion are
updated so the search compounds. The loop keeps going for hours or days until it hits its budget,
stalls (stagnation), or converges.

## What it does

1. **Deep-researches existing solutions first** — runs a fan-out internet survey (the `deep-research`
   workflow/skill when available, else manual multi-angle `WebSearch`/`WebFetch`) plus PapersWithCode
   (`scripts/pwc_search.sh`), arXiv and HF Papers. Cross-checks sources into a cited `DEEPRESEARCH.md`
   covering SOTA methods, benchmark + metric, reference code, and the tricks that already moved the
   metric — which become experiment hypotheses.
2. **Asks where to get the "cards" (GPUs) and the data** — confirms the compute provider
   (Kaggle notebooks / Local GPU / Cloud SSH) and dataset source **before** spending any compute.
3. **Plans an experiment matrix** — writes an editable `program.md` (you program this, not the
   Python) and `PLAN.md` of one-variable-at-a-time hypotheses.
4. **Runs a long generational loop as a background workflow** — parallel teams propose, a peer-critic
   panel prunes before compute, survivors train for a fixed time budget and eval the metric, kept
   winners are adversarially re-verified, and the shared board + champion update each generation. It
   loops until `max_generations`, `stagnation`, or the budget runs out. (For a one-shot sweep, set
   `max_generations=1`.)
5. **Reports the best config** — a leaderboard + shared `FINDINGS.md` board + `RESULTS.md`, optionally
   published to the HF Hub.

If no compute is reachable it falls back to **design-only mode**: it emits the matrix + a runnable
harness for you to run yourself.

## Install

This skill lives at `~/.claude/skills/autoresearch/`. It **reuses ml-intern's scripts** for
notifications and HF publishing, so install [ml-intern](https://github.com/AlexWortega/claude-ml-intern-skill)
too (optional — without it, alerts/publishing are skipped, the research + experiment loop still runs).

## Use

```
/autoresearch beat the val_bpb baseline on enwik8 with a small GPT, 12 experiments x 5min
/autoresearch what improves accuracy on CIFAR-10 with a ResNet-18, kaggle GPU
/autoresearch ablate optimizer choices for a char-RNN on tiny-shakespeare, design-only
/autoresearch run overnight on enwik8 — keep proposing + critiquing until it stops improving
```

## Run layout (`~/autoresearch-runs/<slug>/`)

| file | what |
|------|------|
| `TASK.md` | restated task, unknowns, run mode |
| `DEEPRESEARCH.md` | cited internet survey of existing solutions + tricks |
| `RESEARCH.md` | distilled SOTA table, benchmark+metric, leaderboard, code links |
| `COMPUTE.md` / `DATA.md` | chosen GPU provider / dataset source |
| `BUDGET.md` | metric, #experiments, seconds each, caps, spent |
| `program.md` | the single human-editable run spec (karpathy style) |
| `PLAN.md` | the generation-0 experiment matrix |
| `workflow.js` | generated dynamic-workflow generational loop |
| `FINDINGS.md` / `board.jsonl` | shared board the agent teams read+write each generation |
| `EXPERIMENTS.md` / `leaderboard.md` | ledger + best-so-far champion |
| `exp-<id>/` | per-experiment harness, logs, ckpts |
| `RESULTS.md` | best verified config + comparison table |

## Files

- `SKILL.md` — the behavioral spec (the skill itself).
- `scripts/pwc_search.sh` — PapersWithCode search with graceful web-search fallback.
- `scripts/gpu_probe.sh` — local CUDA / VRAM probe for compute auto-detect.
- `assets/research_loop.template.js` — the long-running generational loop (propose → critique →
  experiment → verify → share), the default fan-out.
- `assets/experiment_workflow.template.js` — single-pass fan-out template (one round, no loop).
- `assets/board.template.md` — the shared `FINDINGS.md` board skeleton.
- `assets/program.template.md` — the editable per-run spec.
- `assets/research_card.template.md` — the `RESEARCH.md` skeleton.
