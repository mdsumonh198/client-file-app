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
  Sparkles,
  Play,
  RotateCcw,
  HelpCircle,
  AlertOctagon,
  Clock,
  Cpu,
} from 'lucide-react';

export const App: React.FC = () => {
  const [config, setConfig] = useState<GameConfig>({
    numberFrom: 1,
    numberTo: 15,
    ticketSize: 6,
    resultSize: 6,
  });

  const [targets, setTargets] = useState<TargetMap>({
    3: 1,
    2: 3,
  });

  const [timeLimit, setTimeLimit] = useState<number>(60);
  const [isSolving, setIsSolving] = useState<boolean>(false);
  const [progressStatus, setProgressStatus] = useState<string>('');
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
      setErrorMsg('Please specify at least one exact-match target (e.g. Exact 3 >= 1).');
      return;
    }

    setIsSolving(true);
    setProgressStatus('Initializing solver and generating combination candidate space...');

    try {
      // Yield to allow React to update UI before intensive crunching
      await new Promise((r) => setTimeout(r, 50));

      const optResult = await optimizeWithConstraintGeneration(
        config.numberFrom,
        config.numberTo,
        config.ticketSize,
        config.resultSize,
        targets,
        {
          timeLimitSeconds: timeLimit,
          seedConstraintCount: 20,
          maxRounds: 60,
          onProgress: (info) => {
            setProgressStatus(info.status);
          },
        }
      );

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
  };

  const maxK = Math.min(config.ticketSize, config.resultSize);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Header Bar */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 flex items-center justify-center shadow-indigo-500/25 shadow-lg">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  Universal Lottery Optimizer
                </h1>
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  Exact Guarantee
                </span>
              </div>
              <p className="text-xs text-slate-400">
                100% Worst-Case Mathematical Guarantee &bull; Exhaustive Verification Across All Results
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1.5 rounded-lg border border-slate-700/60">
              <Cpu className="w-3.5 h-3.5 text-indigo-400" />
              <span>Engine: Iterative Cutting-Planes &bull; Bitmask SAT</span>
            </span>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex-1 w-full space-y-6">
        {/* Error Banner */}
        {errorMsg && (
          <div className="bg-rose-950/80 border border-rose-500/50 rounded-xl p-4 flex items-start gap-3 text-rose-200 text-xs shadow-lg animate-in fade-in">
            <AlertOctagon className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-bold text-rose-300">Optimization Error: </span>
              {errorMsg}
            </div>
            <button
              onClick={() => setErrorMsg(null)}
              className="text-rose-400 hover:text-white font-bold ml-2"
            >
              &times;
            </button>
          </div>
        )}

        {/* Input Configuration Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 space-y-6">
            <GameConfigForm
              config={config}
              onChange={setConfig}
              onApplyPreset={handleApplyPreset}
              disabled={isSolving}
            />

            <TargetsMatrix
              maxK={maxK}
              targets={targets}
              onChange={setTargets}
              disabled={isSolving}
            />
          </div>

          <div className="lg:col-span-6 space-y-6">
            {/* Solver Controls Card */}
            <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-5 shadow-lg backdrop-blur-sm">
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-700/70">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg">
                    <Play className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-white">Solver Controls</h2>
                    <p className="text-xs text-slate-400">Launch optimization &amp; verification loop</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-400" />
                  <label className="text-xs text-slate-300">Time Limit:</label>
                  <select
                    value={timeLimit}
                    onChange={(e) => setTimeLimit(parseInt(e.target.value, 10))}
                    disabled={isSolving}
                    className="bg-slate-900 border border-slate-700 text-xs text-white rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value={15}>15 seconds</option>
                    <option value={30}>30 seconds</option>
                    <option value={60}>60 seconds</option>
                    <option value={120}>120 seconds</option>
                  </select>
                </div>
              </div>

              <div className="space-y-4">
                <div className="bg-slate-900/60 rounded-lg p-3 text-xs text-slate-300 space-y-1.5 border border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Guarantee Verification:</span>
                    <span className="font-semibold text-emerald-400">100% of All Possible Results</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Objective Priority:</span>
                    <span className="font-semibold text-slate-200">1) Guarantee &bull; 2) Min Tickets &bull; 3) Balance</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Proof Standard:</span>
                    <span className="font-semibold text-indigo-300">PROVED OPTIMAL / BEST FOUND</span>
                  </div>
                </div>

                {isSolving ? (
                  <div className="space-y-3 p-4 bg-indigo-950/40 border border-indigo-500/30 rounded-lg">
                    <div className="flex items-center justify-between text-xs text-indigo-200 font-semibold">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-ping" />
                        <span>Optimizing &bull; Iterative Constraint Generation</span>
                      </div>
                      <span className="text-[11px] font-mono text-indigo-300">Active</span>
                    </div>
                    <p className="text-xs text-slate-300 font-mono bg-slate-950/60 p-2.5 rounded border border-indigo-900/60">
                      {progressStatus || 'Starting solver...'}
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleStartOptimization}
                      disabled={isSolving}
                      className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-semibold shadow-lg shadow-indigo-600/30 hover:shadow-indigo-600/40 transition-all text-sm disabled:opacity-50 cursor-pointer"
                    >
                      <Play className="w-4 h-4 fill-white" />
                      Start Optimization
                    </button>

                    {result && (
                      <button
                        type="button"
                        onClick={handleReset}
                        className="flex items-center gap-1.5 py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 transition-colors text-xs font-semibold"
                      >
                        <RotateCcw className="w-4 h-4" />
                        Reset
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Quick Principles Note */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 text-xs text-slate-400 space-y-2">
              <div className="flex items-center gap-2 text-slate-300 font-semibold">
                <HelpCircle className="w-4 h-4 text-indigo-400" />
                <span>Developer Brief &amp; Guarantee Rules</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-slate-400 text-[11px]">
                <li>Guarantees must be checked against <span className="text-slate-200 font-semibold">100% of possible results</span>, never random sample estimates.</li>
                <li>Worst-case scenario must satisfy your target. Even if the worst possible draw occurs, the exact-match requirement is met.</li>
                <li>Solutions with mathematical global proof show <span className="text-emerald-400 font-semibold">PROVED OPTIMAL</span>; otherwise <span className="text-indigo-400 font-semibold">BEST FOUND</span>.</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Verification Report Section */}
        {result?.verification && (
          <section className="space-y-6">
            <VerificationReportView
              report={result.verification}
              status={result.status}
              statusDetail={result.statusDetail}
              rounds={result.rounds}
              durationMs={result.durationMs}
              onSelectResultToTest={(res) => setActiveDrawnResult(res)}
            />

            {/* Draw Simulator */}
            <ResultSimulator
              config={config}
              tickets={result.tickets}
              activeResult={activeDrawnResult}
              onResultChange={(res) => setActiveDrawnResult(res)}
            />

            {/* Tickets View */}
            <TicketsView
              tickets={result.tickets}
              highlightNumbers={activeDrawnResult}
            />
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950 py-4 text-center text-xs text-slate-500">
        Universal Lottery &amp; Combination Optimizer &bull; 100% Exhaustive Verification Architecture
      </footer>
    </div>
  );
};
