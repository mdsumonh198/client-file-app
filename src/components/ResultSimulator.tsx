import React, { useState } from 'react';
import { GameConfig, TargetMap } from '../types';
import { Dices, BarChart3, CheckCircle2, ShieldCheck } from 'lucide-react';
import { exactMatchCount, toMask } from '../lib/core';

interface ResultSimulatorProps {
  config: GameConfig;
  tickets: number[][];
  targets?: TargetMap;
  activeResult: number[];
  onResultChange: (result: number[]) => void;
}

export const ResultSimulator: React.FC<ResultSimulatorProps> = ({
  config,
  tickets,
  targets = {},
  activeResult,
  onResultChange,
}) => {
  const [customInput, setCustomInput] = useState('');

  const generateRandomResult = () => {
    const range: number[] = [];
    for (let i = config.numberFrom; i <= config.numberTo; i++) {
      range.push(i);
    }
    // Fisher-Yates shuffle
    for (let i = range.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [range[i], range[j]] = [range[j], range[i]];
    }
    const drawn = range.slice(0, config.resultSize).sort((a, b) => a - b);
    onResultChange(drawn);
  };

  const handleApplyCustom = () => {
    const parsed = customInput
      .split(/[\s,]+/)
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));

    const uniqueSorted = Array.from(new Set(parsed)).sort((a, b) => a - b);
    if (uniqueSorted.length !== config.resultSize) {
      alert(`Please enter exactly ${config.resultSize} unique numbers within ${config.numberFrom}..${config.numberTo}`);
      return;
    }
    for (const num of uniqueSorted) {
      if (num < config.numberFrom || num > config.numberTo) {
        alert(`Number ${num} is outside the range ${config.numberFrom}..${config.numberTo}`);
        return;
      }
    }
    onResultChange(uniqueSorted);
    setCustomInput('');
  };

  // Evaluate current drawn result against tickets
  const evaluation = React.useMemo(() => {
    if (!activeResult || activeResult.length === 0 || tickets.length === 0) {
      return null;
    }
    const rMask = toMask(activeResult);
    const counts = new Int32Array(config.resultSize + 1);

    for (let t = 0; t < tickets.length; t++) {
      const tMask = toMask(tickets[t]);
      const k = exactMatchCount(tMask, rMask);
      if (k <= config.resultSize) {
        counts[k]++;
      }
    }

    return counts;
  }, [activeResult, tickets, config.resultSize]);

  if (tickets.length === 0) return null;

  return (
    <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-5 shadow-lg backdrop-blur-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-slate-700/70 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-amber-500/20 text-amber-400 rounded-lg">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">Interactive Draw Simulator</h2>
            <p className="text-xs text-slate-400">
              Test any hypothetical winning draw against your ticket set in real-time
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={generateRandomResult}
          className="flex items-center gap-1.5 text-xs bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold px-3 py-1.5 rounded-lg shadow transition-colors"
        >
          <Dices className="w-4 h-4" />
          Random Draw
        </button>
      </div>

      {/* Drawn Result Balls Display */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 rounded-xl bg-slate-900/90 border border-slate-700/60 mb-5">
        <div>
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
            Currently Drawn Winning Numbers ({activeResult.length} balls):
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {activeResult.length > 0 ? (
              activeResult.map((num) => (
                <span
                  key={num}
                  className="inline-flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold bg-amber-400 text-slate-950 shadow-md ring-2 ring-amber-300/50"
                >
                  {String(num).padStart(2, '0')}
                </span>
              ))
            ) : (
              <span className="text-xs text-slate-500 italic">No draw selected yet.</span>
            )}
          </div>
        </div>

        {/* Custom result input */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <input
            type="text"
            placeholder={`e.g. 1, 3, 7, 10... (${config.resultSize} nums)`}
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            className="w-full md:w-60 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
          />
          <button
            type="button"
            onClick={handleApplyCustom}
            className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg border border-slate-700 shrink-0 font-medium"
          >
            Test
          </button>
        </div>
      </div>

      {/* Breakdown per exact match count for this draw */}
      {evaluation && (
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <BarChart3 className="w-4 h-4 text-amber-400" />
              Match Distribution For This Draw:
            </h3>
            {Object.keys(targets).length > 0 && (
              <span className="text-[11px] text-emerald-400 flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full font-semibold">
                <ShieldCheck className="w-3.5 h-3.5" />
                Guarantees Verified On Current Draw
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2.5">
            {Array.from({ length: config.resultSize + 1 }, (_, k) => {
              const count = evaluation[k];
              const hasHits = count > 0;
              const req = targets[k];
              const hasTarget = req !== undefined;
              const passesTarget = hasTarget ? count >= req : true;

              return (
                <div
                  key={k}
                  className={`p-2.5 rounded-lg border text-center transition-all ${
                    hasTarget
                      ? passesTarget
                        ? 'bg-slate-900/90 border-emerald-500/50 ring-1 ring-emerald-500/30'
                        : 'bg-rose-950/40 border-rose-500/50'
                      : hasHits
                      ? 'bg-slate-900/90 border-amber-500/40 ring-1 ring-amber-500/20'
                      : 'bg-slate-900/40 border-slate-800'
                  }`}
                >
                  <span className="text-[11px] text-slate-400 block mb-0.5">Exact {k}</span>
                  <span
                    className={`text-base font-bold font-mono ${
                      hasTarget
                        ? passesTarget
                          ? 'text-emerald-400'
                          : 'text-rose-400'
                        : hasHits
                        ? 'text-amber-400'
                        : 'text-slate-600'
                    }`}
                  >
                    {count}
                  </span>
                  <span className="text-[10px] text-slate-500 block">tickets</span>

                  {hasTarget && (
                    <div className="mt-1 pt-1 border-t border-slate-700/60">
                      <span className="text-[9px] uppercase font-bold text-slate-400 block">
                        Target &ge; {req}
                      </span>
                      {passesTarget ? (
                        <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-emerald-400">
                          <CheckCircle2 className="w-2.5 h-2.5" /> PASS
                        </span>
                      ) : (
                        <span className="text-[9px] font-bold text-rose-400">FAIL</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
