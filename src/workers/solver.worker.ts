import { universalOptimize } from '../lib/universalOptimizer';
import { TargetMap, SolverProgressInfo } from '../types';

let isStopRequested = false;

self.onmessage = async (e: MessageEvent) => {
  const { type, payload } = e.data;

  if (type === 'STOP') {
    isStopRequested = true;
    return;
  }

  if (type === 'START') {
    isStopRequested = false;
    const {
      numberFrom,
      numberTo,
      ticketSize,
      resultSize,
      targets,
      timeLimitSeconds,
      maxRounds,
    } = payload as {
      numberFrom: number;
      numberTo: number;
      ticketSize: number;
      resultSize: number;
      targets: TargetMap;
      timeLimitSeconds?: number;
      maxRounds?: number;
    };

    try {
      const result = await universalOptimize(
        numberFrom,
        numberTo,
        ticketSize,
        resultSize,
        targets,
        {
          timeLimitSeconds,
          maxRounds,
          shouldStop: () => isStopRequested,
          onProgress: (info: SolverProgressInfo) => {
            self.postMessage({ type: 'PROGRESS', payload: info });
          },
        }
      );

      self.postMessage({ type: 'DONE', payload: result });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      self.postMessage({ type: 'ERROR', error: msg });
    }
  }
};
