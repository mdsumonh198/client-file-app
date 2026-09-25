// Precomputed 8-bit popcount table for ultra-fast matching
const POPCOUNT8 = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  let c = 0;
  let n = i;
  while (n > 0) {
    c += (n & 1);
    n >>= 1;
  }
  POPCOUNT8[i] = c;
}

export function popcount32(x: number): number {
  return (
    POPCOUNT8[x & 0xff] +
    POPCOUNT8[(x >>> 8) & 0xff] +
    POPCOUNT8[(x >>> 16) & 0xff] +
    POPCOUNT8[(x >>> 24) & 0xff]
  );
}

export interface BitMask {
  lo: number; // bits 0-31
  hi: number; // bits 32-40
}

export function toMask(nums: number[]): BitMask {
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < nums.length; i++) {
    const n = nums[i];
    if (n < 32) {
      lo |= 1 << n;
    } else {
      hi |= 1 << (n - 32);
    }
  }
  return { lo: lo >>> 0, hi: hi >>> 0 };
}

export function exactMatchCount(a: BitMask, b: BitMask): number {
  return popcount32(a.lo & b.lo) + popcount32(a.hi & b.hi);
}

export function validateGame(
  numberFrom: number,
  numberTo: number,
  ticketSize: number,
  resultSize: number
): number {
  if (
    !Number.isInteger(numberFrom) ||
    !Number.isInteger(numberTo) ||
    numberFrom < 0 ||
    numberTo > 40 ||
    numberFrom > numberTo
  ) {
    throw new Error('Number range must satisfy 0 <= Number From <= Number To <= 40');
  }
  const poolSize = numberTo - numberFrom + 1;
  if (!Number.isInteger(ticketSize) || ticketSize < 1 || ticketSize > poolSize) {
    throw new Error(`Invalid ticket size: must be between 1 and pool size (${poolSize})`);
  }
  if (!Number.isInteger(resultSize) || resultSize < 1 || resultSize > poolSize) {
    throw new Error(`Invalid result size: must be between 1 and pool size (${poolSize})`);
  }
  return poolSize;
}

export function combinationCount(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  const c = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= c; i++) {
    result = (result * (n - i + 1)) / i;
  }
  return Math.round(result);
}

export function combinationCountBigInt(n: number, k: number): bigint {
  if (k < 0 || k > n) return 0n;
  if (k === 0 || k === n) return 1n;
  const c = Math.min(k, n - k);
  let res = 1n;
  for (let i = 1; i <= c; i++) {
    res = (res * BigInt(n - i + 1)) / BigInt(i);
  }
  return res;
}

export function allCombinations(numberFrom: number, numberTo: number, k: number): number[][] {
  const result: number[][] = [];
  const range: number[] = [];
  for (let i = numberFrom; i <= numberTo; i++) {
    range.push(i);
  }

  const current: number[] = new Array(k);
  function backtrack(startIdx: number, depth: number) {
    if (depth === k) {
      result.push([...current]);
      return;
    }
    const limit = range.length - (k - depth);
    for (let i = startIdx; i <= limit; i++) {
      current[depth] = range[i];
      backtrack(i + 1, depth + 1);
    }
  }

  backtrack(0, 0);
  return result;
}

export interface CombinationItem {
  index: number;
  nums: number[];
  mask: BitMask;
}

export function allCombinationsWithMasks(
  numberFrom: number,
  numberTo: number,
  k: number
): CombinationItem[] {
  const result: CombinationItem[] = [];
  const range: number[] = [];
  for (let i = numberFrom; i <= numberTo; i++) {
    range.push(i);
  }

  const current: number[] = new Array(k);
  let index = 0;

  function backtrack(startIdx: number, depth: number) {
    if (depth === k) {
      const nums = [...current];
      result.push({
        index: index++,
        nums,
        mask: toMask(nums),
      });
      return;
    }
    const limit = range.length - (k - depth);
    for (let i = startIdx; i <= limit; i++) {
      current[depth] = range[i];
      backtrack(i + 1, depth + 1);
    }
  }

  backtrack(0, 0);
  return result;
}

export function formatNumbers(nums: number[]): string {
  return nums.map((n) => String(n).padStart(2, '0')).join(' ');
}
