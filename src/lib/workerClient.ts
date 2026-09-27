import { SolverProgressInfo } from './solver';
import { TargetMap, OptimizationResult } from '../types';

export interface RunOptimizerParams {
  numberFrom: number;
  numberTo: number;
  ticketSize: number;
  resultSize: number;
  targets: TargetMap;
  timeLimitSeconds?: number;
  seedConstraintCount?: number;
  maxRounds?: number;
  onProgress?: (info: SolverProgressInfo) => void;
}

export interface OptimizerController {
  promise: Promise<OptimizationResult>;
  stop: () => void;
  terminate: () => void;
}

/**
 * Runs the optimization task in a separate Web Worker thread.
 * This completely prevents browser main thread freezing and eliminates "Page Unresponsive" dialogs.
 */
export function runOptimizationWithWorker(params: RunOptimizerParams): OptimizerController {
  let worker: Worker | null = null;
  let isTerminated = false;
  let fallbackStop = false;

  const promise = new Promise<OptimizationResult>((resolve, reject) => {
    try {
      worker = new Worker(new URL('../workers/solver.worker.ts', import.meta.url), {
        type: 'module',
      });
    } catch (workerInitErr) {
      console.warn('Web Worker initialization failed, falling back to direct async execution:', workerInitErr);
      import('./solver').then(({ optimizeWithConstraintGeneration }) => {
        optimizeWithConstraintGeneration(
          params.numberFrom,
          params.numberTo,
          params.ticketSize,
          params.resultSize,
          params.targets,
          {
            timeLimitSeconds: params.timeLimitSeconds,
            seedConstraintCount: params.seedConstraintCount,
            maxRounds: params.maxRounds,
            shouldStop: () => fallbackStop,
            onProgress: params.onProgress,
          }
        )
          .then(resolve)
          .catch(reject);
      });
      return;
    }

    worker.onmessage = (event: MessageEvent) => {
      if (isTerminated) return;
      const { type, payload, error } = event.data;
      if (type === 'PROGRESS') {
        params.onProgress?.(payload);
      } else if (type === 'DONE') {
        resolve(payload);
        cleanup();
      } else if (type === 'ERROR') {
        reject(new Error(error || 'Worker optimization failed'));
        cleanup();
      }
    };

    worker.onerror = (err) => {
      console.error('Worker error:', err);
      reject(new Error(err.message || 'Worker execution error occurred'));
      cleanup();
    };

    worker.postMessage({
      type: 'START',
      payload: {
        numberFrom: params.numberFrom,
        numberTo: params.numberTo,
        ticketSize: params.ticketSize,
        resultSize: params.resultSize,
        targets: params.targets,
        timeLimitSeconds: params.timeLimitSeconds,
        seedConstraintCount: params.seedConstraintCount,
        maxRounds: params.maxRounds,
      },
    });

    function cleanup() {
      if (worker) {
        worker.terminate();
        worker = null;
      }
    }
  });

  return {
    promise,
    stop: () => {
      fallbackStop = true;
      if (worker && !isTerminated) {
        worker.postMessage({ type: 'STOP' });
      }
    },
    terminate: () => {
      isTerminated = true;
      fallbackStop = true;
      if (worker) {
        worker.terminate();
        worker = null;
      }
    },
  };
}
