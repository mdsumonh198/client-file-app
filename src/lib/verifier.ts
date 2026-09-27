import {
  allCombinationsWithMasks,
  CombinationItem,
  exactMatchCount,
  toMask,
  BitMask,
  swarPopcount32,
} from './core';
import { TargetMap, VerificationReport, ExactMatchStat } from '../types';

export interface Violation {
  result: CombinationItem;
  failedTargets: { [k: number]: { actual: number; required: number } };
  totalDeficit: number; // violation depth for deepest-cut selection
}

/**
 * Verifies a set of tickets against 100% of all possible game results.
 * Guaranteed zero-sample, exhaustive mathematical calculation across the entire combinatorial space.
 */
export function verifyTicketSet(
  numberFrom: number,
  numberTo: number,
  resultSize: number,
  tickets: number[][],
  targets: TargetMap = {}
): VerificationReport {
  const ticketMasks: BitMask[] = tickets.map(toMask);
  const results = allCombinationsWithMasks(numberFrom, numberTo, resultSize);
  const totalResults = results.length;

  if (totalResults === 0 || tickets.length === 0) {
    const emptyStats: Record<number, ExactMatchStat> = {};
    for (let k = 0; k <= resultSize; k++) {
      emptyStats[k] = {
        k,
        min: 0,
        max: 0,
        avg: 0,
        variance: 0,
        stdDev: 0,
        worstResult: [],
        bestResult: [],
        requiredTarget: targets[k],
        passed: targets[k] ? false : true,
      };
    }
    return {
      totalTickets: tickets.length,
      totalResultsChecked: 0,
      stats: emptyStats,
      allTargetsPass: Object.keys(targets).length === 0,
      balanceScore: 0,
    };
  }

  // Pre-allocate tracking arrays for k = 0..resultSize
  const minCounts = new Int32Array(resultSize + 1).fill(tickets.length + 1);
  const maxCounts = new Int32Array(resultSize + 1).fill(-1);
  const sumCounts = new Float64Array(resultSize + 1);
  const sumSqCounts = new Float64Array(resultSize + 1);
  const worstResultIdx = new Int32Array(resultSize + 1).fill(0);
  const bestResultIdx = new Int32Array(resultSize + 1).fill(0);

  // Scratch array for match count per k for current result
  const countsPerK = new Int32Array(resultSize + 1);

  // Exhaustive loop over 100% of all results using exact SWAR popcount
  for (let rIdx = 0; rIdx < totalResults; rIdx++) {
    countsPerK.fill(0);
    const rLo = results[rIdx].mask.lo;
    const rHi = results[rIdx].mask.hi;

    for (let tIdx = 0; tIdx < ticketMasks.length; tIdx++) {
      const k = swarPopcount32(ticketMasks[tIdx].lo & rLo) + swarPopcount32(ticketMasks[tIdx].hi & rHi);
      if (k <= resultSize) {
        countsPerK[k]++;
      }
    }

    for (let k = 0; k <= resultSize; k++) {
      const c = countsPerK[k];
      sumCounts[k] += c;
      sumSqCounts[k] += c * c;

      if (c < minCounts[k]) {
        minCounts[k] = c;
        worstResultIdx[k] = rIdx;
      }
      if (c > maxCounts[k]) {
        maxCounts[k] = c;
        bestResultIdx[k] = rIdx;
      }
    }
  }

  const stats: Record<number, ExactMatchStat> = {};
  let allTargetsPass = true;
  let targetVarianceSum = 0;
  let targetCount = 0;

  for (let k = 0; k <= resultSize; k++) {
    const minVal = minCounts[k] === tickets.length + 1 ? 0 : minCounts[k];
    const maxVal = maxCounts[k] === -1 ? 0 : maxCounts[k];
    const avgVal = sumCounts[k] / totalResults;
    // Exact mathematical variance = E[X^2] - (E[X])^2
    const variance = Math.max(0, (sumSqCounts[k] / totalResults) - (avgVal * avgVal));
    const stdDev = Math.sqrt(variance);

    const req = targets[k];
    const passed = req === undefined ? true : minVal >= req;

    if (!passed) {
      allTargetsPass = false;
    }

    if (req !== undefined) {
      targetVarianceSum += variance;
      targetCount++;
    }

    stats[k] = {
      k,
      min: minVal,
      max: maxVal,
      avg: Number(avgVal.toFixed(4)),
      variance: Number(variance.toFixed(4)),
      stdDev: Number(stdDev.toFixed(4)),
      worstResult: results[worstResultIdx[k]].nums,
      bestResult: results[bestResultIdx[k]].nums,
      requiredTarget: req,
      passed,
    };
  }

  // Priority 3: Balance score (average standard deviation across user targets, lower is more balanced)
  const balanceScore = targetCount > 0 ? Number((targetVarianceSum / targetCount).toFixed(4)) : 0;

  // Identify overall worst-case result: the result that has the minimum match count on highest requested target
  const requestedKeys = Object.keys(targets).map(Number).sort((a, b) => b - a);
  const primaryK = requestedKeys.length > 0 ? requestedKeys[0] : Math.min(resultSize, 3);

  return {
    totalTickets: tickets.length,
    totalResultsChecked: totalResults,
    stats,
    allTargetsPass,
    worstCaseOverallResult: results[worstResultIdx[primaryK]]?.nums || results[0].nums,
    bestCaseOverallResult: results[bestResultIdx[primaryK]]?.nums || results[0].nums,
    balanceScore,
  };
}

/**
 * Separation Oracle: Evaluates ticket set against 100% of combinations.
 * Identifies constraint violations and ranks them by deepest cut (largest deficit).
 */
export function findViolatingResults(
  numberFrom: number,
  numberTo: number,
  resultSize: number,
  tickets: number[][],
  targets: TargetMap,
  maxViolationsToReturn = 75,
  excludeIndices?: Set<number>
): Violation[] {
  const targetEntries = Object.entries(targets).map(([k, min]) => ({
    k: Number(k),
    req: min,
  }));

  if (targetEntries.length === 0 || tickets.length === 0) return [];

  // Flatten ticket masks into typed arrays for maximum V8 JIT throughput
  const tCount = tickets.length;
  const tLo = new Int32Array(tCount);
  const tHi = new Int32Array(tCount);
  for (let i = 0; i < tCount; i++) {
    const m = toMask(tickets[i]);
    tLo[i] = m.lo;
    tHi[i] = m.hi;
  }

  const results = allCombinationsWithMasks(numberFrom, numberTo, resultSize);
  const countsPerK = new Int32Array(resultSize + 1);

  // Deficit buckets: index = deficit value (e.g. 1, 2, 3...)
  // Store up to 120 candidate result indices per bucket to completely eliminate sorting 300k items
  const deficitBuckets: number[][] = [];
  let maxDeficitSeen = 0;

  for (let rIdx = 0; rIdx < results.length; rIdx++) {
    if (excludeIndices && excludeIndices.has(rIdx)) {
      continue;
    }

    countsPerK.fill(0);
    const rLoVal = results[rIdx].mask.lo;
    const rHiVal = results[rIdx].mask.hi;

    for (let tIdx = 0; tIdx < tCount; tIdx++) {
      const k = swarPopcount32(tLo[tIdx] & rLoVal) + swarPopcount32(tHi[tIdx] & rHiVal);
      if (k <= resultSize) {
        countsPerK[k]++;
      }
    }

    let totalDeficit = 0;
    for (let i = 0; i < targetEntries.length; i++) {
      const { k, req } = targetEntries[i];
      const actual = countsPerK[k];
      if (actual < req) {
        totalDeficit += (req - actual);
      }
    }

    if (totalDeficit > 0) {
      if (totalDeficit > maxDeficitSeen) {
        maxDeficitSeen = totalDeficit;
      }
      if (!deficitBuckets[totalDeficit]) {
        deficitBuckets[totalDeficit] = [];
      }
      // Keep bucket bounded so memory stays tiny
      if (deficitBuckets[totalDeficit].length < 150) {
        deficitBuckets[totalDeficit].push(rIdx);
      }
    }
  }

  if (maxDeficitSeen === 0) {
    return [];
  }

  // Gather candidate indices from highest deficit down to lowest
  const candidateIndices: number[] = [];
  for (let def = maxDeficitSeen; def >= 1; def--) {
    const bucket = deficitBuckets[def];
    if (bucket && bucket.length > 0) {
      for (let i = 0; i < bucket.length; i++) {
        candidateIndices.push(bucket[i]);
        if (candidateIndices.length >= maxViolationsToReturn * 2) {
          break;
        }
      }
    }
    if (candidateIndices.length >= maxViolationsToReturn * 2) {
      break;
    }
  }

  // Build Violation objects and apply orthogonal diversification only to selected candidates
  const selectedCuts: Violation[] = [];
  const selectedMasks: BitMask[] = [];

  for (let i = 0; i < candidateIndices.length; i++) {
    const rIdx = candidateIndices[i];
    const rItem = results[rIdx];

    // Recompute exact counts only for these few candidates
    countsPerK.fill(0);
    const rLoVal = rItem.mask.lo;
    const rHiVal = rItem.mask.hi;
    for (let tIdx = 0; tIdx < tCount; tIdx++) {
      const k = swarPopcount32(tLo[tIdx] & rLoVal) + swarPopcount32(tHi[tIdx] & rHiVal);
      if (k <= resultSize) {
        countsPerK[k]++;
      }
    }

    const failedTargets: { [k: number]: { actual: number; required: number } } = {};
    let totalDeficit = 0;
    for (let j = 0; j < targetEntries.length; j++) {
      const { k, req } = targetEntries[j];
      const actual = countsPerK[k];
      if (actual < req) {
        totalDeficit += (req - actual);
        failedTargets[k] = { actual, required: req };
      }
    }

    // Check diversification against existing selected cuts
    let isTooClose = false;
    for (let s = 0; s < selectedMasks.length; s++) {
      const overlap = exactMatchCount(rItem.mask, selectedMasks[s]);
      if (overlap >= resultSize - 1) {
        isTooClose = true;
        break;
      }
    }

    if (!isTooClose || selectedCuts.length + (candidateIndices.length - i) <= maxViolationsToReturn) {
      selectedCuts.push({
        result: rItem,
        failedTargets,
        totalDeficit,
      });
      selectedMasks.push(rItem.mask);
      if (selectedCuts.length >= maxViolationsToReturn) {
        break;
      }
    }
  }

  return selectedCuts;
}
