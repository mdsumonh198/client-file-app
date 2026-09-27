import { GameConfig, OptimizationResult, TargetMap } from '../types';
import { SolverProgressInfo } from './solver';
import { runOptimizationWithWorker } from './workerClient';

export interface ServerOptimizationController {
  stop: () => void;
  terminate: () => void;
  promise: Promise<OptimizationResult>;
}

export interface SystemHardwareInfo {
  cpuCores: number;
  cpuModel: string;
  totalMemoryGB: number;
  freeMemoryGB: number;
  platform: string;
  arch: string;
}

export async function fetchSystemInfo(): Promise<SystemHardwareInfo | null> {
  try {
    const res = await fetch('/api/system-info');
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function runOptimizationWithServer(params: {
  config: GameConfig;
  targets: TargetMap;
  options?: { timeLimitSeconds?: number; maxRounds?: number };
  onProgress?: (info: SolverProgressInfo) => void;
}): ServerOptimizationController {
  const { config, targets, options, onProgress } = params;
  const sessionId = `client_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const abortController = new AbortController();

  let isDone = false;
  let activeEventSource: EventSource | null = null;
  let pollInterval: any = null;
  let workerFallbackController: { stop: () => void; terminate: () => void } | null = null;

  const promise = new Promise<OptimizationResult>(async (resolve, reject) => {
    const cleanupAndResolve = (result: OptimizationResult) => {
      if (!isDone) {
        isDone = true;
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
        if (activeEventSource) {
          activeEventSource.close();
          activeEventSource = null;
        }
        resolve(result);
      }
    };

    const cleanupAndReject = (err: any) => {
      if (!isDone) {
        isDone = true;
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
        if (activeEventSource) {
          activeEventSource.close();
          activeEventSource = null;
        }
        reject(err);
      }
    };

    const switchToWorkerFallback = (reason: string) => {
      if (isDone) return;
      console.warn(`[Server Turbo Engine] ${reason}. Falling back to Browser Web Worker...`);
      onProgress?.({
        round: 0,
        maxRounds: 0,
        currentTickets: 0,
        currentTicketList: [],
        violationsCount: 0,
        activeConstraints: 0,
        totalCombinations: 0,
        stepName: 'Worker Fallback',
        status: `সার্ভার প্রক্সি সীমাবদ্ধতার কারণে স্বয়ংক্রিয়ভাবে লোকাল ব্রাউজার ওয়ার্কারে সুইচ করা হচ্ছে...`,
        engine: 'Browser Worker (Fallback)',
      });

      const workerController = runOptimizationWithWorker({
        numberFrom: config.numberFrom,
        numberTo: config.numberTo,
        ticketSize: config.ticketSize,
        resultSize: config.resultSize,
        targets,
        timeLimitSeconds: options?.timeLimitSeconds,
        maxRounds: options?.maxRounds,
        onProgress,
      });

      workerFallbackController = workerController;
      workerController.promise
        .then(cleanupAndResolve)
        .catch(cleanupAndReject);
    };

    // Step 1: Start background optimization job on the server
    try {
      const startRes = await fetch('/api/optimize/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config,
          targets,
          options,
          sessionId,
        }),
        signal: abortController.signal,
      });

      if (!startRes.ok) {
        switchToWorkerFallback(`Server returned HTTP ${startRes.status}`);
        return;
      }

      const startData = await startRes.json();
      const actualSessionId = startData.sessionId || sessionId;

      // Step 2: Connect native GET EventSource for real-time streaming
      try {
        const es = new EventSource(`/api/optimize/events/${actualSessionId}`);
        activeEventSource = es;

        es.addEventListener('progress', (e: MessageEvent) => {
          if (isDone) return;
          try {
            const parsed = JSON.parse(e.data);
            onProgress?.(parsed);
          } catch {}
        });

        es.addEventListener('done', (e: MessageEvent) => {
          try {
            const parsed = JSON.parse(e.data);
            cleanupAndResolve(parsed);
          } catch {}
        });

        es.addEventListener('error', () => {
          // Keep polling active even if EventSource encounters temporary network hiccup
        });
      } catch (esErr) {
        console.warn('Native EventSource initialization skipped:', esErr);
      }

      // Step 3: Concurrent Heartbeat Polling every 450ms
      // Guarantees zero missed updates even through reverse-proxy buffering
      pollInterval = setInterval(async () => {
        if (isDone || abortController.signal.aborted) {
          if (pollInterval) clearInterval(pollInterval);
          return;
        }

        try {
          const pollRes = await fetch(`/api/optimize/session/${actualSessionId}`, {
            signal: abortController.signal,
          });

          if (pollRes.ok) {
            const data = await pollRes.json();
            if (data.status === 'initializing') {
              return;
            }

            if (data.lastProgress && !isDone) {
              onProgress?.(data.lastProgress);
            }

            if (data.status === 'completed' && data.result) {
              cleanupAndResolve(data.result);
            } else if (data.status === 'error') {
              cleanupAndReject(new Error(data.error || 'Server optimization encountered an error'));
            } else if (data.status === 'stopped' && data.result) {
              cleanupAndResolve(data.result);
            }
          }
        } catch {
          // Ignore transient polling network drops
        }
      }, 450);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        cleanupAndReject(new Error('Operation cancelled by user.'));
      } else {
        switchToWorkerFallback(`Connection error: ${err.message}`);
      }
    }
  });

  const stop = () => {
    if (workerFallbackController) {
      workerFallbackController.stop();
    }
    fetch('/api/optimize/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    }).catch(() => {});
  };

  const terminate = () => {
    if (workerFallbackController) {
      workerFallbackController.terminate();
    }
    stop();
    abortController.abort();
    if (activeEventSource) {
      activeEventSource.close();
      activeEventSource = null;
    }
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  };

  return { stop, terminate, promise };
}
