import { GameConfig, OptimizationResult, TargetMap } from '../types';
import { SolverProgressInfo } from './solver';

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

  const promise = new Promise<OptimizationResult>(async (resolve, reject) => {
    try {
      const response = await fetch('/api/optimize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          config,
          targets,
          options,
          sessionId,
        }),
        signal: abortController.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Server returned HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // keep uncompleted trailing line in buffer
        buffer = lines.pop() || '';

        let currentEvent = 'message';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          if (trimmed.startsWith('event: ')) {
            currentEvent = trimmed.slice(7).trim();
          } else if (trimmed.startsWith('data: ')) {
            const dataStr = trimmed.slice(6);
            try {
              const parsed = JSON.parse(dataStr);
              if (currentEvent === 'progress') {
                onProgress?.(parsed);
              } else if (currentEvent === 'done') {
                isDone = true;
                resolve(parsed);
                return;
              } else if (currentEvent === 'error') {
                isDone = true;
                reject(new Error(parsed.message || 'Server optimization failed'));
                return;
              }
            } catch (parseErr) {
              console.warn('Failed to parse SSE data packet:', parseErr);
            }
          }
        }
      }

      if (!isDone) {
        reject(new Error('Optimization stream ended unexpectedly without final result.'));
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        reject(new Error('Operation cancelled by user.'));
      } else {
        reject(err);
      }
    }
  });

  const stop = () => {
    fetch('/api/optimize/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    }).catch(() => {});
  };

  const terminate = () => {
    stop();
    abortController.abort();
  };

  return { stop, terminate, promise };
}
