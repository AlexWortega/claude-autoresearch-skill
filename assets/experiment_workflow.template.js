export const meta = {
  name: 'autoresearch-experiments',
  description: 'Run a matrix of bounded ML experiments, keep the winners, accumulate a leaderboard',
  phases: [
    { title: 'Experiments', detail: 'one subagent per hypothesis: apply diff, train for the time budget, eval the metric' },
    { title: 'Verify', detail: 'adversarially re-check each kept winner before it is trusted' },
  ],
}

// ---------------------------------------------------------------------------
// PLACEHOLDERS — the autoresearch skill substitutes these before running:
//   __RUN_DIR__         absolute path to ~/autoresearch-runs/<slug>
//   __SECONDS__         wall-clock budget per experiment (e.g. 300)
//   __METRIC__          metric name, e.g. "val_bpb" | "val_loss" | "accuracy"
//   __DIRECTION__       "lower" (loss/bpb) or "higher" (accuracy/F1)
//   __EXPERIMENTS_JSON__ a JSON array of {id, hypothesis, change} objects (the matrix from PLAN.md)
// ---------------------------------------------------------------------------
const RUN_DIR = '__RUN_DIR__'
const SECONDS = __SECONDS__
const METRIC = '__METRIC__'
const DIRECTION = '__DIRECTION__'
const EXPERIMENTS = __EXPERIMENTS_JSON__

const RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    exp_id: { type: 'string' },
    metric: { type: 'number', description: `final ${METRIC} on the held-out split` },
    baseline: { type: 'number', description: 'baseline metric this experiment was compared against' },
    delta: { type: 'number', description: 'metric - baseline (sign matters)' },
    keep: { type: 'boolean', description: 'true iff this experiment improved the metric in the wanted direction' },
    seconds_used: { type: 'number' },
    note: { type: 'string', description: 'one line: what changed and what happened' },
    error: { type: ['string', 'null'], description: 'one-line failure cause, or null' },
  },
  required: ['exp_id', 'metric', 'delta', 'keep', 'note'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    exp_id: { type: 'string' },
    reproduced: { type: 'boolean', description: 'did a clean re-run land within noise of the reported metric?' },
    real: { type: 'boolean', description: 'is the improvement real (not a leak / lucky seed / metric bug)?' },
    note: { type: 'string' },
  },
  required: ['exp_id', 'reproduced', 'real'],
}

function improved(delta) {
  return DIRECTION === 'lower' ? delta < 0 : delta > 0
}

log(`autoresearch: ${EXPERIMENTS.length} experiments, ${SECONDS}s each, metric=${METRIC} (${DIRECTION} is better)`)

// Pipeline: each experiment trains+evals, then — only if kept — is adversarially verified.
// Verification for experiment A runs while experiment B is still training (no barrier).
const results = await pipeline(
  EXPERIMENTS,
  (exp) =>
    agent(
      [
        `You are running ONE bounded ML experiment inside ${RUN_DIR}.`,
        `Read program.md and PLAN.md there for the baseline and the harness (train.py / eval).`,
        ``,
        `Experiment ${exp.id}: ${exp.hypothesis}`,
        `Concrete change: ${exp.change}`,
        ``,
        `Steps: (1) copy the baseline harness into ${RUN_DIR}/exp-${exp.id}/, (2) apply ONLY this change to train.py,`,
        `(3) train for AT MOST ${SECONDS} seconds of wall-clock, (4) evaluate ${METRIC} on the held-out split,`,
        `(5) compare to the baseline (experiment 0) metric.`,
        `Log step=N ${METRIC}=<val> to ${RUN_DIR}/exp-${exp.id}/train.log. Do NOT dump logs into your reply.`,
        `Return only the structured result. keep=true iff ${METRIC} moved in the ${DIRECTION} direction vs baseline.`,
      ].join('\n'),
      { label: `exp:${exp.id}`, phase: 'Experiments', schema: RESULT_SCHEMA },
    ),
  (res, exp) => {
    if (!res || !res.keep || !improved(res.delta)) return res // discarded → skip verification
    return agent(
      [
        `Adversarially verify a kept experiment in ${RUN_DIR}/exp-${exp.id}/.`,
        `Claimed: ${METRIC}=${res.metric}, delta=${res.delta} vs baseline (improvement).`,
        `Re-run the eval with a different seed and confirm the metric is computed on a truly held-out split`,
        `(no train/val leak, no metric-direction bug, no lucky-seed-only gain). Default to real=false if uncertain.`,
      ].join('\n'),
      { label: `verify:${exp.id}`, phase: 'Verify', schema: VERDICT_SCHEMA },
    ).then((v) => ({ ...res, verdict: v }))
  },
)

const kept = results
  .filter(Boolean)
  .filter((r) => r.keep && improved(r.delta) && (!r.verdict || r.verdict.real))

kept.sort((a, b) => (DIRECTION === 'lower' ? a.metric - b.metric : b.metric - a.metric))

log(`autoresearch: ${kept.length}/${EXPERIMENTS.length} experiments kept after verification`)

return {
  metric: METRIC,
  direction: DIRECTION,
  total: EXPERIMENTS.length,
  kept: kept.map((r) => ({ exp_id: r.exp_id, metric: r.metric, delta: r.delta, note: r.note })),
  best: kept[0] || null,
  all: results.filter(Boolean).map((r) => ({ exp_id: r.exp_id, metric: r.metric, delta: r.delta, keep: r.keep, note: r.note })),
}
