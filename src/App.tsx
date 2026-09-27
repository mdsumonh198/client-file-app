import React, { useState, useRef, useEffect } from 'react';
import { GameConfig, TargetMap, OptimizationResult } from './types';
import { PRESETS } from './lib/presets';
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
  AlertTriangle,
  Zap,
  Activity,
  Clock,
  Square,
  Layers,
  Ticket,
  RefreshCw,
  Server,
} from 'lucide-react';

export const App: React.FC = () => {
  const [config, setConfig] = useState<GameConfig>({
    numberFrom: 1,
    numberTo: 15,
    ticketSize: 6,
    resultSize: 6,
  });

  const [targets, setTargets] = useState<TargetMap>({});

  const [timeLimit, setTimeLimit] = useState<number>(0); // 0 = No Limit (Run Until Solved / Proved)
  const [isSolving, setIsSolving] = useState<boolean>(false);
  const [progressStatus, setProgressStatus] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [liveInfo, setLiveInfo] = useState<SolverProgressInfo | null>(null);
  const [elapsedSec, setElapsedSec] = useState<number>(0);

  const [engineMode, setEngineMode] = useState<'server' | 'browser'>('server');
  const [serverHardware, setServerHardware] = useState<SystemHardwareInfo | null>(null);

  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeDrawnResult, setActiveDrawnResult] = useState<number[]>([]);

  const stopRequestedRef = useRef<boolean>(false);
  const timerIntervalRef = useRef<any>(null);

  // Check server hardware capabilities on mount
  useEffect(() => {
    fetchSystemInfo().then((info) => {
      if (info) {
        setServerHardware(info);
        setEngineMode('server');
      } else {
        setEngineMode('browser');
      }
    });
  }, []);

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
    setErrorMsg(null);
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
    setErrorMsg(null);
  };

  const handleStopOptimization = () => {
    if (optimizerControllerRef.current) {
      optimizerControllerRef.current.stop();
    }
    stopRequestedRef.current = true;
    setProgressStatus('Finalizing best tickets found so far...');
  };

  const handleStartOptimization = async () => {
    setErrorMsg(null);
    if (Object.keys(targets).length === 0) {
      setErrorMsg('Please specify at least one compound target (e.g. Exact 5 Match >= 1).');
      return;
    }

    stopRequestedRef.current = false;
    setIsSolving(true);
    setProgressPercent(10);
    setLiveInfo(null);
    setProgressStatus(
      engineMode === 'server'
        ? `Connecting to Server CPU Engine (${serverHardware?.cpuCores || 'Multi'} Cores)...`
        : 'Starting Browser Web Worker...'
    );

    try {
      let controller: { stop: () => void; terminate: () => void; promise: Promise<OptimizationResult> };

      if (engineMode === 'server') {
        controller = runOptimizationWithServer({
          config,
          targets,
          options: {
            timeLimitSeconds: timeLimit,
            maxRounds: 200,
          },
          onProgress: (info) => {
            setLiveInfo(info);
            setProgressStatus(info.status);
            const pct = Math.min(96, Math.max(15, Math.round((info.round / Math.min(info.maxRounds, 50)) * 75) + 15));
            setProgressPercent(pct);
          },
        });
      } else {
        controller = runOptimizationWithWorker({
          numberFrom: config.numberFrom,
          numberTo: config.numberTo,
          ticketSize: config.ticketSize,
          resultSize: config.resultSize,
          targets,
          timeLimitSeconds: timeLimit,
          seedConstraintCount: 35,
          maxRounds: 200,
          onProgress: (info) => {
            setLiveInfo(info);
            setProgressStatus(info.status);
            const pct = Math.min(96, Math.max(15, Math.round((info.round / Math.min(info.maxRounds, 50)) * 75) + 15));
            setProgressPercent(pct);
          },
        });
      }

      optimizerControllerRef.current = controller;
      const optResult = await controller.promise;

      setProgressPercent(100);
      setResult(optResult);
      if (optResult.verification?.worstCaseOverallResult) {
        setActiveDrawnResult(optResult.verification.worstCaseOverallResult);
      } else if (optResult.tickets.length > 0) {
        setActiveDrawnResult(optResult.tickets[0].slice(0, config.resultSize));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
    } finally {
      setIsSolving(false);
      setProgressStatus('');
      optimizerControllerRef.current = null;
    }
  };

  const handleReset = () => {
    setResult(null);
    setErrorMsg(null);
    setActiveDrawnResult([]);
    setProgressPercent(0);
    setLiveInfo(null);
  };

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
        {/* Error Alert */}
        {errorMsg && (
          <div className="bg-rose-950/80 border border-rose-500/50 rounded-xl p-4 flex items-start gap-3 text-rose-200 text-xs shadow-lg animate-in fade-in">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-bold text-rose-300">Optimization Notice: </span>
              {errorMsg}
            </div>
            <button
              onClick={() => setErrorMsg(null)}
              className="text-rose-400 hover:text-white font-bold ml-2 cursor-pointer"
            >
              &times;
            </button>
          </div>
        )}

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
                  onChange={(e) => setEngineMode(e.target.value as 'server' | 'browser')}
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
                <button
                  type="button"
                  onClick={handleStopOptimization}
                  className="w-full sm:flex-1 flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-lg shadow-amber-500/30 hover:shadow-amber-500/40 transition-all text-sm cursor-pointer"
                >
                  <Square className="w-4 h-4 fill-slate-950" />
                  <span>
                    থামিয়ে বর্তমান {liveInfo?.currentTickets ? `${liveInfo.currentTickets} টি` : ''} টিকিট নিন (Stop & Get Best)
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleCancelAndReset}
                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 py-3 px-5 rounded-xl bg-rose-950/80 hover:bg-rose-900 text-rose-200 hover:text-white border border-rose-500/40 text-xs font-bold cursor-pointer transition-colors shadow-md"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>রিসেট / বাতিল (Cancel)</span>
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleStartOptimization}
                  disabled={activeTargetEntries.length === 0}
                  className="w-full sm:flex-1 flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold shadow-lg shadow-emerald-600/30 hover:shadow-emerald-600/40 transition-all text-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Rocket className="w-4 h-4 fill-slate-950" />
                  {activeTargetEntries.length === 0
                    ? 'আগে নিচে টার্গেট অ্যাড করুন'
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
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-200 hover:text-white text-xs font-bold transition-all shadow-md cursor-pointer"
                  title="Stop optimization and view the best tickets found so far"
                >
                  <Square className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  <span>Stop &amp; Keep Best</span>
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
                      {liveInfo?.currentTickets ? `${liveInfo.currentTickets}` : '...'}
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

              {/* Metric 2: Current Round */}
              <div className="bg-slate-950/80 border border-indigo-500/30 rounded-xl p-3 flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-400 text-[11px] font-semibold">
                  <span>Round</span>
                  <Layers className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="mt-1">
                  <div className="text-xl sm:text-2xl font-black text-indigo-300 font-mono">
                    {liveInfo ? `Round ${liveInfo.round}` : 'Round 1'}
                    <span className="text-xs font-normal text-slate-500 ml-1">
                      /{liveInfo?.maxRounds || 200}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 block truncate">
                    Cutting-plane iteration
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
                    {liveInfo?.totalCombinations
                      ? liveInfo.totalCombinations.toLocaleString()
                      : '...'}
                  </div>
                  <span className="text-[10px] text-slate-500 block truncate">
                    100% combination space
                  </span>
                </div>
              </div>

              {/* Metric 4: Uncovered Violations */}
              <div className="bg-slate-950/80 border border-indigo-500/30 rounded-xl p-3 flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-400 text-[11px] font-semibold">
                  <span>Remaining Deficit</span>
                  <Activity className="w-4 h-4 text-rose-400" />
                </div>
                <div className="mt-1">
                  <div className="text-xl sm:text-2xl font-black text-rose-300 font-mono">
                    {liveInfo?.violationsCount !== undefined ? `${liveInfo.violationsCount}` : '...'}
                  </div>
                  <span className="text-[10px] text-slate-500 block truncate">
                    Draws pending coverage
                  </span>
                </div>
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
