# Difficulty Model Research Guide

This guide is for an engineer or AI agent that has not seen the codebase. It
describes the current difficulty, DAG, and pacing model, the research ideas it
borrows from, and the constraints any future formula change must preserve.

The current implementation is a deterministic evidence and shrinkage model. It
is not a fitted psychometric model, not a learned prerequisite graph, and not an
exact global optimizer. Treat the formulas as explicit heuristics that must be
tested and explained whenever they change.

## Canonical Pipeline

Planner truth flows through these modules in order:

1. `src/core/section-classifier.ts`, `src/core/reading-scope.ts`, and
   `src/core/effective-pages.ts` preserve source TOCs while deriving trusted
   effective reading pages.
2. `src/core/difficulty-evidence.ts` collects seed difficulty, effective page
   burden, topic density, topic rarity, lexical/technical density, chapter/TOC
   evidence, practice signals, local title cues, and metadata confidence.
3. `src/core/difficulty-latent.ts` aggregates evidence into `latentWorkload`,
   `workloadUncertainty`, and `evidenceConfidence`.
4. `src/core/difficulty-calibration.ts` may apply confidence-gated cohort
   calibration while preserving rank order and manual locks.
5. `src/core/workload-profiles.ts`, `src/core/workload-similarity.ts`, and
   `src/core/workload-clusters.ts` build local evidence cohorts and sparse-book
   workload priors.
6. `src/core/difficulty-graph.ts` applies capped graph evidence from
   prerequisites, parent workload, novelty, breadth, and retention.
7. `src/core/difficulty-learner.ts` applies logged minutes/pages with shrinkage.
8. `src/core/learner-actuals.ts` optionally builds book, epoch, or project
   actuals evidence for Bayesian-style partial pooling.
9. `src/core/difficulty.ts` derives planner truth as `scheduleDifficulty` and
   visual truth as `displayDifficulty`.
10. `src/core/relative-pacing.ts` maps schedule difficulty to desired,
   feasible, and final pages/day.
11. `src/core/reading-ramp.ts` and `src/core/day-plan-*` allocate daily work
    under time, floor, max-page, prerequisite, and parallel-cap constraints.

Do not bypass these owners in UI, app commands, selectors, or infra modules.

## Research Landscape

### Latent Workload

`difficulty-latent` is inspired by item response theory and Rasch-style latent
item difficulty, where observed responses are manifestations of an unobserved
trait or burden. The planner adapts that idea loosely: books have an inferred
latent workload from observable metadata, but there is no response matrix and no
statistical fit.

References:

- [Item Response Theory, Columbia Mailman](https://www.publichealth.columbia.edu/research/population-health-methods/item-response-theory)
- [Rasch Modeling, Columbia Mailman](https://www.publichealth.columbia.edu/research/population-health-methods/rasch-modeling)

Contract:

- Evidence confidence must control shrinkage toward neutral.
- Manual difficulty locks must remain exact.
- Weak or uniform evidence may remain clustered; do not force spread just to
  make charts look satisfying.

### Cohort Calibration

`difficulty-calibration` uses rank-normal spacing only after the current cohort
already has enough raw spread and average confidence. This is a calibration
prior, not proof that book difficulties are normally distributed.

Contract:

- Calibration must be confidence-gated.
- It must preserve rank order.
- It must not force spread or manufacture a Gaussian distribution for weak
  evidence.
- It must explain low spread as a diagnostic when the data cannot support
  separation.

### DAG And Knowledge Graph Evidence

The planner DAG encodes ordering and relationships. It is not, by itself,
global evidence that deeper books are intrinsically harder. Learning-path and
knowledge-graph research supports using prerequisite and semantic relationships
as structural constraints, but those relationships must be interpreted with
confidence and context.

References:

- [Personalized Learning Path Recommendation Based on Knowledge Graphs: A Survey](https://www.mdpi.com/2079-9292/15/1/238)
- [Bayesian Knowledge Tracing original lineage](https://github.com/myudelson/hmm-scalable/blob/master/papers/CorbettAnderson1995.pdf)

Contract:

- DAG depth is an availability/order signal by default.
- Difficulty propagation may use depth only when there is independent
  progressive-chain evidence: shared topic cluster, explicit volume/series
  structure, strong prerequisite relation, and local monotonic evidence.
- A research/reference/deferred book must not become hard merely because it is
  scheduled late.
- An arbitrarily deep DAG must not saturate difficulty by construction.
- Distinguish prerequisite order, topical relatedness, intrinsic workload,
  learner calibration, and pacing.

### Cognitive Load And Pacing

`relative-pacing` and `reading-ramp` translate workload into page targets.
Cognitive load theory motivates treating dense, highly interactive technical
material as slower per page. Practice and spacing literature motivates easing
early sessions and ramping toward the base target, with damping for very hard
content.

References:

- [Element interactivity and cognitive load](https://pmc.ncbi.nlm.nih.gov/articles/PMC6099118/)
- [Cepeda et al. 2006 distributed practice review](https://laplab.ucsd.edu/articles/Cepeda_etal_2006.pdf)

Contract:

- Page/day variance should primarily follow workload, minutes/page, evidence
  confidence, profile policy, and feasibility.
- Display difficulty mapping must not change schedule truth.
- Final page allocation must expose whether floors, max pages, time, manual
  windows, or parallel slots bound the outcome.

### Actuals And Partial Pooling

`difficulty-learner` and `learner-actuals` treat logged pages/minutes as
evidence about observed pace. The default is book-local because one book read
ahead may be idiosyncratic: the book may be easier, the session may have been
unusually focused, or the user may have skimmed. Epoch/project propagation is
therefore opt-in and uses partial pooling: group evidence contributes only
after multiple books show the same faster/slower direction, and its cap is lower
than direct book evidence.

References:

- [Bayesian Knowledge Tracing overview](https://www.mdpi.com/2624-8611/5/3/50)
- [Individualized Bayesian Knowledge Tracing](https://www.cs.cmu.edu/~ggordon/yudelson-koedinger-gordon-individualized-bayesian-knowledge-tracing.pdf)
- [Empirical Bayes shrinkage](https://www.mdpi.com/1660-4601/7/2/380)
- [Logistic Knowledge Tracing](https://arxiv.org/abs/2005.00869)

Contract:

- `book_only` must remain the default.
- `epoch_partial_pooling` may use only books in the same study epoch: the
  longest contiguous plan window with the same unique automatic book set.
- `project_partial_pooling` must be weaker and require broader evidence.
- One outlier must not move other books.
- Mixed faster/slower evidence must be quarantined and explained.
- Manual difficulty locks may contribute observed evidence but must not receive
  calibration lift.

### Scheduling

The schedule and day-plan modules resemble resource-constrained project
scheduling: books are activities, prerequisites are precedence constraints,
calendar time and `par` are resources, and objective choices determine order.
The production planner is deterministic and heuristic unless an explicitly
proved optimizer says otherwise.

References:

- [Hartmann and Briskorn RCPSP survey](https://www.sciencedirect.com/science/article/pii/S0377221721003982)
- [OR-Tools scheduling documentation](https://github.com/google/or-tools/blob/stable/ortools/sat/docs/scheduling.md)

Contract:

- `par` is a hard automatic allocation cap.
- Manual historical progress is preserved even if it exceeds current settings.
- Solver/proof language must state the model and horizon it proves.

## Future Formula Change Checklist

Before changing formulas, audit these files and tests:

- `src/core/difficulty-evidence.ts`
- `src/core/difficulty-latent.ts`
- `src/core/difficulty-calibration.ts`
- `src/core/difficulty-graph.ts`
- `src/core/difficulty-learner.ts`
- `src/core/difficulty.ts`
- `src/core/learner-actuals.ts`
- `src/core/workload-profiles.ts`
- `src/core/workload-similarity.ts`
- `src/core/workload-clusters.ts`
- `src/core/relation-graph-utils.ts`
- `src/core/schedule-order.ts`
- `src/core/schedule-lanes.ts`
- `src/core/day-plan-*`
- `src/core/relative-pacing.ts`
- `src/core/reading-ramp.ts`
- `tests/core/difficulty-pipeline.test.ts`
- `tests/core/page-floor-pacing.test.ts`
- `tests/core/engine-invariants.test.ts`
- `tests/core/workload-clusters.test.ts`
- `tests/core/schedule.test.ts`

Add characterization tests before changing behavior:

- A deep unrelated DAG node does not move toward the difficulty ceiling solely
  from depth.
- A progressive same-topic chain can increase graph lift only when independent
  chain evidence is present.
- A deferred constant-reference book does not become harder merely because it
  starts late.
- Page/day variance responds to schedule difficulty and confidence, not display
  compression.
- Weak evidence remains clustered and emits diagnostics instead of forced
  spread.
- Every book can explain whether DAG evidence changed workload, changed only
  ordering, or had no effect.
- Every learner-calibrated book can explain whether actuals stayed book-local,
  pooled into its study epoch, pooled project-wide, or were ignored due to
  sparse/mixed evidence.
- Every plan item can explain why max pages were unreachable: time budget,
  floor, ramp, confidence, profile policy, manual window, or parallel cap.

## Non-Goals

- Do not add book-specific rules.
- Do not treat title words such as "Introduction" or "Expert" as global truth.
- Do not make graph depth a monotonic difficulty function.
- Do not tune page/day spread by changing display difficulty.
- Do not hide uncertainty by stretching scores.

The desired direction is statistically tractable and evidence-gated: let
natural difficulty fall out of documented evidence, and expose uncertainty when
the evidence cannot justify a stronger claim.
