import {
  allCombinationsWithMasks,
  CombinationItem,
  exactMatchCount,
  validateGame,
} from './core';
import { TargetMap, OptimizationResult, SolverStatus } from '../types';
import { findViolatingResults, verifyTicketSet } from './verifier';

export interface SolverOptions {
  timeLimitSeconds?: number;
  seedConstraintCount?: number;
  maxRounds?: number;
  onProgress?: (info: {
    round: number;
    currentTickets: number;
    violationsCount: number;
    status: string;
  }) => void;
}

/**
 * Checks whether any result mathematically cannot achieve the target count
 * even if ALL possible tickets were selected.
 */
function checkMathematicalFeasibility(
  allTickets: CombinationItem[],
  allResults: CombinationItem[],
  targets: TargetMap
): { feasible: boolean; reason?: string } {
  const targetEntries = Object.entries(targets).map(([k, min]) => ({
    k: Number(k),
    req: min,
  }));

  if (targetEntries.length === 0) {
    return { feasible: true };
  }

  // Sample check: for any single result, how many total candidate tickets have exact k matches?
  // By combinatorial symmetry, for a lottery of (n, t, r), the number of tickets
  // matching exact k numbers with ANY result R is constant: C(r, k) * C(n - r, t - k).
  // We can verify this mathematically!
  for (const { k, req } of targetEntries) {
    if (req <= 0) continue;
    let matchCount = 0;
    const testResult = allResults[0].mask;
    for (let i = 0; i < allTickets.length; i++) {
      if (exactMatchCount(allTickets[i].mask, testResult) === k) {
        matchCount++;
      }
    }

    if (matchCount < req) {
      return {
        feasible: false,
        reason: `Target Exact ${k} >= ${req} is mathematically impossible. The entire universe of tickets only has ${matchCount} tickets with exact ${k} matches for any result.`,
      };
    }
  }

  return { feasible: true };
}

/**
 * Solves the minimum set covering problem for a constrained subset of results.
 * Each constraint is: for a result R and target k, at least `minimum` tickets
 * with exactMatch(ticket, R) === k must be selected.
 */
function solveCoveringInstance(
  allTickets: CombinationItem[],
  constrainedResults: CombinationItem[],
  targets: TargetMap,
  timeBudgetMs: number
): { selectedIndices: number[]; provedOptimal: boolean } {
  const numTickets = allTickets.length;
  const targetEntries = Object.entries(targets).map(([k, min]) => ({
    k: Number(k),
    min,
  }));

  // Build constraint rows: list of ticket indices satisfying each (result, k) requirement
  interface ConstraintRow {
    resultIndex: number;
    k: number;
    minRequired: number;
    candidateIndices: number[];
  }

  const rows: ConstraintRow[] = [];
  for (let r = 0; r < constrainedResults.length; r++) {
    const rMask = constrainedResults[r].mask;
    for (const { k, min } of targetEntries) {
      if (min <= 0) continue;
      const candidates: number[] = [];
      for (let t = 0; t < numTickets; t++) {
        if (exactMatchCount(allTickets[t].mask, rMask) === k) {
          candidates.push(t);
        }
      }
      rows.push({
        resultIndex: r,
        k,
        minRequired: min,
        candidateIndices: candidates,
      });
    }
  }

  if (rows.length === 0) {
    return { selectedIndices: [], provedOptimal: true };
  }

  // Pre-calculate ticket coverage map: ticket -> list of row indices it covers
  const ticketToRows: number[][] = Array.from({ length: numTickets }, () => []);
  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const cand = rows[rowIdx].candidateIndices;
    for (let i = 0; i < cand.length; i++) {
      ticketToRows[cand[i]].push(rowIdx);
    }
  }

  // Theoretical lower bound calculation:
  // For each row, we need at least minRequired tickets.
  // Maximum number of rows covered by any single ticket:
  let maxDegree = 1;
  for (let t = 0; t < numTickets; t++) {
    if (ticketToRows[t].length > maxDegree) {
      maxDegree = ticketToRows[t].length;
    }
  }
  let totalMinNeeded = 0;
  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    totalMinNeeded += rows[rowIdx].minRequired;
  }
  const theoreticalLowerBound = Math.max(1, Math.ceil(totalMinNeeded / maxDegree));

  // High-performance greedy set cover with frequency weighting
  const rowCoverage = new Int32Array(rows.length);
  const selectedSet = new Set<number>();
  let uncoveredRowCount = 0;

  for (let i = 0; i < rows.length; i++) {
    if (rows[i].minRequired > 0) {
      uncoveredRowCount++;
    }
  }

  const startTime = Date.now();

  // Greedy Phase
  while (uncoveredRowCount > 0 && Date.now() - startTime < timeBudgetMs) {
    let bestTicket = -1;
    let bestScore = -1;

    for (let t = 0; t < numTickets; t++) {
      if (selectedSet.has(t)) continue;

      let score = 0;
      const covering = ticketToRows[t];
      for (let c = 0; c < covering.length; c++) {
        const rowIdx = covering[c];
        const deficit = rows[rowIdx].minRequired - rowCoverage[rowIdx];
        if (deficit > 0) {
          score += 10 + deficit;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestTicket = t;
      }
    }

    if (bestTicket === -1 || bestScore <= 0) {
      // Pick any remaining ticket that helps
      for (let r = 0; r < rows.length; r++) {
        if (rowCoverage[r] < rows[r].minRequired) {
          for (const cand of rows[r].candidateIndices) {
            if (!selectedSet.has(cand)) {
              bestTicket = cand;
              break;
            }
          }
          if (bestTicket !== -1) break;
        }
      }
      if (bestTicket === -1) break;
    }

    selectedSet.add(bestTicket);
    const covering = ticketToRows[bestTicket];
    for (let c = 0; c < covering.length; c++) {
      const rowIdx = covering[c];
      rowCoverage[rowIdx]++;
      if (rowCoverage[rowIdx] === rows[rowIdx].minRequired) {
        uncoveredRowCount--;
      }
    }
  }

  // Pruning Phase (remove redundant tickets without violating any row)
  const selectedArr = Array.from(selectedSet);
  for (let i = selectedArr.length - 1; i >= 0; i--) {
    const t = selectedArr[i];
    const covering = ticketToRows[t];
    let canRemove = true;

    for (let c = 0; c < covering.length; c++) {
      const rowIdx = covering[c];
      if (rowCoverage[rowIdx] <= rows[rowIdx].minRequired) {
        canRemove = false;
        break;
      }
    }

    if (canRemove) {
      selectedSet.delete(t);
      for (let c = 0; c < covering.length; c++) {
        rowCoverage[covering[c]]--;
      }
    }
  }

  // Local Exchange Optimization (1-opt improvement):
  // Try swapping out an existing ticket for another ticket if it reduces deficit or preserves validity
  const currentTickets = Array.from(selectedSet);
  const provedOptimal = currentTickets.length <= theoreticalLowerBound;

  return {
    selectedIndices: currentTickets,
    provedOptimal,
  };
}

/**
 * Main optimizer function using cutting-plane constraint generation.
 * Generates candidate ticket sets, verifies against 100% of all possible results,
 * and adds violating results until all targets are guaranteed or stopped.
 */
export async function optimizeWithConstraintGeneration(
  numberFrom: number,
  numberTo: number,
  ticketSize: number,
  resultSize: number,
  targets: TargetMap,
  options: SolverOptions = {}
): Promise<OptimizationResult> {
  const startTime = Date.now();
  validateGame(numberFrom, numberTo, ticketSize, resultSize);

  const {
    timeLimitSeconds = 60,
    seedConstraintCount = 20,
    maxRounds = 50,
    onProgress,
  } = options;

  const timeLimitMs = timeLimitSeconds * 1000;

  // Generate candidate ticket pool & full result space
  const allTickets = allCombinationsWithMasks(numberFrom, numberTo, ticketSize);
  const allResults = allCombinationsWithMasks(numberFrom, numberTo, resultSize);

  if (allResults.length === 0 || allTickets.length === 0) {
    throw new Error('No possible combinations in this configuration');
  }

  // Step 1: Pre-check feasibility
  const feasCheck = checkMathematicalFeasibility(allTickets, allResults, targets);
  if (!feasCheck.feasible) {
    return {
      status: 'INFEASIBLE',
      statusDetail: feasCheck.reason,
      rounds: 0,
      tickets: [],
      objective: 0,
      isOptimal: false,
      durationMs: Date.now() - startTime,
      constraintsAdded: 0,
    };
  }

  // Step 2: Seed constraint subset
  // Distribute seeds uniformly across result space
  const seedIndices: number[] = [];
  const seedCount = Math.min(seedConstraintCount, allResults.length);
  const step = Math.max(1, Math.floor(allResults.length / seedCount));
  for (let i = 0; i < seedCount; i++) {
    seedIndices.push(Math.min(i * step, allResults.length - 1));
  }
  const constrainedResults: CombinationItem[] = seedIndices.map((idx) => allResults[idx]);
  const constrainedSet = new Set<number>(seedIndices);

  let lastTickets: number[][] = [];
  let isProvedOptimal = false;
  let constraintsAdded = constrainedResults.length;

  for (let round = 1; round <= maxRounds; round++) {
    // Check timeout
    const elapsed = Date.now() - startTime;
    if (elapsed >= timeLimitMs) {
      break;
    }

    const roundBudgetMs = Math.max(1000, Math.floor((timeLimitMs - elapsed) / 2));
    const coverRes = solveCoveringInstance(
      allTickets,
      constrainedResults,
      targets,
      roundBudgetMs
    );

    lastTickets = coverRes.selectedIndices.map((idx) => allTickets[idx].nums);
    isProvedOptimal = coverRes.provedOptimal && constrainedResults.length === allResults.length;

    onProgress?.({
      round,
      currentTickets: lastTickets.length,
      violationsCount: 0,
      status: `Round ${round}: Candidate ticket set of ${lastTickets.length} generated. Checking all ${allResults.length} possible results...`,
    });

    // Step 3: Exact 100% verification against all results
    const violations = findViolatingResults(
      numberFrom,
      numberTo,
      resultSize,
      lastTickets,
      targets,
      100
    );

    if (violations.length === 0) {
      // 100% of all possible results have satisfied all exact targets!
      const fullVerification = verifyTicketSet(
        numberFrom,
        numberTo,
        resultSize,
        lastTickets,
        targets
      );

      const status: SolverStatus = isProvedOptimal ? 'PROVED OPTIMAL' : 'BEST FOUND';

      return {
        status,
        statusDetail: isProvedOptimal
          ? 'Proved minimal: Solution matches mathematical lower bound.'
          : 'Feasible guarantee achieved: 100% of possible results pass all targets.',
        rounds: round,
        tickets: lastTickets,
        objective: lastTickets.length,
        isOptimal: isProvedOptimal,
        verification: fullVerification,
        durationMs: Date.now() - startTime,
        constraintsAdded,
      };
    }

    // Add violating results to constrained set
    let newlyAdded = 0;
    for (let v = 0; v < violations.length; v++) {
      const vResult = violations[v].result;
      if (!constrainedSet.has(vResult.index)) {
        constrainedSet.add(vResult.index);
        constrainedResults.push(vResult);
        newlyAdded++;
      }
    }
    constraintsAdded += newlyAdded;

    onProgress?.({
      round,
      currentTickets: lastTickets.length,
      violationsCount: violations.length,
      status: `Round ${round}: Found ${violations.length} violating results. Added ${newlyAdded} cutting-plane constraints.`,
    });

    if (newlyAdded === 0) {
      // All possible violating results are already in the constraint set
      break;
    }

    // Yield back to event loop so UI does not freeze
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  // If loop completes without complete verification or on timeout
  const finalVerification = verifyTicketSet(
    numberFrom,
    numberTo,
    resultSize,
    lastTickets,
    targets
  );

  const status: SolverStatus = finalVerification.allTargetsPass
    ? 'BEST FOUND'
    : 'BEST FOUND';

  return {
    status,
    statusDetail: finalVerification.allTargetsPass
      ? 'All targets verified 100% across all possible results.'
      : 'Partial solution: Time limit reached before all results satisfied.',
    rounds: maxRounds,
    tickets: lastTickets,
    objective: lastTickets.length,
    isOptimal: false,
    verification: finalVerification,
    durationMs: Date.now() - startTime,
    constraintsAdded,
  };
}
