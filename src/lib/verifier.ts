import {
  allCombinationsWithMasks,
  CombinationItem,
  exactMatchCount,
  toMask,
  BitMask,
} from './core';
import { TargetMap, VerificationReport, ExactMatchStat } from '../types';

export interface Violation {
  result: CombinationItem;
  failedTargets: { [k: number]: { actual: number; required: number } };
}

/**
 * Verifies a set of tickets against 100% of all possible game results.
 * Guaranteed zero-sample, exhaustive calculation.
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
    };
  }

  // Pre-allocate tracking arrays for k = 0..resultSize
  const minCounts = new Int32Array(resultSize + 1).fill(tickets.length + 1);
  const maxCounts = new Int32Array(resultSize + 1).fill(-1);
  const sumCounts = new Float64Array(resultSize + 1);
  const worstResultIdx = new Int32Array(resultSize + 1).fill(0);
  const bestResultIdx = new Int32Array(resultSize + 1).fill(0);

  // Scratch array for count per k for each result
  const countsPerK = new Int32Array(resultSize + 1);

  for (let rIdx = 0; rIdx < totalResults; rIdx++) {
    countsPerK.fill(0);
    const rMask = results[rIdx].mask;

    for (let tIdx = 0; tIdx < ticketMasks.length; tIdx++) {
      const k = exactMatchCount(ticketMasks[tIdx], rMask);
      if (k <= resultSize) {
        countsPerK[k]++;
      }
    }

    for (let k = 0; k <= resultSize; k++) {
      const c = countsPerK[k];
      sumCounts[k] += c;

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

  for (let k = 0; k <= resultSize; k++) {
    const minVal = minCounts[k] === tickets.length + 1 ? 0 : minCounts[k];
    const maxVal = maxCounts[k] === -1 ? 0 : maxCounts[k];
    const avgVal = sumCounts[k] / totalResults;
    const req = targets[k];
    const passed = req === undefined ? true : minVal >= req;

    if (!passed) {
      allTargetsPass = false;
    }

    stats[k] = {
      k,
      min: minVal,
      max: maxVal,
      avg: Number(avgVal.toFixed(3)),
      worstResult: results[worstResultIdx[k]].nums,
      bestResult: results[bestResultIdx[k]].nums,
      requiredTarget: req,
      passed,
    };
  }

  return {
    totalTickets: tickets.length,
    totalResultsChecked: totalResults,
    stats,
    allTargetsPass,
    worstCaseOverallResult: results[worstResultIdx[Math.min(resultSize, 4)]]?.nums || results[0].nums,
    bestCaseOverallResult: results[bestResultIdx[Math.min(resultSize, 4)]]?.nums || results[0].nums,
  };
}

/**
 * Quickly finds violating results that fail any of the specified targets.
 */
export function findViolatingResults(
  numberFrom: number,
  numberTo: number,
  resultSize: number,
  tickets: number[][],
  targets: TargetMap,
  maxViolationsToFind = 250
): Violation[] {
  const ticketMasks: BitMask[] = tickets.map(toMask);
  const results = allCombinationsWithMasks(numberFrom, numberTo, resultSize);
  const targetEntries = Object.entries(targets).map(([k, min]) => ({
    k: Number(k),
    req: min,
  }));

  if (targetEntries.length === 0) return [];

  const violations: Violation[] = [];
  const countsPerK = new Int32Array(resultSize + 1);

  for (let rIdx = 0; rIdx < results.length; rIdx++) {
    countsPerK.fill(0);
    const rMask = results[rIdx].mask;

    for (let tIdx = 0; tIdx < ticketMasks.length; tIdx++) {
      const k = exactMatchCount(ticketMasks[tIdx], rMask);
      if (k <= resultSize) {
        countsPerK[k]++;
      }
    }

    let hasViolation = false;
    const failedTargets: { [k: number]: { actual: number; required: number } } = {};

    for (let i = 0; i < targetEntries.length; i++) {
      const { k, req } = targetEntries[i];
      const actual = countsPerK[k];
      if (actual < req) {
        hasViolation = true;
        failedTargets[k] = { actual, required: req };
      }
    }

    if (hasViolation) {
      violations.push({
        result: results[rIdx],
        failedTargets,
      });
      if (violations.length >= maxViolationsToFind) {
        break;
      }
    }
  }

  return violations;
}
