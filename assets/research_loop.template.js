export const meta = {
  name: 'autoresearch-loop',
  description: 'Long-running generational ML research: propose → peer-critique → experiment → verify → share, looping until budget/stagnation/convergence',
  phases: [
    { title: 'Propose', detail: 'parallel proposer agents (teams) read the shared board and propose new one-variable hypotheses building on the champion' },
    { title: 'Critique', detail: 'peer-critic panel scores proposals and prunes redundant/weak ones BEFORE any GPU is spent' },
    { title: 'Experiments', detail: 'one subagent per surviving hypothesis: apply the diff, train for the time budget, eval the metric' },
    { title: 'Verify', detail: 'adversarially re-check each kept winner before it is trusted' },
    { title: 'Share', detail: 'append results to the shared board, update the champion + leaderboard on disk' },
  ],
}

// ---------------------------------------------------------------------------
// PLACEHOLDERS — the autoresearch skill substitutes these before running:
//   __RUN_DIR__               absolute path to ~/autoresearch-runs/<slug>
//   __SECONDS__               wall-clock train budget per experiment (e.g. 300)
//   __METRIC__                metric name, e.g. "val_bpb" | "val_loss" | "accuracy"
//   __DIRECTION__             "lower" (loss/bpb) or "higher" (accuracy/F1)
//   __SEED_EXPERIMENTS_JSON__ gen-0 matrix from PLAN.md: [{id,hypothesis,change}]
//   __MAX_GENERATIONS__       hard cap on generations (the long-running loop bound)
//   __HYPOTHESES_PER_GEN__    how many fresh hypotheses survive critique each generation
//   __PROPOSERS__             parallel proposer agents (teams) per generation
//   __CRITICS__               peer critics per proposal round (peer-review-before-compute)
//   __STAGNATION__            exit after this many generations with no new champion
//   __BUDGET_TOTAL_MS__       whole-run wall-clock budget in milliseconds (0 = uncapped)
// ---------------------------------------------------------------------------
const RUN_DIR = '__RUN_DIR__'
const SECONDS = __SECONDS__
const METRIC = '__METRIC__'
const DIRECTION = '__DIRECTION__'
const SEED = __SEED_EXPERIMENTS_JSON__
const MAX_GENERATIONS = __MAX_GENERATIONS__
const K = __HYPOTHESES_PER_GEN__
const PROPOSERS = __PROPOSERS__
const CRITICS = __CRITICS__
const STAGNATION = __STAGNATION__
const BUDGET_TOTAL_MS = __BUDGET_TOTAL_MS__
const STARTED_AT = Date.now()
const budget = {
  total: BUDGET_TOTAL_MS,
  remaining: () => (
    BUDGET_TOTAL_MS ? Math.max(0, BUDGET_TOTAL_MS - (Date.now() - STARTED_AT)) : Infinity
  ),
}

const better = (a, b) => (DIRECTION === 'lower' ? a < b : a > b)
const improved = (delta) => (DIRECTION === 'lower' ? delta < 0 : delta > 0)
const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim()

const RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    exp_id: { type: 'string' },
    metric: { type: 'number', description: `final ${METRIC} on the held-out split` },
    baseline: { type: 'number', description: 'baseline/champion metric this experiment was compared against' },
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

const PROPOSAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    hypotheses: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          hypothesis: { type: 'string', description: 'one line: the idea' },
          change: { type: 'string', description: 'the single concrete one-variable change to train.py' },
          rationale: { type: 'string', description: 'why it should move the metric, ideally citing the board/DEEPRESEARCH' },
          builds_on: { type: 'string', description: 'champion exp_id this builds on, or "baseline"' },
        },
        required: ['hypothesis', 'change', 'rationale'],
      },
    },
  },
  required: ['hypotheses'],
}

const CRITIQUE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', description: 'the proposal id being scored' },
          score: { type: 'number', description: '0-10: expected value of running this (impact × plausibility)' },
          novel: { type: 'boolean', description: 'is it genuinely new vs everything already tried on the board?' },
          reason: { type: 'string', description: 'one line' },
        },
        required: ['id', 'score', 'novel'],
      },
    },
  },
  required: ['verdicts'],
}

// --- experiment + adversarial verify for one generation ---------------------
function expPrompt(gen, exp) {
  return [
    `You are running ONE bounded ML experiment inside ${RUN_DIR}.`,
    `Read program.md, PLAN.md, and FINDINGS.md there for the baseline, the harness (train.py / eval), and what has already been tried.`,
    ``,
    `Generation ${gen}, experiment ${exp.id}: ${exp.hypothesis}`,
    `Concrete change: ${exp.change}`,
    ``,
    `Steps: (1) copy the baseline harness into ${RUN_DIR}/exp-${exp.id}/, (2) apply ONLY this change to train.py,`,
    `(3) train for AT MOST ${SECONDS} seconds of wall-clock, (4) evaluate ${METRIC} on the held-out split,`,
    `(5) compare to the current champion's metric (read leaderboard.md; fall back to baseline = experiment 0).`,
    `Log step=N ${METRIC}=<val> to ${RUN_DIR}/exp-${exp.id}/train.log. Do NOT dump logs into your reply.`,
    `Return only the structured result. keep=true iff ${METRIC} moved in the ${DIRECTION} direction vs the comparison metric.`,
  ].join('\n')
}

function verifyPrompt(gen, exp, res) {
  return [
    `Adversarially verify a kept experiment in ${RUN_DIR}/exp-${exp.id}/ (generation ${gen}).`,
    `Claimed: ${METRIC}=${res.metric}, delta=${res.delta} (improvement).`,
    `Re-run the eval with a different seed and confirm the metric is computed on a truly held-out split`,
    `(no train/val leak, no metric-direction bug, no lucky-seed-only gain). Default to real=false if uncertain.`,
  ].join('\n')
}

async function runGeneration(gen, experiments) {
  const results = await pipeline(
    experiments,
    (exp) => agent(expPrompt(gen, exp), { label: `g${gen}/exp:${exp.id}`, phase: 'Experiments', schema: RESULT_SCHEMA }),
    (res, exp) => {
      if (!res || !res.keep || !improved(res.delta)) return res
      return agent(verifyPrompt(gen, exp, res), { label: `g${gen}/verify:${exp.id}`, phase: 'Verify', schema: VERDICT_SCHEMA })
        .then((v) => ({ ...res, verdict: v }))
    },
  )
  return results.filter(Boolean)
}

// --- shared board state (script is the source of truth for control flow) ----
const seen = new Set()
const board = []
let champion = null

function triedSummary() {
  const tried = [...seen]
  const recent = tried.slice(-20)
  return `${tried.length} changes already tried. Most recent:\n` + recent.map((c) => `  - ${c}`).join('\n')
}

function championSummary() {
  if (!champion) return 'no champion yet (baseline stands)'
  return `champion ${champion.exp_id}: ${METRIC}=${champion.metric} (Δ ${champion.delta}) — ${champion.note}`
}

function ingest(gen, results) {
  let newChampion = false
  for (const r of results) {
    const verified = r.keep && improved(r.delta) && (!r.verdict || r.verdict.real)
    board.push({ gen, exp_id: r.exp_id, metric: r.metric, delta: r.delta, keep: r.keep, verified, note: r.note })
    if (verified && (champion === null || better(r.metric, champion.metric))) {
      champion = { exp_id: r.exp_id, metric: r.metric, delta: r.delta, note: r.note, gen }
      newChampion = true
      log(`gen ${gen}: NEW CHAMPION ${r.exp_id} ${METRIC}=${r.metric} (Δ ${r.delta})`)
    }
  }
  return newChampion
}

// === generation 0: seed matrix (no propose / critique) ======================
log(`autoresearch loop: ${METRIC} (${DIRECTION} is better), seed=${SEED.length}, max_gen=${MAX_GENERATIONS}, K=${K}, proposers=${PROPOSERS}, critics=${CRITICS}`)
SEED.forEach((e) => seen.add(norm(e.change)))
ingest(0, await runGeneration(0, SEED))
await agent(
  [
    `Record generation 0 on the shared board in ${RUN_DIR}.`,
    `Append these results as JSONL rows to board.jsonl and update FINDINGS.md (human rollup) + leaderboard.md (best-so-far, sorted ${DIRECTION}).`,
    `Results JSON: ${JSON.stringify(board.filter((b) => b.gen === 0))}`,
    `Current ${championSummary()}.`,
  ].join('\n'),
  { label: `g0/share`, phase: 'Share' },
)

// === generational loop ======================================================
let gen = 1
let stagnant = 0
let dryRounds = 0 // consecutive rung-3 generations that produced nothing new → real convergence
// stagnation does NOT end the loop; it climbs the lever ladder. The loop ends only on budget,
// the per-batch max_generations, or genuine convergence (rung-3 dry for 2 rounds).
while (gen < MAX_GENERATIONS && dryRounds < 2 && (!budget.total || budget.remaining() > 60000)) {
  // rung 1 = tweak champion · rung 2 = orthogonal axis · rung 3 = structural new lever
  const rung = stagnant < STAGNATION ? 1 : stagnant < 2 * STAGNATION ? 2 : 3
  const N = Math.max(2, Math.ceil((K * 1.5) / PROPOSERS))

  // --- PROPOSE: parallel teams read the board, propose fresh hypotheses ------
  const proposePrompt = (t) =>
    [
      `You are proposer team #${t} in generation ${gen} of a long-running ML autoresearch loop, working in ${RUN_DIR}.`,
      `Read program.md, PLAN.md, DEEPRESEARCH.md, FINDINGS.md and leaderboard.md to ground your ideas in what already works and what already failed.`,
      ``,
      `Current ${championSummary()}.`,
      triedSummary(),
      ``,
      rung === 1
        ? `Propose ${N} fresh hypotheses that build on the champion (or open ideas in program.md). Each is exactly ONE variable changed vs the champion/baseline so results stay comparable.`
        : rung === 2
          ? `The champion's family is EXHAUSTED. Propose ${N} ORTHOGONAL hypotheses on a different axis (regularization, data mix, tokenizer, augmentation, schedule) the champion does not touch — still one-variable each.`
          : `The search is STUCK across tweaks AND axes. Propose ${N} STRUCTURAL NEW LEVERS — different methods, not tweaks: replace the algorithm / solver, swap the harness, change the modelling approach (e.g. a learned ranker instead of brute search, a graph/transformer reframe, distillation instead of RL). Each lever is its own new baseline; describe the concrete change to make. Mine DEEPRESEARCH.md "future work" and FINDINGS.md "Next levers" for these.`,
      `Hard rules: do NOT repeat or trivially reword anything already tried; cite the board/DEEPRESEARCH in the rationale where possible.`,
    ].join('\n')

  const batches = await parallel(
    Array.from({ length: PROPOSERS }, (_, t) => () =>
      agent(proposePrompt(t), { label: `g${gen}/propose:${t}`, phase: 'Propose', schema: PROPOSAL_SCHEMA })),
  )
  const fresh = []
  for (const b of batches.filter(Boolean)) {
    for (const p of b.hypotheses || []) {
      const key = norm(p.change)
      if (!key || seen.has(key)) continue
      seen.add(key)
      fresh.push({ ...p, id: `g${gen}-${fresh.length}` })
    }
  }
  if (!fresh.length) {
    log(`gen ${gen}: no fresh hypotheses survived dedup (rung ${rung}) → stagnating`)
    if (rung === 3) dryRounds++
    stagnant++
    gen++
    continue
  }

  // --- CRITIQUE: peer panel prunes BEFORE any GPU is spent -------------------
  const critiquePrompt = (c) =>
    [
      `You are peer critic #${c} in generation ${gen} of an ML autoresearch loop (workspace ${RUN_DIR}).`,
      `Score each proposed hypothesis BEFORE any compute is spent on it, so the team does not waste GPU on redundant or weak ideas.`,
      `Use FINDINGS.md / leaderboard.md as the record of what was already tried. ${championSummary()}.`,
      `Score 0-10 = expected impact × plausibility; novel=false if it duplicates something already on the board.`,
      `Proposals JSON: ${JSON.stringify(fresh.map((p) => ({ id: p.id, hypothesis: p.hypothesis, change: p.change, rationale: p.rationale })))}`,
    ].join('\n')

  const panels = await parallel(
    Array.from({ length: CRITICS }, (_, c) => () =>
      agent(critiquePrompt(c), { label: `g${gen}/critique:${c}`, phase: 'Critique', schema: CRITIQUE_SCHEMA })),
  )
  const agg = {}
  for (const panel of panels.filter(Boolean)) {
    for (const v of panel.verdicts || []) {
      const a = agg[v.id] || (agg[v.id] = { sum: 0, n: 0, novel: 0 })
      a.sum += v.score || 0
      a.n += 1
      if (v.novel) a.novel += 1
    }
  }
  const survivors = fresh
    .map((p) => ({ p, a: agg[p.id] }))
    .filter(({ a }) => a && a.n && a.sum / a.n >= 6 && a.novel * 2 >= a.n)
    .sort((x, y) => y.a.sum / y.a.n - x.a.sum / x.a.n)
    .slice(0, K)
    .map(({ p }) => p)

  log(`gen ${gen}: ${fresh.length} proposed → ${survivors.length} survive peer-critique (rung ${rung})`)
  if (!survivors.length) {
    if (rung === 3) dryRounds++
    stagnant++
    gen++
    continue
  }

  // --- EXPERIMENT + VERIFY ---------------------------------------------------
  const results = await runGeneration(gen, survivors)
  const newChampion = ingest(gen, results)
  dryRounds = 0 // this generation produced runnable ideas → not converged
  stagnant = newChampion ? 0 : stagnant + 1

  // --- SHARE: persist this generation to the board on disk -------------------
  await agent(
    [
      `Record generation ${gen} on the shared board in ${RUN_DIR}.`,
      `Append these results as JSONL rows to board.jsonl, update FINDINGS.md (what was tried, what improved, what to avoid next), and rewrite leaderboard.md (best-so-far, sorted ${DIRECTION}).`,
      `Also maintain a "Next levers" list in FINDINGS.md — structural reframes worth trying if the current axis stalls — so the loop always has somewhere to climb.`,
      `Results JSON: ${JSON.stringify(board.filter((b) => b.gen === gen))}`,
      `Current ${championSummary()} (lever rung ${rung}). ${newChampion ? 'A NEW CHAMPION was crowned this generation.' : `No improvement (${stagnant} stagnant; rung climbs at ${STAGNATION}/${2 * STAGNATION}).`}`,
    ].join('\n'),
    { label: `g${gen}/share`, phase: 'Share' },
  )

  gen++
}

// Why the loop ended. Only 'budget'/'converged' are real stops; 'batch_end' means relaunch
// on the next lever if budget remains (the orchestrator's outer driver, per SKILL.md).
const budgetSpent = budget.total && budget.remaining() <= 60000
const stop = budgetSpent ? 'budget' : dryRounds >= 2 ? 'converged' : 'batch_end'
log(`autoresearch loop done after ${gen} generations (stop=${stop}); ${board.filter((b) => b.verified).length} verified wins`)

const verified = board.filter((b) => b.verified).sort((a, b) => (DIRECTION === 'lower' ? a.metric - b.metric : b.metric - a.metric))
return {
  metric: METRIC,
  direction: DIRECTION,
  generations: gen,
  stop_reason: stop,
  // The orchestrator MUST relaunch (next generation batch / next lever) when this is true,
  // without asking the user — see SKILL.md "Outer driver" + "Autonomy mandate".
  relaunch: stop === 'batch_end',
  champion,
  verified_wins: verified.map((r) => ({ gen: r.gen, exp_id: r.exp_id, metric: r.metric, delta: r.delta, note: r.note })),
  board,
}
