# Universal Lottery / Combination Optimizer

This package is a clean starter specification + prototype for a configurable lottery/combination wheel optimizer.

## Core Goal
For any game configuration chosen by the user, generate the smallest possible ticket set that satisfies the requested exact-match guarantees for **every possible result**.

Examples of configurable inputs:
- Number range: any subset/range within 0..40
- Ticket size: configurable
- Result size: configurable
- Exact match guarantees: configurable, e.g. exact-5 >= 1, exact-4 >= 10, exact-3 >= 25

## Non-negotiable Requirements
1. The guarantee must be checked against **all possible results**, not random samples.
2. The worst-case result must still satisfy the user's target.
3. Primary objective: satisfy all guarantees.
4. Secondary objective: minimize the number of selected tickets.
5. Tertiary objective: make match counts as balanced as possible across all results.
6. The program must distinguish:
   - PROVED OPTIMAL: mathematical solver proved no smaller solution exists.
   - BEST FOUND: a feasible solution was found, but global minimum was not proved.
7. Never label a solution 'minimum' or 'optimal' without proof.

## Recommended Technology
- Python: main application and orchestration.
- itertools.combinations: generate tickets/results for manageable instances.
- Python int bit masks + int.bit_count(): fast exact-match counting for numbers 0..40.
- NumPy: optional acceleration for batch calculations.
- OR-Tools CP-SAT: default exact optimizer.
- Gurobi: optional advanced solver for difficult MILP instances / proof.
- SCIP: optional exact solver alternative.
- Streamlit: simple UI.
- CSV/XLSX: export ticket sets and verification reports.

## Solver Strategy
For small/medium instances, build the full exact model.
For large instances, use iterative constraint generation (cutting-plane style):

1. Start with a subset of result constraints.
2. Optimize a candidate ticket set.
3. Verify candidate against every possible result.
4. Find any result that violates a requested guarantee.
5. Add that result as a new solver constraint.
6. Repeat until no result violates the target.
7. Report solver status and exact verification statistics.

## Important Meaning of Exact Match
If a ticket and a result share exactly k numbers, that counts as exact-k.
A ticket sharing 5 numbers with a result does NOT count as exact-4.

## UI Inputs
- Number From
- Number To
- Ticket Size
- Result Size
- Exact-match targets (dictionary/table)
- Optimization mode
- Time limit (optional)

## UI Outputs
- Total selected tickets
- Total possible results checked
- For each exact-match level: minimum, maximum, average
- Worst-case result(s)
- Best-case result(s)
- PASS / FAIL per requested target
- Solver status: PROVED OPTIMAL / BEST FOUND / INFEASIBLE
- Export buttons for tickets and verification report

## Run
Install dependencies:

```bash
pip install -r requirements.txt
```

Then run the CLI demo:

```bash
python app.py
```

Or Streamlit UI:

```bash
streamlit run streamlit_app.py
```

## Notes for Developer
This starter is intentionally conservative. It prioritizes exact verification and correctness. For very large combinatorial instances, the number of possible tickets/results may be enormous. The developer should add solver decomposition, symmetry breaking, warm starts, heuristic candidate generation, and optional Gurobi/SCIP backends without weakening exact final verification.
