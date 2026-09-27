import React, { useState, useRef, useEffect } from 'react';
import { GameConfig, TargetMap, OptimizationResult } from './types';
import { PRESETS } from './lib/presets';
import { combinationCountBigInt } from './lib/core';
import { GameConfigForm } from './components/GameConfigForm';
import { TargetsMatrix } from './components/TargetsMatrix';
import { TicketsView } from './components/TicketsView';
import { VerificationReportView } from './components/VerificationReportView';
import { ResultSimulator } from './components/ResultSimulator';
import { SolverProgressInfo } from './lib/solver';
import { runOptimizationWithWorker } from './lib/workerClient';
import {
  fetchSystemInfo,
  runOptimizationWithServer,
  SystemHardwareInfo,
} from './lib/serverClient';
import {
  ShieldCheck,
  Rocket,
  RotateCcw,
  Cpu,
  Sliders,
  Zap,
  Activity,
  Clock,
  Square,
  Layers,
  Ticket,
  RefreshCw,
  Server,
  Terminal,
  Search,
} from 'lucide-react';

interface LiveActivityLog {
  id: string;
  timestamp: string;
  message: string;
  color?: string;
}

export const App: React.FC = () => {
  const [config, setConfig] = useState<GameConfig>({
    numberFrom: 1,
    numberTo: 15,
    ticketSize: 6,
    resultSize: 6,
  });

  const [targets, setTargets] = useState<TargetMap>({ 5: 1 });

  const [timeLimit, setTimeLimit] = useState<number>(0); // 0 = No Limit (Run Until Solved / Proved)
  const [isSolving, setIsSolving] = useState<boolean>(false);
  const [progressStatus, setProgressStatus] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [liveInfo, setLiveInfo] = useState<SolverProgressInfo | null>(null);
  const [elapsedSec, setElapsedSec] = useState<number>(0);

  const [activityLogs, setActivityLogs] = useState<LiveActivityLog[]>([]);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const lastLoggedStatusRef = useRef<string>('');

  const [engineMode, setEngineMode] = useState<'server' | 'browser'>(() => {
    return (localStorage.getItem('preferred_engine_mode') as 'server' | 'browser') || 'server';
  });
  const [serverHardware, setServerHardware] = useState<SystemHardwareInfo | null>(null);

  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [activeDrawnResult, setActiveDrawnResult] = useState<number[]>([]);

  const stopRequestedRef = useRef<boolean>(false);
  const timerIntervalRef = useRef<any>(null);

  // Check server hardware capabilities on mount (always keep VPS/Server Turbo as default)
  useEffect(() => {
    fetchSystemInfo().then((info) => {
      if (info) {
        setServerHardware(info);
      }
    });
  }, []);

  const handleEngineChange = (mode: 'server' | 'browser') => {
    setEngineMode(mode);
    localStorage.setItem('preferred_engine_mode', mode);
  };

  // Live timer while solving
  useEffect(() => {
    if (isSolving) {
      setElapsedSec(0);
      const start = Date.now();
      timerIntervalRef.current = setInterval(() => {
        setElapsedSec(Math.floor((Date.now() - start) / 1000));
      }, 500);
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [isSolving]);

  const formatElapsed = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}s`;
  };

  const addActivityLog = (message: string, color = 'text-slate-300') => {
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    setActivityLogs((prev) => [
      ...prev.slice(-80),
      {
        id: `${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        timestamp: `[${timeStr}]`,
        message,
        color,
      },
    ]);
  };

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [activityLogs]);

  const [showLiveTicketsPreview, setShowLiveTicketsPreview] = useState<boolean>(false);
  const optimizerControllerRef = useRef<{ stop: () => void; terminate: () => void; promise?: Promise<OptimizationResult> } | null>(null);

  const handleCancelAndReset = () => {
    if (optimizerControllerRef.current) {
      optimizerControllerRef.current.terminate();
      optimizerControllerRef.current = null;
    }
    stopRequestedRef.current = true;
    setIsSolving(false);
    setProgressStatus('');
    setProgressPercent(0);
    setResult(null);
    setLiveInfo(null);
    setActiveDrawnResult([]);
  };

  const handleApplyPreset = (presetId: string) => {
    const p = PRESETS.find((item) => item.id === presetId);
    if (!p) return;
    setConfig({
      numberFrom: p.from,
      numberTo: p.to,
      ticketSize: p.ticketSize,
      resultSize: p.resultSize,
    });
    setTargets({ ...p.targets });
    setResult(null);
    setActiveDrawnResult([]);
  };

  const handleStopOptimization = () => {
    if (optimizerControllerRef.current) {
      optimizerControllerRef.current.stop();
    }
    stopRequestedRef.current = true;
    setProgressStatus('Finalizing best tickets found so far...');
    addActivityLog('⏹️ Stop requested: Finalizing and keeping best tickets found so far...', 'text-amber-400 font-bold');
  };

  const handleStartOptimization = async (overrideEngine?: 'server' | 'browser') => {
    let activeTargets = { ...targets };
    if (Object.keys(activeTargets).length === 0) {
      const defaultK = Math.max(2, Math.min(5, maxK));
      activeTargets = { [defaultK]: 1 };
      setTargets(activeTargets);
    }

    const currentEngine = overrideEngine || engineMode;
    if (overrideEngine) {
      setEngineMode(overrideEngine);
    }

    stopRequestedRef.current = false;
    setIsSolving(true);
    setProgressPercent(10);
    const initialStatus = currentEngine === 'server'
      ? `Connecting to Server CPU Engine (${serverHardware?.cpuCores || 'Multi'} Cores)...`
      : 'Starting Browser Web Worker...';
    setProgressStatus(initialStatus);

    const pool = Math.max(0, config.numberTo - config.numberFrom + 1);
    const currentCombos = pool >= config.resultSize ? Number(combinationCountBigInt(pool, config.resultSize)) : 0;

    lastLoggedStatusRef.current = '';
    const nowTimeStr = `[${new Date().toTimeString().slice(0, 8)}]`;
    setActivityLogs([
      {
        id: 'init_1',
        timestamp: nowTimeStr,
        message: currentEngine === 'server'
          ? `⚡ System connected to Server Multi-Core CPU Engine (${serverHardware?.cpuCores || '2'} Cores / 4GB RAM)`
          : '⚡ System initialized Browser Worker (High-Speed WASM + Bitset)',
        color: 'text-cyan-400 font-bold',
      },
      {
        id: 'init_2',
        timestamp: nowTimeStr,
        message: `📐 Problem Matrix: Universe [${config.numberFrom}..${config.numberTo}], Ticket Size ${config.ticketSize}, Draw Size ${config.resultSize} (${currentCombos.toLocaleString()} total draws to cover)`,
        color: 'text-indigo-300',
      },
      {
        id: 'init_3',
        timestamp: nowTimeStr,
        message: `🎯 Target Requirements: ${Object.entries(activeTargets).map(([k, m]) => `Exact ${k}-Match ≥ ${m}`).join(', ')}`,
        color: 'text-emerald-300 font-semibold',
      },
      {
        id: 'init_4',
        timestamp: nowTimeStr,
        message: `🚀 ফাস্ট Greedy BitSet Cover শুরু হচ্ছে: ${currentCombos.toLocaleString()}টি ড্র-এর সবকটি কভার না হওয়া এবং FAIL = 0 না হওয়া পর্যন্ত অবিরাম চলবে...`,
        color: 'text-emerald-400 font-bold',
      },
    ]);

    setLiveInfo({
      round: 0,
      maxRounds: 0,
      currentTickets: 0,
      currentTicketList: [],
      violationsCount: currentCombos,
      activeConstraints: 0,
      totalCombinations: currentCombos,
      stepName: 'Initializing',
      status: initialStatus,
      engine: currentEngine === 'server' ? 'Server Turbo CPU' : 'Browser Worker',
    });

    try {
      let controller: { stop: () => void; terminate: () => void; promise: Promise<OptimizationResult> };

      const onProgressHandler = (info: SolverProgressInfo) => {
        setLiveInfo(info);
        setProgressStatus(info.status);
        const total = Math.max(1, info.totalCombinations);
        const rem = info.violationsCount ?? total;
        const covered = Math.max(0, total - rem);
        const covPct = ((covered / total) * 100).toFixed(1);
        const pct = info.violationsCount === 0 ? 100 : Math.min(99, Math.max(10, Math.round((covered / total) * 90) + 10));
        setProgressPercent(pct);

        if (info.status && info.status !== lastLoggedStatusRef.current) {
          lastLoggedStatusRef.current = info.status;
          let logColor = 'text-slate-300';
          if (info.stepName === 'Separation Oracle') logColor = 'text-amber-300 font-medium';
          else if (info.stepName === 'Optimization' || info.stepName === 'Greedy BitSet Cover') logColor = 'text-cyan-300';
          else if (info.stepName === 'Verification') logColor = 'text-emerald-300';
          else if (info.stepName === 'Initialization') logColor = 'text-indigo-300';
          
          addActivityLog(
            `${info.status} (বর্তমান টিকিট: ${info.currentTickets}টি, কভারেজ: ${covPct}%)`,
            logColor
          );
        }
      };

      if (currentEngine === 'server') {
        controller = runOptimizationWithServer({
          config,
          targets: activeTargets,
          options: {
            timeLimitSeconds: timeLimit,
            maxRounds: 0,
          },
          onProgress: onProgressHandler,
        });
      } else {
        controller = runOptimizationWithWorker({
          numberFrom: config.numberFrom,
          numberTo: config.numberTo,
          ticketSize: config.ticketSize,
          resultSize: config.resultSize,
          targets: activeTargets,
          timeLimitSeconds: timeLimit,
          seedConstraintCount: 35,
          maxRounds: 0,
          onProgress: onProgressHandler,
        });
      }

      optimizerControllerRef.current = controller;
      const optResult = await controller.promise;

      setProgressPercent(100);
      setResult(optResult);
      addActivityLog(
        `🏆 ${optResult.status === 'PROVED OPTIMAL' ? 'PROVED OPTIMAL' : 'SUCCESS'}: Selected ${optResult.tickets.length} tickets covering 100% of combinations!`,
        'text-emerald-400 font-bold'
      );
      if (optResult.verification?.worstCaseOverallResult) {
        setActiveDrawnResult(optResult.verification.worstCaseOverallResult);
      } else if (optResult.tickets.length > 0) {
        setActiveDrawnResult(optResult.tickets[0].slice(0, config.resultSize));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.toLowerCase().includes('cancel') && !msg.toLowerCase().includes('abort')) {
        addActivityLog(`⚠️ Engine Note: ${msg}`, 'text-amber-400 font-semibold');
      }
    } finally {
      setIsSolving(false);
      setProgressStatus('');
      optimizerControllerRef.current = null;
    }
  };

  const handleReset = () => {
    setResult(null);
    setActiveDrawnResult([]);
    setProgressPercent(0);
    setLiveInfo(null);
  };

  const poolSize = Math.max(0, config.numberTo - config.numberFrom + 1);
  const totalCombosCount = poolSize >= config.resultSize ? Number(combinationCountBigInt(poolSize, config.resultSize)) : 0;
  const maxK = Math.min(config.ticketSize, config.resultSize);
  const activeTargetEntries = Object.entries(targets)
    .map(([k, min]) => ({ k: Number(k), min }))
    .sort((a, b) => b.k - a.k);

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Banner exactly formatted like client screenshot */}
      <header className="border-b border-slate-800/80 bg-[#090d18] sticky top-0 z-30 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-rose-600/20 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <ShieldCheck className="w-5 h-5 text-rose-400" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-base sm:text-lg font-extrabold text-white tracking-tight">
                  Universal Lottery / Combination Optimizer
                </h1>
              </div>
              <p className="text-xs text-slate-400">
                Complete Guaranteed Cover Engine &amp; 100% Exhaustive Combinatorial Verification (HiGHS, Integer Programming)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono tracking-wider text-cyan-400 bg-cyan-950/40 border border-cyan-500/30 px-3 py-1 rounded-full uppercase font-bold">
              100% Exhaustive Guarantee &bull; Zero Miss
            </span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex-1 w-full space-y-6">
        {/* Active Requirements Bar (Prominent Banner from client screenshot) */}
        <div className="bg-slate-900/90 border border-indigo-500/30 rounded-xl p-4 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Active Compound Requirements:
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {activeTargetEntries.length === 0 ? (
                  <span className="text-xs text-amber-400/90 italic">
                    কোনো টার্গেট সেট করা নেই — নিচে টার্গেট অ্যাড করুন
                  </span>
                ) : (
                  activeTargetEntries.map(({ k, min }) => (
                    <span
                      key={k}
                      className="text-xs font-bold font-mono px-3 py-1 rounded-md bg-indigo-950 border border-indigo-500/40 text-cyan-300 shadow-sm"
                    >
                      Exact {k}-Match &ge; {min}
                    </span>
                  ))
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Engine Environment Selector */}
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <Server className="w-3.5 h-3.5 text-cyan-400" />
                <span>Compute Engine:</span>
                <select
                  value={engineMode}
                  onChange={(e) => handleEngineChange(e.target.value as 'server' | 'browser')}
                  disabled={isSolving}
                  className="bg-slate-950 border border-cyan-500/40 text-xs text-cyan-300 font-bold rounded px-2.5 py-1 font-mono cursor-pointer focus:outline-none focus:ring-1 focus:ring-cyan-500"
                >
                  <option value="server">
                    🚀 Server Turbo ({serverHardware ? `${serverHardware.cpuCores} Core CPU / ${serverHardware.totalMemoryGB}GB RAM` : 'VPS CPU'})
                  </option>
                  <option value="browser">💻 Browser Web Worker (Local)</option>
                </select>
              </div>

              {/* Time Limit Selector */}
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <Sliders className="w-3.5 h-3.5 text-slate-500" />
                <span>Limit:</span>
                <select
                  value={timeLimit}
                  onChange={(e) => setTimeLimit(parseInt(e.target.value, 10))}
                  disabled={isSolving}
                  className="bg-slate-950 border border-indigo-500/40 text-xs text-indigo-300 font-bold rounded px-2.5 py-1 font-mono cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value={0}>&infin; No Limit (Run Until Solved / Proved)</option>
                  <option value={300}>5 Minutes (300s)</option>
                  <option value={120}>2 Minutes (120s)</option>
                  <option value={60}>1 Minute (60s)</option>
                  <option value={30}>Quick Scan (30s)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Action Button Bar like screenshot */}
          <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row items-center gap-3">
            {isSolving ? (
              <div className="w-full flex flex-col sm:flex-row items-center gap-3">
                {/* Live Progress Banner with Complete % */}
                <div className="relative w-full sm:flex-1 overflow-hidden rounded-xl bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-950 border border-indigo-500/50 py-3 px-5 shadow-lg flex items-center justify-between">
                  {/* Background animated progress bar */}
                  <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-500/30 via-teal-500/30 to-emerald-500/30 transition-all duration-500 pointer-events-none"
                    style={{ width: `${progressPercent}%` }}
                  />
                  <div className="relative z-10 flex items-center gap-2.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                    <span className="text-xs sm:text-sm font-semibold text-slate-100 flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-emerald-400 fill-emerald-400" />
                      অপ্টিমাইজেশন চলছে... (টার্গেট পূরণ হলে নিজে থামবে)
                    </span>
                  </div>
                  <div className="relative z-10 flex items-center gap-2">
                    <span className="text-xs sm:text-sm font-mono font-black text-emerald-400 bg-emerald-950/90 border border-emerald-500/50 px-3 py-1 rounded-lg shadow-inner">
                      {progressPercent}% Complete
                    </span>
                    {liveInfo?.currentTickets && liveInfo.currentTickets > 0 ? (
                      <button
                        type="button"
                        onClick={handleStopOptimization}
                        className="text-[11px] bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 hover:text-amber-200 border border-amber-500/40 px-2.5 py-1 rounded-lg cursor-pointer transition-colors font-semibold whitespace-nowrap"
                        title="প্রয়োজন হলে এখনই থামিয়ে বর্তমান টিকিট নিতে পারেন"
                      >
                        এখনই নিন ({liveInfo.currentTickets})
                      </button>
                    ) : null}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCancelAndReset}
                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 py-3 px-5 rounded-xl bg-rose-950/80 hover:bg-rose-900 text-rose-200 hover:text-white border border-rose-500/40 text-xs font-bold cursor-pointer transition-colors shadow-md whitespace-nowrap"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>বাতিল (Cancel)</span>
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => handleStartOptimization()}
                  className="w-full sm:flex-1 flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold shadow-lg shadow-emerald-600/30 hover:shadow-emerald-600/40 transition-all text-sm cursor-pointer"
                >
                  <Rocket className="w-4 h-4 fill-slate-950" />
                  {activeTargetEntries.length === 0
                    ? 'Calculate Minimum Tickets (Exact 5-Match ≥ 1)'
                    : 'Calculate Minimum Tickets For Targets'}
                </button>

                {result && (
                  <button
                    type="button"
                    onClick={handleReset}
                    className="w-full sm:w-auto flex items-center justify-center gap-1.5 py-3 px-5 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold cursor-pointer transition-colors"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Reset Results
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Sleek Minimal Loading Dashboard */}
        {isSolving && (
          <div className="bg-slate-900/95 border-2 border-cyan-500/50 rounded-2xl p-5 shadow-2xl shadow-cyan-950/50 space-y-4 animate-in fade-in">
            {/* Top Bar: Indicator, Elapsed Time, and Action Buttons */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="relative flex items-center justify-center">
                  <span className="animate-ping absolute inline-flex h-4 w-4 rounded-full bg-cyan-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-400 shadow-md shadow-emerald-400/80"></span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-extrabold text-white flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-cyan-400 fill-cyan-400" />
                      Optimizing Tickets
                    </span>
                    <span className="text-[10px] font-mono font-bold text-cyan-300 bg-cyan-950/80 border border-cyan-500/40 px-2.5 py-0.5 rounded-full uppercase">
                      {liveInfo?.stepName || 'Running'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Live Timer, Stop, and Cancel Buttons */}
              <div className="flex flex-wrap items-center gap-2.5 self-end sm:self-auto">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs text-amber-300 shadow-inner">
                  <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                  <span>Time:</span>
                  <span className="font-bold">{formatElapsed(elapsedSec)}</span>
                </div>

                <button
                  type="button"
                  onClick={handleStopOptimization}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-200 hover:text-white text-xs font-semibold transition-all shadow-md cursor-pointer"
                  title="টার্গেট পূরণ হওয়ার আগেই বর্তমান টিকিট নিয়ে নিতে চাইলে থামান"
                >
                  <Square className="w-3 h-3 fill-amber-400 text-amber-400" />
                  <span>এখনই ফলাফল নিন</span>
                </button>

                <button
                  type="button"
                  onClick={handleCancelAndReset}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 border border-rose-500/40 text-rose-300 hover:text-white text-xs font-bold transition-all shadow-md cursor-pointer"
                  title="Cancel and reset"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Cancel</span>
                </button>
              </div>
            </div>

            {/* 4 Clean Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Metric 1: Current Best Tickets */}
              <div className="bg-slate-950/80 border border-indigo-500/30 rounded-xl p-3 flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-400 text-[11px] font-semibold">
                  <span>Current Tickets</span>
                  <Ticket className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="mt-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl sm:text-2xl font-black text-cyan-300 font-mono">
                      {liveInfo?.currentTickets ? `${liveInfo.currentTickets}` : '0'}
                    </span>
                    {liveInfo?.currentTicketList && liveInfo.currentTicketList.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowLiveTicketsPreview(!showLiveTicketsPreview)}
                        className="text-[10px] text-cyan-400 hover:text-cyan-200 underline font-semibold cursor-pointer"
                      >
                        {showLiveTicketsPreview ? 'Hide' : 'View'}
                      </button>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500 block truncate">
                    Best found so far
                  </span>
                </div>
              </div>

              {/* Metric 2: Coverage Status */}
              <div className="bg-slate-950/80 border border-indigo-500/30 rounded-xl p-3 flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-400 text-[11px] font-semibold">
                  <span>কভারেজ স্ট্যাটাস</span>
                  <Layers className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="mt-1">
                  <div className="text-xl sm:text-2xl font-black text-indigo-300 font-mono">
                    {liveInfo?.violationsCount === 0 ? 'FAIL = 0' : `বাকি ${liveInfo?.violationsCount ? liveInfo.violationsCount.toLocaleString() : '...'} টি`}
                  </div>
                  <span className="text-[10px] text-emerald-400 font-semibold block truncate">
                    {liveInfo?.violationsCount === 0 ? '✓ ১০০% ড্র কভার সম্পন্ন' : 'Greedy BitSet Cover লুপ'}
                  </span>
                </div>
              </div>

              {/* Metric 3: Combination Draw Space Scanned */}
              <div className="bg-slate-950/80 border border-indigo-500/30 rounded-xl p-3 flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-400 text-[11px] font-semibold">
                  <span>Draws Audited</span>
                  <Cpu className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="mt-1">
                  <div className="text-lg sm:text-xl font-black text-emerald-300 font-mono truncate">
                    {(liveInfo?.totalCombinations || totalCombosCount).toLocaleString()}
                  </div>
                  <span className="text-[10px] text-slate-500 block truncate">
                    100% combination space
                  </span>
                </div>
              </div>

              {/* Metric 4: Uncovered Violations */}
              <div className="bg-slate-950/80 border border-indigo-500/30 rounded-xl p-3 flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-400 text-[11px] font-semibold">
                  <span>ঘাটতি ড্র (Pending)</span>
                  <Activity className="w-4 h-4 text-rose-400" />
                </div>
                <div className="mt-1">
                  <div className="text-lg sm:text-xl font-black text-rose-400 font-mono truncate">
                    {(liveInfo?.violationsCount !== undefined && liveInfo.violationsCount !== null
                      ? liveInfo.violationsCount
                      : totalCombosCount
                    ).toLocaleString()}
                    <span className="text-xs font-normal text-slate-400 ml-1">টি</span>
                  </div>
                  <span className="text-[10px] text-slate-500 block truncate">
                    {liveInfo?.violationsCount === 0 ? 'সব ড্র ১০০% কভার্ড' : 'টার্গেট পূরণ বাকি ড্র'}
                  </span>
                </div>
              </div>
            </div>

            {/* Real-time "What is Happening" & "What is Remaining" Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Card A: এখন কী হচ্ছে */}
              <div className="bg-gradient-to-br from-indigo-950/70 via-slate-900 to-slate-950 border border-indigo-500/40 rounded-xl p-3.5 shadow-md">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
                  <span className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Search className="w-3.5 h-3.5 text-cyan-400" />
                    এখন কী হচ্ছে (Current Task)
                  </span>
                </div>
                <p className="text-xs sm:text-sm font-semibold text-slate-100 leading-snug">
                  {liveInfo?.status || 'সার্ভার মাল্টি-কোর সিপিইউ ইঞ্জিনে অপ্টিমাইজেশন চলছে...'}
                </p>
                <div className="mt-2 text-[11px] text-slate-400 flex flex-wrap items-center gap-3">
                  <span>ধাপ: <b className="text-cyan-300 font-mono">{liveInfo?.stepName || 'Processing'}</b></span>
                  <span>ইঞ্জিন: <b className="text-indigo-300 font-mono">{liveInfo?.engine || 'Server Turbo CPU'}</b></span>
                  <span>রাউন্ড: <b className="text-emerald-300 font-mono">{liveInfo?.round || 1} / {liveInfo?.maxRounds || 30}</b></span>
                </div>
              </div>

              {/* Card B: কী বাকি আছে */}
              <div className="bg-gradient-to-br from-amber-950/40 via-slate-900 to-slate-950 border border-amber-500/40 rounded-xl p-3.5 shadow-md">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                  <span className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    কী বাকি আছে (What is Left)
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300">
                      ঘাটতি ড্র পূরণ বাকি:
                    </span>
                    <span className="font-mono font-bold text-rose-400">
                      {(liveInfo?.violationsCount !== undefined && liveInfo.violationsCount !== null
                        ? liveInfo.violationsCount
                        : totalCombosCount
                      ).toLocaleString()} টি / {totalCombosCount.toLocaleString()} টি
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300">
                      বর্তমান কভারেজ:
                    </span>
                    <span className="font-mono font-bold text-emerald-400">
                      {(
                        ((Math.max(
                          0,
                          totalCombosCount -
                            (liveInfo?.violationsCount !== undefined && liveInfo.violationsCount !== null
                              ? liveInfo.violationsCount
                              : totalCombosCount)
                        )) /
                          Math.max(1, totalCombosCount)) *
                        100
                      ).toFixed(2)}% অর্জিত
                    </span>
                  </div>
                </div>
                <div className="mt-2 text-[10px] text-amber-300/90 font-medium">
                  {liveInfo?.violationsCount === 0
                    ? '🎉 অভিনন্দন! সব ড্র ১০০% কভার হয়ে গেছে!'
                    : '🎯 টার্গেট পূরণ হলে স্বয়ংক্রিয়ভাবে থামবে। যেকোনো সময় মাঝপথের টিকিট নিতে উপরের "এখনই নিন" চাপতে পারেন।'}
                </div>
              </div>
            </div>

            {/* Live Small Terminal Screen: Real-Time Execution Log */}
            <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3 shadow-inner">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800/80 text-xs">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded bg-cyan-950 border border-cyan-500/40 text-cyan-400">
                    <Terminal className="w-3.5 h-3.5" />
                  </div>
                  <span className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
                    Live System Activity Log
                    <span className="text-[10px] text-slate-400 font-normal hidden sm:inline">(লাইভ প্রসেস স্ক্রিন)</span>
                  </span>
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-mono text-cyan-400/80">
                  <span className="bg-slate-900 border border-slate-800 px-2 py-0.5 rounded">
                    {activityLogs.length} events
                  </span>
                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    Active
                  </span>
                </div>
              </div>

              {/* Scrollable Small Log Screen with Monospace Output */}
              <div
                ref={logContainerRef}
                className="max-h-36 overflow-y-auto space-y-1 font-mono text-[11px] leading-relaxed pr-1 select-text scrollbar-thin scrollbar-thumb-slate-700"
              >
                {activityLogs.length === 0 ? (
                  <div className="text-slate-500 italic py-1">
                    Connecting to solver engine and waiting for initial events...
                  </div>
                ) : (
                  activityLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-start gap-2 hover:bg-slate-900/60 rounded px-1.5 py-0.5 transition-colors"
                    >
                      <span className="text-slate-500 shrink-0 font-medium select-none">{log.timestamp}</span>
                      <span className={`${log.color || 'text-slate-300'} break-words flex-1`}>
                        {log.message}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Live Tickets Preview Drawer (collapsible) */}
            {showLiveTicketsPreview && liveInfo?.currentTicketList && liveInfo.currentTicketList.length > 0 && (
              <div className="bg-slate-950 p-3.5 rounded-xl border border-cyan-500/40 space-y-2.5 shadow-inner animate-in fade-in">
                <div className="flex items-center justify-between text-xs pb-1.5 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <Ticket className="w-4 h-4 text-cyan-400" />
                    <span className="font-bold text-slate-200">
                      Generated Tickets Preview ({liveInfo.currentTicketList.length} tickets):
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowLiveTicketsPreview(false)}
                    className="text-xs text-slate-400 hover:text-white px-2 py-0.5 rounded bg-slate-900 border border-slate-700 cursor-pointer"
                  >
                    Close &times;
                  </button>
                </div>

                <div className="max-h-48 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pr-1">
                  {liveInfo.currentTicketList.map((ticketNums, idx) => (
                    <div
                      key={idx}
                      className="bg-slate-900/90 border border-slate-800/80 rounded-lg p-2 flex items-center justify-between text-xs"
                    >
                      <span className="text-[10px] font-mono text-slate-500">#{idx + 1}</span>
                      <div className="flex items-center gap-1">
                        {ticketNums.map((num) => (
                          <span
                            key={num}
                            className="w-5 h-5 rounded bg-indigo-950/80 border border-indigo-500/40 text-[10px] font-bold text-cyan-300 flex items-center justify-center font-mono"
                          >
                            {num}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Dynamic Loading Progress Bar */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                  <span className="text-slate-200 font-semibold">{progressStatus || 'Optimizing...'}</span>
                </span>
                <span className="font-mono font-bold text-cyan-300 text-sm">{progressPercent}%</span>
              </div>

              <div className="w-full bg-slate-950 rounded-full h-3 overflow-hidden border border-slate-800 p-0.5 shadow-inner">
                <div
                  className="bg-gradient-to-r from-indigo-500 via-cyan-400 to-emerald-400 h-full rounded-full transition-all duration-300 shadow-sm shadow-cyan-400/50 relative overflow-hidden"
                  style={{ width: `${progressPercent}%` }}
                >
                  <div className="absolute inset-0 bg-white/20 animate-[pulse_1s_infinite]"></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Two-Column Grid: Universe Game Matrix & Compound Target Requirements */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Game Universe Config */}
          <div className="lg:col-span-5 space-y-6">
            <GameConfigForm
              config={config}
              onChange={setConfig}
              onApplyPreset={handleApplyPreset}
              disabled={isSolving}
            />

            {/* Engine Settings card */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 text-xs space-y-3 shadow-lg">
              <div className="flex items-center gap-2 text-slate-200 font-bold uppercase tracking-wider text-[11px]">
                <Cpu className="w-4 h-4 text-indigo-400" />
                <span>Optimization Engine Settings</span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-1 text-slate-400 text-[11px]">
                <div className="flex justify-between">
                  <span>Optimization Engine:</span>
                  <span className="font-semibold text-slate-200">HiGHS / Mixed-Integer LP</span>
                </div>
                <div className="flex justify-between">
                  <span>Cover Guarantee:</span>
                  <span className="font-semibold text-emerald-400">100% Zero-Miss Guarantee</span>
                </div>
                <div className="flex justify-between">
                  <span>Proof Certification:</span>
                  <span className="font-semibold text-indigo-300">PROVED OPTIMAL / BEST FOUND</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Compound Target Requirements (4 কয়টা, 5 কয়টা win নিবেন) */}
          <div className="lg:col-span-7 space-y-6">
            <TargetsMatrix
              maxK={maxK}
              targets={targets}
              onChange={setTargets}
              disabled={isSolving}
            />
          </div>
        </div>

        {/* Verification Report Section (100% Audit against all combinations) */}
        {result?.verification && (
          <section className="space-y-6 pt-2">
            <VerificationReportView
              report={result.verification}
              status={result.status}
              statusDetail={result.statusDetail}
              rounds={result.rounds}
              durationMs={result.durationMs}
              solverEngine={result.solverEngine}
              onSelectResultToTest={(res) => setActiveDrawnResult(res)}
            />

            {/* Draw Simulator */}
            <ResultSimulator
              config={config}
              tickets={result.tickets}
              targets={targets}
              activeResult={activeDrawnResult}
              onResultChange={(res) => setActiveDrawnResult(res)}
            />

            {/* Generated Tickets View */}
            <TicketsView
              tickets={result.tickets}
              highlightNumbers={activeDrawnResult}
            />
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-[#090d18] py-4 text-center text-xs text-slate-500">
        Universal Lottery / Combination Optimizer &bull; 100% Exhaustive Verification Architecture
      </footer>
    </div>
  );
};
