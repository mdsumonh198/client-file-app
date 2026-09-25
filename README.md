# Universal Lottery / Combination Optimizer

This application is an advanced, configurable universal lottery wheel and combination optimizer with 100% exact-match guarantee verification across all possible results.

## Core Features
1. **Configurable Game Parameters**:
   - Number range (0 to 40)
   - Ticket size (k numbers per ticket)
   - Result size (drawn numbers)
2. **Exact-Match Minimum Targets**:
   - Exact-k minimum targets (e.g. Exact 5 >= 1, Exact 4 >= 10, Exact 3 >= 25)
   - Exact-match semantics: precisely k numbers matching.
3. **Exhaustive 100% Verification**:
   - Exhaustively checked against **all possible results** C(n, r), zero sampling.
   - Calculates minimum (worst-case), maximum (best-case), and average hits for each k.
   - Identifies worst-case and best-case result examples.
4. **Guaranteed Status Hierarchy**:
   - **PROVED OPTIMAL**: mathematically proven no smaller ticket set exists.
   - **BEST FOUND**: verified 100% guarantee achieved.
   - **INFEASIBLE**: mathematically impossible target.
5. **Interactive Tools**:
   - Live Draw Simulator to test any hypothetical draw
   - CSV export for tickets (`tickets.csv`) and verification report (`verification.csv`)
