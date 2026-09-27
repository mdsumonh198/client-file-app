import React, { useState } from 'react';
import { TargetMap } from '../types';
import { ShieldCheck, Plus, Trash2, SlidersHorizontal } from 'lucide-react';

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
  // New target row state for "Add Compound Target"
  const [selectedK, setSelectedK] = useState<number>(Math.max(2, Math.min(5, maxK)));
  const [minCount, setMinCount] = useState<number>(1);

  const handleAddCompoundTarget = () => {
    if (minCount <= 0) return;
    onChange({
      ...targets,
      [selectedK]: minCount,
    });
  };

  const handleRemoveTarget = (k: number) => {
    const updated = { ...targets };
    delete updated[k];
    onChange(updated);
  };

  const handleUpdateTargetValue = (k: number, val: number) => {
    const updated = { ...targets };
    if (val > 0) {
      updated[k] = val;
    } else {
      delete updated[k];
    }
    onChange(updated);
  };

  const activeTargetEntries = Object.entries(targets)
    .map(([k, min]) => ({ k: Number(k), min }))
    .sort((a, b) => b.k - a.k); // Highest exact-match target first

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl">
      {/* Title & Header like client screenshot */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3.5 mb-4 border-b border-slate-800 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-lg">
            <ShieldCheck className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              Compound Target Requirements
            </h2>
            <p className="text-[11px] text-slate-400">
              All targets must be satisfied simultaneously on EVERY possible draw (Exact Match: ticket &cap; draw == k)
            </p>
          </div>
        </div>

        {activeTargetEntries.length > 0 && (
          <button
            type="button"
            onClick={() => onChange({})}
            disabled={disabled}
            className="flex items-center gap-1.5 text-xs text-rose-400 hover:text-rose-300 px-2.5 py-1 rounded-lg border border-rose-500/20 hover:bg-rose-500/10 transition-colors self-start sm:self-auto cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear All
          </button>
        )}
      </div>

      {/* Interactive Quick Add Selector (Client UX: 4 কয়টা নিবে, 5 কয়টা win নিবে select করা) */}
      <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-4 mb-4">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 mb-3">
          <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
          <span>Add / Select Exact Match Win Target:</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
          {/* Match selector (e.g. Exact 5 Match, Exact 4 Match, etc.) */}
          <div className="sm:col-span-5">
            <label className="block text-[11px] font-medium text-slate-400 mb-1">
              Exact Match (k):
            </label>
            <select
              value={selectedK}
              onChange={(e) => setSelectedK(parseInt(e.target.value, 10))}
              disabled={disabled}
              className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              {Array.from({ length: maxK + 1 }, (_, i) => maxK - i).map((k) => (
                <option key={k} value={k}>
                  Exact {k}-Match {k === maxK ? '(Jackpot / All)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Min count input (e.g. 1 ta, 10 ta, 25 ta) */}
          <div className="sm:col-span-4">
            <label className="block text-[11px] font-medium text-slate-400 mb-1">
              Min Win Count (&ge;):
            </label>
            <div className="relative">
              <input
                type="number"
                min={1}
                max={9999}
                value={minCount}
                onChange={(e) => setMinCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                disabled={disabled}
                placeholder="e.g. 1, 10, 25"
                className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs font-mono font-bold text-cyan-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <span className="absolute right-3 top-2 text-[10px] text-slate-500 pointer-events-none">
                tickets
              </span>
            </div>
          </div>

          {/* Add button */}
          <div className="sm:col-span-3">
            <button
              type="button"
              onClick={handleAddCompoundTarget}
              disabled={disabled}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white rounded-lg text-xs font-semibold shadow-md shadow-indigo-600/20 transition-all cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Target
            </button>
          </div>
        </div>

        {/* Quick Example Presets matching client brief */}
        <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
          <span className="text-slate-500">Quick set:</span>
          {maxK >= 5 && (
            <button
              type="button"
              onClick={() => handleUpdateTargetValue(5, 1)}
              className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-indigo-300 border border-slate-800 text-[10px] transition-colors cursor-pointer"
            >
              Exact 5 &ge; 1
            </button>
          )}
          {maxK >= 4 && (
            <button
              type="button"
              onClick={() => handleUpdateTargetValue(4, 10)}
              className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-indigo-300 border border-slate-800 text-[10px] transition-colors cursor-pointer"
            >
              Exact 4 &ge; 10
            </button>
          )}
          {maxK >= 3 && (
            <button
              type="button"
              onClick={() => handleUpdateTargetValue(3, 25)}
              className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-indigo-300 border border-slate-800 text-[10px] transition-colors cursor-pointer"
            >
              Exact 3 &ge; 25
            </button>
          )}
        </div>
      </div>

      {/* Active Compound Targets List (Visual cards matching screenshot) */}
      <div className="space-y-2">
        <span className="text-[11px] uppercase font-bold text-slate-400 tracking-wider block">
          Current Active Target List ({activeTargetEntries.length}):
        </span>

        {activeTargetEntries.length === 0 ? (
          <div className="p-6 border border-dashed border-indigo-500/30 bg-slate-950/40 rounded-xl text-center space-y-2">
            <div className="inline-flex p-2.5 rounded-full bg-indigo-500/10 text-indigo-400 mb-1">
              <SlidersHorizontal className="w-5 h-5 text-indigo-400" />
            </div>
            <p className="text-xs font-semibold text-slate-200">
              ক্যালকুলেশন শুরু করার জন্য আপনার টার্গেট সিলেক্ট করুন
            </p>
            <p className="text-[11px] text-slate-400 max-w-md mx-auto">
              উপরে <span className="text-cyan-300 font-mono font-bold">Exact Match (k)</span> ও <span className="text-cyan-300 font-mono font-bold">Min Win Count (&ge;)</span> দিন এবং <span className="text-indigo-400 font-bold">+ Add Target</span> চাপুন। সেই টার্গেট গ্যারান্টি করতে সর্বনিম্ন কতটি টিকিট লাগবে তা স্বয়ংক্রিয়ভাবে জেনারেট হবে।
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {activeTargetEntries.map(({ k, min }) => (
              <div
                key={k}
                className="flex items-center justify-between p-3 rounded-lg bg-slate-950/70 border border-indigo-500/30 ring-1 ring-indigo-500/20"
              >
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
                  <div>
                    <span className="text-xs font-bold text-white block">
                      Exact {k}-Match
                    </span>
                    <span className="text-[11px] font-mono text-cyan-300 font-semibold">
                      Minimum &ge; {min} wins
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={1}
                    max={9999}
                    value={min}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      handleUpdateTargetValue(k, isNaN(v) ? 1 : Math.max(1, v));
                    }}
                    disabled={disabled}
                    className="w-14 bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-xs text-center font-mono font-bold text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveTarget(k)}
                    disabled={disabled}
                    className="p-1 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-900 transition-colors cursor-pointer"
                    title="Remove target"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
