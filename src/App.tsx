import React, { useState } from 'react';
import { GameConfig, TargetMap, OptimizationResult } from './types';
import { PRESETS } from './lib/presets';
import { GameConfigForm } from './components/GameConfigForm';
import { TargetsMatrix } from './components/TargetsMatrix';
import { TicketsView } from './components/TicketsView';
import { VerificationReportView } from './components/VerificationReportView';
import { ResultSimulator } from './components/ResultSimulator';
import { optimizeWithConstraintGeneration } from './lib/solver';
import {
  ShieldCheck,
  Rocket,
  RotateCcw,
  Cpu,
  Sliders,
  AlertTriangle,
  Zap,
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
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeDrawnResult, setActiveDrawnResult] = useState<number[]>([]);

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

  const handleStartOptimization = async () => {
    setErrorMsg(null);
    if (Object.keys(targets).length === 0) {
      setErrorMsg('Please specify at least one compound target (e.g. Exact 4 Match >= 1).');
      return;
    }

    setIsSolving(true);
    setProgressPercent(10);
    setProgressStatus('Initializing solver and generating combination candidate space...');

    try {
      await new Promise((r) => setTimeout(r, 60));

      const optResult = await optimizeWithConstraintGeneration(
        config.numberFrom,
        config.numberTo,
        config.ticketSize,
        config.resultSize,
        targets,
        {
          timeLimitSeconds: timeLimit,
          seedConstraintCount: 35,
          maxRounds: 200,
          onProgress: (info) => {
            setProgressStatus(info.status);
            // approximate progress percentage based on rounds and violations
            const pct = Math.min(95, Math.max(15, Math.round((info.round / 60) * 80)));
            setProgressPercent(pct);
          },
        }
      );

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
    }
  };

  const handleReset = () => {
    setResult(null);
    setErrorMsg(null);
    setActiveDrawnResult([]);
    setProgressPercent(0);
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

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <Sliders className="w-3.5 h-3.5 text-slate-500" />
                <span>Solver Mode / Limit:</span>
                <select
                  value={timeLimit}
                  onChange={(e) => setTimeLimit(parseInt(e.target.value, 10))}
                  disabled={isSolving}
                  className="bg-slate-950 border border-indigo-500/40 text-xs text-cyan-300 font-bold rounded px-2.5 py-1 font-mono cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
            <button
              type="button"
              onClick={handleStartOptimization}
              disabled={isSolving || activeTargetEntries.length === 0}
              className="w-full sm:flex-1 flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold shadow-lg shadow-emerald-600/30 hover:shadow-emerald-600/40 transition-all text-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <Rocket className="w-4 h-4 fill-slate-950" />
              {isSolving
                ? 'Optimizing Combination Space...'
                : activeTargetEntries.length === 0
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
          </div>
        </div>

        {/* Progress & Auditing Terminal Box (Matches client screenshot) */}
        {isSolving && (
          <div className="bg-slate-900/90 border border-cyan-500/40 rounded-xl p-4 shadow-xl space-y-3 animate-in fade-in">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-cyan-400 flex items-center gap-1.5">
                <Zap className="w-4 h-4 animate-bounce" />
                Phase: ITERATIVE CUTTING-PLANES &bull; SEPARATION ORACLE
              </span>
              <span className="font-mono font-bold text-cyan-300">{progressPercent}%</span>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
              <div
                className="bg-emerald-500 h-full transition-all duration-300 rounded-full shadow-sm shadow-emerald-500/50"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Auditing status terminal output */}
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono text-xs text-slate-300 space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-[11px] pb-1 border-b border-slate-800">
                <span>Auditing Engine: 64-bit SWAR Popcount Oracle</span>
                <span className="text-emerald-400 font-bold">100% Exhaustive Verification</span>
              </div>
              <p className="text-indigo-300 pt-1">{progressStatus || 'Running cutting plane rounds...'}</p>
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
