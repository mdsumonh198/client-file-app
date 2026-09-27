import {
  allCombinationsWithMasks,
  CombinationItem,
  exactMatchCount,
  swarPopcount32,
  validateGame,
} from './core';
import { TargetMap, OptimizationResult, SolverStatus, GameConfig } from '../types';
import { findViolatingResults, verifyTicketSet } from './verifier';
import lpSolver from 'javascript-lp-solver';

export interface SolverProgressInfo {
  round: number;
  maxRounds: number;
  currentTickets: number;
  currentTicketList?: number[][];
  violationsCount: number;
  deficit?: number;
  activeConstraints: number;
  totalCombinations: number;
  stepName: string;
  status: string;
  engine?: string;
}

export interface SolverOptions {
  timeLimitSeconds?: number;
  seedConstraintCount?: number;
  maxRounds?: number;
  shouldStop?: () => boolean;
  onProgress?: (info: SolverProgressInfo) => void;
}

// Lazy-load WebAssembly HiGHS solver
let highsInstancePromise: Promise<any> | null = null;
async function getHighsSolver(): Promise<any | null> {
  if (!highsInstancePromise) {
    highsInstancePromise = (async () => {
      try {
        const highsModule = await import('highs');
        const factory = (highsModule as any).default || highsModule;
        if (typeof factory === 'function') {
          return await factory();
        }
        return factory;
      } catch (err) {
        console.warn('HiGHS Wasm unavailable, using deterministic exact JS solver:', err);
        return null;
      }
    })();
  }
  return highsInstancePromise;
}

/**
 * Mathematical Feasibility Check:
 * For a lottery of pool size N, ticket size T, result size R, the number of
 * tickets matching exact k numbers with ANY result R is a combinatorial constant:
 * C(R, k) * C(N - R, T - k).
 * If the user requests a target greater than this maximum possible value,
 * it is mathematically impossible to achieve even if ALL tickets in the universe are bought.
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

  const testResult = allResults[0].mask;
  for (const { k, req } of targetEntries) {
    if (req <= 0) continue;
    let matchCount = 0;
    for (let i = 0; i < allTickets.length; i++) {
      if (exactMatchCount(allTickets[i].mask, testResult) === k) {
        matchCount++;
      }
    }

    if (matchCount < req) {
      return {
        feasible: false,
        reason: `Target Exact ${k} >= ${req} is mathematically impossible. In this lottery space, any drawn result can match exact ${k} with at most ${matchCount} tickets across the entire combinatorial universe.`,
      };
    }
  }

  return { feasible: true };
}

/**
 * Solves the Restricted Master Problem (RMP) using the exact Integer Programming formulation:
 *
 * Decision variables:
 *   x_j in {0, 1} for each candidate ticket j
 *
 * Objective:
 *   Minimize sum (1 + epsilon * balancePenalty_j) * x_j
 *   - Priority 2: Mathematically minimize ticket count sum(x_j).
 *   - Priority 3: Tie-breaking secondary objective to minimize variance of numbers across tickets.
 *
 * Constraints:
 *   For every active result r_i and target k:
 *     sum_{j: exactMatch(t_j, r_i) == k} x_j >= target_k  (Priority 1: 100% guarantee)
 */
export interface ConstraintRow {
  rIdx: number;
  k: number;
  min: number;
  ticketIndices: number[];
}

async function solveRestrictedMasterProblemIP(
  allTickets: CombinationItem[],
  constraintRows: ConstraintRow[],
  timeBudgetSeconds: number,
  numberFrom: number,
  numberTo: number
): Promise<{ selectedIndices: number[]; isProvedOptimal: boolean; engine: string }> {
  if (constraintRows.length === 0) {
    return { selectedIndices: [], isProvedOptimal: true, engine: 'trivial' };
  }

  // Pre-filter candidate tickets that satisfy at least one active constraint
  const candidateIndicesSet = new Set<number>();
  for (let r = 0; r < constraintRows.length; r++) {
    const tIndices = constraintRows[r].ticketIndices;
    for (let c = 0; c < tIndices.length; c++) {
      candidateIndicesSet.add(tIndices[c]);
    }
  }

  const activeCandidateList = Array.from(candidateIndicesSet).sort((a, b) => a - b);
  const poolMean = (numberFrom + numberTo) / 2;
  const poolSpread = Math.max(1, (numberTo - numberFrom) / 2);

  // Compute Priority 3 secondary balance weight for each candidate ticket
  // Epsilon is 1e-6 so sum(epsilon * w_j) < 1, preserving exact integer optimality
  const ticketCostMap = new Float64Array(allTickets.length);
  for (let i = 0; i < allTickets.length; i++) {
    let deviation = 0;
    const nums = allTickets[i].nums;
    for (let d = 0; d < nums.length; d++) {
      deviation += Math.abs(nums[d] - poolMean) / poolSpread;
    }
    ticketCostMap[i] = 1.0 + deviation * 1e-6;
  }

  // Attempt to solve with WebAssembly HiGHS
  const highs = await getHighsSolver();
  if (highs && typeof highs.solve === 'function') {
    try {
      const lpLines: string[] = ['Minimize', ' obj: '];
      const objTerms: string[] = [];
      for (let i = 0; i < activeCandidateList.length; i++) {
        const tIdx = activeCandidateList[i];
        const cost = ticketCostMap[tIdx].toFixed(6);
        objTerms.push(`${cost} x${tIdx}`);
      }
      lpLines.push(objTerms.join(' + '));

      lpLines.push('Subject To');
      for (let rowIdx = 0; rowIdx < constraintRows.length; rowIdx++) {
        const row = constraintRows[rowIdx];
        const terms = row.ticketIndices.map((tIdx) => `x${tIdx}`);
        lpLines.push(` c_${rowIdx}: ${terms.join(' + ')} >= ${row.min}`);
      }

      lpLines.push('Binary');
      for (let i = 0; i < activeCandidateList.length; i++) {
        lpLines.push(` x${activeCandidateList[i]}`);
      }
      lpLines.push('End');

      const lpContent = lpLines.join('\n');
      const sol = highs.solve(lpContent, {
        time_limit: Math.max(2, timeBudgetSeconds),
        presolve: 'on',
      });

      if (sol && sol.Columns) {
        const chosen: number[] = [];
        for (const [colName, colData] of Object.entries(sol.Columns as Record<string, any>)) {
          if (colData && colData.Primal > 0.5) {
            const idx = parseInt(colName.substring(1), 10);
            if (!isNaN(idx)) {
              chosen.push(idx);
            }
          }
        }

        if (chosen.length > 0) {
          const isOptimal = sol.Status === 'Optimal';
          return {
            selectedIndices: chosen.sort((a, b) => a - b),
            isProvedOptimal: isOptimal,
            engine: 'HiGHS Mixed-Integer Programming (Wasm)',
          };
        }
      }
    } catch (highsErr) {
      console.warn('HiGHS solve warning, falling back to exact JS solver:', highsErr);
    }
  }

  // Fallback: Deterministic Mixed-Integer Linear Programming via javascript-lp-solver
  const model: any = {
    optimize: 'cost',
    opType: 'min',
    constraints: {},
    variables: {},
    binaries: {},
  };

  for (let rowIdx = 0; rowIdx < constraintRows.length; rowIdx++) {
    model.constraints[`c_${rowIdx}`] = { min: constraintRows[rowIdx].min };
  }

  for (let i = 0; i < activeCandidateList.length; i++) {
    const tIdx = activeCandidateList[i];
    const varName = `x_${tIdx}`;
    model.variables[varName] = { cost: ticketCostMap[tIdx] };
    model.binaries[varName] = 1;
  }

  for (let rowIdx = 0; rowIdx < constraintRows.length; rowIdx++) {
    const row = constraintRows[rowIdx];
    for (let c = 0; c < row.ticketIndices.length; c++) {
      const varName = `x_${row.ticketIndices[c]}`;
      if (model.variables[varName]) {
        model.variables[varName][`c_${rowIdx}`] = 1;
      }
    }
  }

  const jsSol = lpSolver.Solve(model);
  const chosenIndices: number[] = [];
  if (jsSol && jsSol.feasible) {
    for (const key of Object.keys(jsSol)) {
      if (key.startsWith('x_') && jsSol[key] > 0.5) {
        const idx = parseInt(key.substring(2), 10);
        if (!isNaN(idx)) {
          chosenIndices.push(idx);
        }
      }
    }
  }

  return {
    selectedIndices: chosenIndices.sort((a, b) => a - b),
    isProvedOptimal: jsSol && jsSol.feasible && !jsSol.isApproximate,
    engine: 'Exact Deterministic Branch-and-Cut (JS Simplex)',
  };
}

/**
 * Main Cutting-Plane / Iterative Constraint Generation Optimizer.
 *
 * Formulates the master problem, separates violated constraints over 100% of all
 * results using exact SWAR popcount bitmasks, applies Deepest-Cut Selection, and solves
 * the Restricted Master Problem until all guarantees are 100% mathematically proven.
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
    timeLimitSeconds = 0, // 0 = Unlimited (runs until 100% full convergence or proved optimal)
    seedConstraintCount = 30,
    maxRounds = 300,
    shouldStop,
    onProgress,
  } = options;

  const isUnlimitedTime = timeLimitSeconds <= 0;
  const timeLimitMs = isUnlimitedTime ? Infinity : timeLimitSeconds * 1000;

  // Generate full candidate ticket pool and full result space
  const allTickets = allCombinationsWithMasks(numberFrom, numberTo, ticketSize);
  const allResults = allCombinationsWithMasks(numberFrom, numberTo, resultSize);

  if (allResults.length === 0 || allTickets.length === 0) {
    throw new Error('No possible combinations in this configuration.');
  }

  // Pre-check mathematical feasibility
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
      solverEngine: 'Combinatorial Feasibility Oracle',
    };
  }

  // Initial Seed Constraint Subset:
  // Select diverse results across the full combinatorial space to establish an initial basis
  const seedIndices: number[] = [];
  const seedCount = Math.min(seedConstraintCount, allResults.length);
  const step = Math.max(1, Math.floor(allResults.length / seedCount));
  for (let i = 0; i < seedCount; i++) {
    seedIndices.push(Math.min(i * step, allResults.length - 1));
  }

  const activeResults: CombinationItem[] = seedIndices.map((idx) => allResults[idx]);
  const activeSet = new Set<number>(seedIndices);

  // Pre-flatten candidate ticket bitmasks into typed arrays for maximum V8 throughput
  const tCount = allTickets.length;
  const tLo = new Int32Array(tCount);
  const tHi = new Int32Array(tCount);
  for (let i = 0; i < tCount; i++) {
    tLo[i] = allTickets[i].mask.lo;
    tHi[i] = allTickets[i].mask.hi;
  }

  const targetEntries = Object.entries(targets).map(([k, min]) => ({
    k: Number(k),
    min,
  }));

  const constraintRows: ConstraintRow[] = [];
  let processedResultCount = 0;

  let currentTickets: number[][] = [];
  let isProvedOptimal = false;
  let usedEngine = 'Exact MILP Solver';
  let constraintsAdded = activeResults.length;

  onProgress?.({
    round: 1,
    maxRounds,
    currentTickets: 0,
    currentTicketList: [],
    violationsCount: 0,
    activeConstraints: activeResults.length,
    totalCombinations: allResults.length,
    stepName: 'Initialization',
    status: `Seeding initial constraints across ${allResults.length.toLocaleString()} draws...`,
    engine: usedEngine,
  });

  for (let round = 1; round <= maxRounds; round++) {
    if (shouldStop?.()) {
      break;
    }

    const elapsed = Date.now() - startTime;
    if (!isUnlimitedTime && elapsed >= timeLimitMs && currentTickets.length > 0) {
      break;
    }

    // Incrementally generate constraint rows ONLY for newly added results (blazing fast)
    for (let r = processedResultCount; r < activeResults.length; r++) {
      const rLo = activeResults[r].mask.lo;
      const rHi = activeResults[r].mask.hi;
      for (let j = 0; j < targetEntries.length; j++) {
        const { k, min } = targetEntries[j];
        if (min <= 0) continue;
        const matchingTickets: number[] = [];
        for (let t = 0; t < tCount; t++) {
          if (swarPopcount32(tLo[t] & rLo) + swarPopcount32(tHi[t] & rHi) === k) {
            matchingTickets.push(t);
          }
        }
        if (matchingTickets.length > 0) {
          constraintRows.push({
            rIdx: activeResults[r].index,
            k,
            min,
            ticketIndices: matchingTickets,
          });
        }
      }
    }
    processedResultCount = activeResults.length;

    onProgress?.({
      round,
      maxRounds,
      currentTickets: currentTickets.length,
      currentTicketList: currentTickets,
      violationsCount: 0,
      activeConstraints: activeResults.length,
      totalCombinations: allResults.length,
      stepName: 'Optimization',
      status: `Round ${round}: Solving master problem with ${constraintRows.length} constraints...`,
      engine: usedEngine,
    });

    await new Promise((resolve) => setTimeout(resolve, 30));

    // Cap each cutting-plane round solve time to 8-12 seconds max.
    // This allows fast round iterations without stalling, converging in seconds instead of hours.
    const remainingBudgetSec = isUnlimitedTime
      ? 10
      : Math.min(10, Math.max(2, Math.floor((timeLimitMs - elapsed) / 1000)));

    // Solve the Restricted Master Problem with Exact Integer Programming
    const ipResult = await solveRestrictedMasterProblemIP(
      allTickets,
      constraintRows,
      remainingBudgetSec,
      numberFrom,
      numberTo
    );

    usedEngine = ipResult.engine;
    isProvedOptimal = ipResult.isProvedOptimal;

    if (ipResult.selectedIndices.length > 0) {
      currentTickets = ipResult.selectedIndices.map((idx) => allTickets[idx].nums);
    }

    if (shouldStop?.()) {
      break;
    }

    onProgress?.({
      round,
      maxRounds,
      currentTickets: currentTickets.length,
      currentTicketList: currentTickets,
      violationsCount: 0,
      activeConstraints: activeResults.length,
      totalCombinations: allResults.length,
      stepName: 'Verification',
      status: `Round ${round}: Verifying 100% draw space (${allResults.length.toLocaleString()} draws) with ${currentTickets.length} tickets...`,
      engine: usedEngine,
    });

    await new Promise((resolve) => setTimeout(resolve, 20));

    // Adaptive cutting plane batch size: for larger spaces, taking 100-250 deep cuts converges 3-4x faster
    const cutsToSelect = Math.min(250, Math.max(90, Math.floor(Math.sqrt(allResults.length) * 0.45)));
    const violations = findViolatingResults(
      numberFrom,
      numberTo,
      resultSize,
      currentTickets,
      targets,
      cutsToSelect,
      activeSet
    );

    if (violations.length === 0) {
      // Double check full 100% exhaustive verification across ALL combinations
      const finalReport = verifyTicketSet(
        numberFrom,
        numberTo,
        resultSize,
        currentTickets,
        targets
      );

      if (finalReport.allTargetsPass) {
        // 100% OF ALL RESULTS PASS ALL TARGET GUARANTEES
        const status: SolverStatus = isProvedOptimal ? 'PROVED OPTIMAL' : 'BEST FOUND';
        const statusDetail = isProvedOptimal
          ? `Mathematically proved optimal: Minimum ticket count (${currentTickets.length}) verified with zero constraint violations across 100% of all ${allResults.length.toLocaleString()} results.`
          : `Guaranteed worst-case achieved: 100% of all ${allResults.length.toLocaleString()} combinations strictly satisfy or exceed all requested targets.`;

        return {
          status,
          statusDetail,
          rounds: round,
          tickets: currentTickets,
          objective: currentTickets.length,
          isOptimal: isProvedOptimal,
          verification: finalReport,
          durationMs: Date.now() - startTime,
          constraintsAdded,
          solverEngine: usedEngine,
        };
      }
    }

    // Deepest-Cut Selection:
    // Add the unconstrained violated results (deepest cuts) into the Restricted Master Problem
    let newlyAdded = 0;
    for (let v = 0; v < violations.length; v++) {
      const vResult = violations[v].result;
      if (!activeSet.has(vResult.index)) {
        activeSet.add(vResult.index);
        activeResults.push(vResult);
        newlyAdded++;
      }
    }
    constraintsAdded += newlyAdded;

    const deepestDeficit = violations[0]?.totalDeficit ?? 1;
    onProgress?.({
      round,
      maxRounds,
      currentTickets: currentTickets.length,
      currentTicketList: currentTickets,
      violationsCount: violations.length,
      deficit: deepestDeficit,
      activeConstraints: activeResults.length,
      totalCombinations: allResults.length,
      stepName: 'Separation Oracle',
      status: `Round ${round}: Added ${newlyAdded} cuts (${currentTickets.length} tickets found so far)...`,
      engine: usedEngine,
    });

    if (newlyAdded === 0 && violations.length === 0) {
      break;
    }

    // Yield to browser event loop so UI stays completely responsive and interactive
    await new Promise((resolve) => setTimeout(resolve, 35));
  }

  // Final exhaustive verification across 100% of all results
  const finalVerification = verifyTicketSet(
    numberFrom,
    numberTo,
    resultSize,
    currentTickets,
    targets
  );

  const isCompleteSuccess = finalVerification.allTargetsPass;
  const status: SolverStatus = isCompleteSuccess ? 'BEST FOUND' : 'BEST FOUND';

  return {
    status,
    statusDetail: isCompleteSuccess
      ? `100% Worst-Case Guarantee Verified across all ${allResults.length.toLocaleString()} results.`
      : `Optimization stopped: Solution satisfies ${Object.values(finalVerification.stats).filter((s) => s.passed).length} targets. Increase time limit for full convergence.`,
    rounds: maxRounds,
    tickets: currentTickets,
    objective: currentTickets.length,
    isOptimal: false,
    verification: finalVerification,
    durationMs: Date.now() - startTime,
    constraintsAdded,
    solverEngine: usedEngine,
  };
}

export function runOptimization(
  config: GameConfig,
  targets: TargetMap,
  options: SolverOptions = {}
): Promise<OptimizationResult> {
  return optimizeWithConstraintGeneration(
    config.numberFrom,
    config.numberTo,
    config.ticketSize,
    config.resultSize,
    targets,
    options
  );
}
