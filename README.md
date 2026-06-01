# autoresearch — Claude Code skill

Autonomously research an ML task and run **many bounded experiments** to find the best config — a
fixed-budget `edit → train → eval → keep-or-discard → iterate` loop in the spirit of
[`karpathy/autoresearch`](https://github.com/karpathy/autoresearch), wrapped in the orchestrator
conventions of [`ml-intern`](https://github.com/AlexWortega/claude-ml-intern-skill) and fanned out
with a [Claude Code dynamic workflow](https://code.claude.com/docs/en/workflows).

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
4. **Runs them as a background workflow** — each experiment trains for a fixed time budget, evals the
   metric, and is kept only if it beats the baseline; winners are adversarially re-verified.
5. **Reports the best config** — a leaderboard + `RESULTS.md`, optionally published to the HF Hub.

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
| `PLAN.md` | the experiment matrix |
| `workflow.js` | generated dynamic-workflow fan-out |
| `EXPERIMENTS.md` / `leaderboard.md` | ledger + best-so-far |
| `exp-<id>/` | per-experiment harness, logs, ckpts |
| `RESULTS.md` | best verified config + comparison table |

## Files

- `SKILL.md` — the behavioral spec (the skill itself).
- `scripts/pwc_search.sh` — PapersWithCode search with graceful web-search fallback.
- `scripts/gpu_probe.sh` — local CUDA / VRAM probe for compute auto-detect.
- `assets/experiment_workflow.template.js` — the dynamic-workflow fan-out template.
- `assets/program.template.md` — the editable per-run spec.
- `assets/research_card.template.md` — the `RESEARCH.md` skeleton.
