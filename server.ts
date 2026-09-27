import express, { Request, Response } from 'express';
import cors from 'cors';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { runOptimization } from './src/lib/solver';
import { GameConfig, TargetMap } from './src/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const activeSessions = new Map<string, { stop: () => void }>();

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

  // Stop / Cancel active session
  app.post('/api/optimize/stop', (req: Request, res: Response) => {
    const { sessionId } = req.body;
    if (sessionId && activeSessions.has(sessionId)) {
      activeSessions.get(sessionId)?.stop();
      activeSessions.delete(sessionId);
      res.json({ status: 'stopped' });
    } else {
      res.json({ status: 'not_found' });
    }
  });

  // Server-side High-Performance Solver API (Server-Sent Events)
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

    // Set headers for Server-Sent Events (SSE)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable proxy buffering (Nginx, etc.)
    res.flushHeaders();

    const currentSessionId = sessionId || `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    let stopRequested = false;

    activeSessions.set(currentSessionId, {
      stop: () => {
        stopRequested = true;
      },
    });

    req.on('close', () => {
      stopRequested = true;
      activeSessions.delete(currentSessionId);
    });

    const sendEvent = (event: string, data: any) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      sendEvent('session', { sessionId: currentSessionId });

      const result = await runOptimization(config, targets, {
        timeLimitSeconds: options?.timeLimitSeconds,
        maxRounds: options?.maxRounds,
        shouldStop: () => stopRequested,
        onProgress: (info) => {
          sendEvent('progress', info);
        },
      });

      sendEvent('done', result);
    } catch (err: any) {
      sendEvent('error', { message: err?.message || 'Server optimization encountered an error' });
    } finally {
      activeSessions.delete(currentSessionId);
      res.end();
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
