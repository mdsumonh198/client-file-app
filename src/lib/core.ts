// Precomputed 8-bit popcount table for lookup operations
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

/**
 * Exact SWAR popcount on 32-bit unsigned integer.
 * Executes in constant time with zero branches using bit-parallel arithmetic.
 */
export function swarPopcount32(v: number): number {
  v = (v >>> 0);
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/**
 * Exact SWAR popcount on 64-bit BigInt.
 * Executes in constant bitwise steps without looping.
 */
export function swarPopcount64(v: bigint): number {
  v = v & 0xffffffffffffffffn;
  v = v - ((v >> 1n) & 0x5555555555555555n);
  v = (v & 0x3333333333333333n) + ((v >> 2n) & 0x3333333333333333n);
  v = (v + (v >> 4n)) & 0x0f0f0f0f0f0f0f0fn;
  return Number(((v * 0x0101010101010101n) & 0xffffffffffffffffn) >> 56n);
}

export function popcount32(x: number): number {
  return swarPopcount32(x);
}

export interface BitMask {
  lo: number;   // bits 0-31
  hi: number;   // bits 32-63
  big: bigint; // exact 64-bit integer bitmask
}

export function toMask(nums: number[]): BitMask {
  let lo = 0;
  let hi = 0;
  let big = 0n;
  for (let i = 0; i < nums.length; i++) {
    const n = nums[i];
    if (n < 32) {
      lo |= (1 << n);
    } else {
      hi |= (1 << (n - 32));
    }
    big |= (1n << BigInt(n));
  }
  return {
    lo: lo >>> 0,
    hi: hi >>> 0,
    big,
  };
}

/**
 * Computes exact intersection popcount between two combinations.
 * Uses exact 32-bit dual-word SWAR popcount for maximum register throughput.
 */
export function exactMatchCount(a: BitMask, b: BitMask): number {
  return swarPopcount32(a.lo & b.lo) + swarPopcount32(a.hi & b.hi);
}

/**
 * Computes exact intersection popcount using 64-bit BigInt SWAR popcount.
 */
export function exactMatchCount64(a: BitMask, b: BitMask): number {
  return swarPopcount64(a.big & b.big);
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
    numberTo > 60 ||
    numberFrom > numberTo
  ) {
    throw new Error('Number range must satisfy 0 <= Number From <= Number To <= 60');
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

const combinationsCache = new Map<string, CombinationItem[]>();

export function allCombinationsWithMasks(
  numberFrom: number,
  numberTo: number,
  k: number
): CombinationItem[] {
  const cacheKey = `${numberFrom}_${numberTo}_${k}`;
  const cached = combinationsCache.get(cacheKey);
  if (cached) {
    return cached;
  }

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
  // Cache the generated combination space (up to ~500k combinations is < 40MB)
  if (result.length <= 600000) {
    combinationsCache.set(cacheKey, result);
  }
  return result;
}

export function formatNumbers(nums: number[]): string {
  return nums.map((n) => String(n).padStart(2, '0')).join(' ');
}
