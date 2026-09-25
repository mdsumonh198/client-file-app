import React from 'react';
import { TargetMap } from '../types';
import { ShieldCheck, HelpCircle, Trash2 } from 'lucide-react';

interface TargetsMatrixProps {
  maxK: number;
  targets: TargetMap;
  onChange: (targets: TargetMap) => void;
  disabled?: boolean;
}

export const TargetsMatrix: React.FC<TargetsMatrixProps> = ({
  maxK,
  targets,
  onChange,
  disabled,
}) => {
  const handleTargetChange = (k: number, val: number) => {
    const updated = { ...targets };
    if (val > 0) {
      updated[k] = val;
    } else {
      delete updated[k];
    }
    onChange(updated);
  };

  const handleClearAll = () => {
    onChange({});
  };

  const activeTargetCount = Object.keys(targets).length;

  return (
    <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-5 shadow-lg backdrop-blur-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-slate-700/70 gap-2">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-white">Exact-Match Minimum Targets</h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-medium">
                {activeTargetCount} active
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Set 100% worst-case guarantees: every possible result must yield at least this many matching tickets.
            </p>
          </div>
        </div>

        {activeTargetCount > 0 && (
          <button
            type="button"
            onClick={handleClearAll}
            disabled={disabled}
            className="flex items-center gap-1.5 text-xs text-rose-400 hover:text-rose-300 px-2.5 py-1 rounded-lg border border-rose-500/30 hover:bg-rose-500/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear Targets
          </button>
        )}
      </div>

      {/* Helper note explaining exact match semantics */}
      <div className="mb-4 flex items-start gap-2 bg-indigo-950/40 border border-indigo-500/20 rounded-lg p-3 text-xs text-indigo-200">
        <HelpCircle className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-indigo-300">Exact Match Rule: </span>
          A ticket counts for Exact-k only if it shares <span className="underline">exactly</span> k numbers with the result.
          For instance, a ticket matching 5 numbers does <span className="italic">not</span> count as Exact-4.
        </div>
      </div>

      {/* Target input grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {Array.from({ length: maxK + 1 }, (_, k) => {
          const val = targets[k] || 0;
          const isActive = val > 0;

          return (
            <div
              key={k}
              className={`p-3 rounded-lg border transition-all ${
                isActive
                  ? 'bg-indigo-950/50 border-indigo-500/60 ring-1 ring-indigo-500/40'
                  : 'bg-slate-900/60 border-slate-700/60 hover:border-slate-600'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-slate-200">Exact {k}</span>
                {isActive && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500 text-white font-bold">
                    &ge; {val}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  max={9999}
                  value={val === 0 ? '' : val}
                  placeholder="0"
                  onChange={(e) => {
                    const parsed = parseInt(e.target.value, 10);
                    handleTargetChange(k, isNaN(parsed) || parsed < 0 ? 0 : parsed);
                  }}
                  disabled={disabled}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm text-center text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                />
              </div>
            </div>
          );
        })}
      </div>

      {activeTargetCount === 0 && (
        <p className="mt-3 text-xs text-amber-400/90 text-center">
          * Please specify at least one target (e.g. Exact 3 &ge; 1) to run optimization.
        </p>
      )}
    </div>
  );
};
