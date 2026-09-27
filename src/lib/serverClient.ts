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

async function pollSessionUntilComplete(
  sessionId: string,
  abortSignal: AbortSignal,
  onProgress?: (info: SolverProgressInfo) => void
): Promise<OptimizationResult> {
  let consecutiveErrors = 0;
  while (!abortSignal.aborted) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (abortSignal.aborted) {
      throw new Error('Operation cancelled by user.');
    }

    try {
      const res = await fetch(`/api/optimize/session/${sessionId}`, { signal: abortSignal });
      if (!res.ok) {
        consecutiveErrors++;
        if (consecutiveErrors > 15) {
          throw new Error('Lost connection to server optimization session.');
        }
        continue;
      }
      consecutiveErrors = 0;
      const data = await res.json();

      if (data.lastProgress) {
        onProgress?.(data.lastProgress);
      }

      if (data.status === 'completed' && data.result) {
        return data.result;
      }

      if (data.status === 'error') {
        throw new Error(data.error || 'Server optimization encountered an error');
      }

      if (data.status === 'stopped') {
        if (data.result) return data.result;
        throw new Error('Server optimization was stopped.');
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error('Operation cancelled by user.');
      }
      consecutiveErrors++;
      if (consecutiveErrors > 15) {
        throw err;
      }
    }
  }

  throw new Error('Operation cancelled by user.');
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
    let pollInterval: any = null;

    const cleanupAndResolve = (result: OptimizationResult) => {
      if (!isDone) {
        isDone = true;
        if (pollInterval) clearInterval(pollInterval);
        resolve(result);
      }
    };

    const cleanupAndReject = (err: any) => {
      if (!isDone) {
        isDone = true;
        if (pollInterval) clearInterval(pollInterval);
        reject(err);
      }
    };

    // Concurrent heartbeat polling every 450ms.
    // Guarantees real-time progress even if proxy buffers the SSE response body!
    pollInterval = setInterval(async () => {
      if (isDone || abortController.signal.aborted) {
        clearInterval(pollInterval);
        return;
      }
      try {
        const res = await fetch(`/api/optimize/session/${sessionId}`, { signal: abortController.signal });
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'initializing') {
            return;
          }
          if (data.lastProgress && !isDone) {
            onProgress?.(data.lastProgress);
          }
          if (data.status === 'completed' && data.result) {
            cleanupAndResolve(data.result);
          } else if (data.status === 'error') {
            cleanupAndReject(new Error(data.error || 'Server optimization failed'));
          } else if (data.status === 'stopped' && data.result) {
            cleanupAndResolve(data.result);
          }
        }
      } catch {
        // Ignore background polling network blips
      }
    }, 450);

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
      let currentEvent = 'message';
      let currentDataLines: string[] = [];

      const dispatchCurrentEvent = () => {
        if (currentDataLines.length === 0) return;
        const dataStr = currentDataLines.join('\n');
        currentDataLines = [];

        try {
          const parsed = JSON.parse(dataStr);
          if (currentEvent === 'progress') {
            if (!isDone) onProgress?.(parsed);
          } else if (currentEvent === 'done') {
            cleanupAndResolve(parsed);
          } else if (currentEvent === 'error') {
            cleanupAndReject(new Error(parsed.message || 'Server optimization failed'));
          }
        } catch (parseErr) {
          console.warn('Failed to parse SSE data packet:', parseErr);
        }
        currentEvent = 'message';
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // keep uncompleted trailing line in buffer
        buffer = lines.pop() || '';

        for (const rawLine of lines) {
          const line = rawLine.replace(/\r$/, '');

          if (line === '') {
            // Empty line marks end of an SSE message block
            dispatchCurrentEvent();
            continue;
          }

          if (line.startsWith(':')) {
            // Comment / heartbeat keepalive line - ignore
            continue;
          }

          if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            currentDataLines.push(line.slice(5).trim());
          }
        }
      }

      // Flush any remaining buffered message
      if (buffer.trim()) {
        const line = buffer.replace(/\r$/, '');
        if (line.startsWith('data:')) {
          currentDataLines.push(line.slice(5).trim());
        }
      }
      dispatchCurrentEvent();

      // If SSE connection closed without a final done event (e.g. proxy timeout / WiFi drop),
      // seamlessly reconnect/poll session on the server instead of failing!
      if (!isDone) {
        try {
          const polledResult = await pollSessionUntilComplete(
            sessionId,
            abortController.signal,
            onProgress
          );
          isDone = true;
          resolve(polledResult);
        } catch (pollErr: any) {
          if (!isDone) {
            reject(pollErr);
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        reject(new Error('Operation cancelled by user.'));
      } else if (!isDone) {
        // Attempt recovery via session poll
        try {
          const polledResult = await pollSessionUntilComplete(
            sessionId,
            abortController.signal,
            onProgress
          );
          isDone = true;
          resolve(polledResult);
        } catch {
          reject(err);
        }
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
