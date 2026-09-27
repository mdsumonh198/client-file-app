import express, { Request, Response } from 'express';
import cors from 'cors';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { runOptimization } from './src/lib/solver';
import { GameConfig, TargetMap, OptimizationResult } from './src/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface OptimizationSession {
  id: string;
  status: 'running' | 'completed' | 'error' | 'stopped';
  stop: () => void;
  lastProgress?: any;
  result?: OptimizationResult;
  error?: string;
  updatedAt: number;
  disconnectTimer?: NodeJS.Timeout;
}

const activeSessions = new Map<string, OptimizationSession>();

// Cleanup stale sessions older than 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, sess] of activeSessions.entries()) {
    if (now - sess.updatedAt > 30 * 60 * 1000) {
      if (sess.disconnectTimer) clearTimeout(sess.disconnectTimer);
      activeSessions.delete(id);
    }
  }
}, 5 * 60 * 1000);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // System Hardware Info endpoint
  app.get('/api/system-info', (_req: Request, res: Response) => {
    const cpus = os.cpus();
    res.json({
      cpuCores: cpus.length,
      cpuModel: cpus[0]?.model || 'Multi-Core Processor',
      totalMemoryGB: Number((os.totalmem() / 1024 ** 3).toFixed(1)),
      freeMemoryGB: Number((os.freemem() / 1024 ** 3).toFixed(1)),
      platform: os.platform(),
      arch: os.arch(),
    });
  });

  // Query active session state (resilient reconnect/polling fallback)
  app.get('/api/optimize/session/:sessionId', (req: Request, res: Response) => {
    const { sessionId } = req.params;
    const session = activeSessions.get(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found or expired' });
      return;
    }
    res.json({
      sessionId: session.id,
      status: session.status,
      lastProgress: session.lastProgress,
      result: session.result,
      error: session.error,
    });
  });

  // Stop / Cancel active session
  app.post('/api/optimize/stop', (req: Request, res: Response) => {
    const { sessionId } = req.body;
    if (sessionId && activeSessions.has(sessionId)) {
      const session = activeSessions.get(sessionId)!;
      session.status = 'stopped';
      session.stop();
      if (session.disconnectTimer) clearTimeout(session.disconnectTimer);
      res.json({ status: 'stopped' });
    } else {
      res.json({ status: 'not_found' });
    }
  });

  // Server-side High-Performance Solver API (Server-Sent Events with persistent state)
  app.post('/api/optimize', async (req: Request, res: Response) => {
    const { config, targets, options, sessionId } = req.body as {
      config: GameConfig;
      targets: TargetMap;
      options?: { timeLimitSeconds?: number; maxRounds?: number };
      sessionId?: string;
    };

    if (!config || !targets) {
      res.status(400).json({ error: 'Missing config or targets' });
      return;
    }

    // Disable socket timeouts so long-running MIP optimizations are never killed
    req.socket.setTimeout(0);
    req.socket.setKeepAlive(true, 1000);
    res.setTimeout(0);

    // Set headers for Server-Sent Events (SSE)
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx / Cloudflare proxy buffering
    res.flushHeaders();

    // Defeat reverse-proxy stream buffering (Cloud Run, Nginx, Cloudflare) with initial 2KB comment padding
    res.write(':' + ' '.repeat(2048) + '\n\n');
    (res as any).flush?.();

    const currentSessionId = sessionId || `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    let stopRequested = false;

    // Retrieve or initialize session state
    let session = activeSessions.get(currentSessionId);
    if (session) {
      if (session.disconnectTimer) {
        clearTimeout(session.disconnectTimer);
        session.disconnectTimer = undefined;
      }
    } else {
      session = {
        id: currentSessionId,
        status: 'running',
        stop: () => {
          stopRequested = true;
        },
        updatedAt: Date.now(),
      };
      activeSessions.set(currentSessionId, session);
    }

    // Send frequent keepalive comments to prevent proxy / browser timeouts
    const keepAliveTimer = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
        (res as any).flush?.();
      } catch {
        // Socket closed
      }
    }, 1500);

    const sendEvent = (event: string, data: any) => {
      try {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        (res as any).flush?.();
      } catch {
        // Socket error
      }
    };

    req.on('close', () => {
      clearInterval(keepAliveTimer);
      // Do NOT instantly abort computation on transient network blip!
      // Give a 60-second grace period for reconnect/polling before terminating
      if (session && session.status === 'running') {
        session.disconnectTimer = setTimeout(() => {
          if (session && session.status === 'running') {
            stopRequested = true;
            session.status = 'stopped';
            activeSessions.delete(currentSessionId);
          }
        }, 60000);
      }
    });

    try {
      sendEvent('session', { sessionId: currentSessionId });
      sendEvent('progress', {
        round: 1,
        maxRounds: options?.maxRounds || 200,
        currentTickets: 0,
        currentTicketList: [],
        violationsCount: 0,
        activeConstraints: 35,
        totalCombinations: 0,
        stepName: 'Initialization',
        status: 'Connected to Server CPU Engine. Initializing combinatorial matrix...',
        engine: 'Server Turbo CPU',
      });

      const result = await runOptimization(config, targets, {
        timeLimitSeconds: options?.timeLimitSeconds,
        maxRounds: options?.maxRounds,
        shouldStop: () => stopRequested,
        onProgress: (info) => {
          if (session) {
            session.lastProgress = info;
            session.updatedAt = Date.now();
          }
          sendEvent('progress', info);
        },
      });

      if (session) {
        session.status = 'completed';
        session.result = result;
        session.updatedAt = Date.now();
      }

      sendEvent('done', result);
    } catch (err: any) {
      const errMsg = err?.message || 'Server optimization encountered an error';
      if (session) {
        session.status = 'error';
        session.error = errMsg;
        session.updatedAt = Date.now();
      }
      sendEvent('error', { message: errMsg });
    } finally {
      clearInterval(keepAliveTimer);
      try {
        res.end();
      } catch {}
    }
  });

  // Serve Frontend: Vite in development, static files in production
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Universal Lottery Optimizer] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
