import React from 'react';
import { GameConfig } from '../types';
import { PRESETS } from '../lib/presets';
import { combinationCountBigInt } from '../lib/core';
import { Hash, Sparkles, Layers } from 'lucide-react';

interface GameConfigFormProps {
  config: GameConfig;
  onChange: (config: GameConfig) => void;
  onApplyPreset: (presetId: string) => void;
  disabled?: boolean;
}

export const GameConfigForm: React.FC<GameConfigFormProps> = ({
  config,
  onChange,
  onApplyPreset,
  disabled,
}) => {
  const poolSize = Math.max(0, config.numberTo - config.numberFrom + 1);
  const possibleTicketsBig =
    poolSize >= config.ticketSize ? combinationCountBigInt(poolSize, config.ticketSize) : 0n;
  const possibleResultsBig =
    poolSize >= config.resultSize ? combinationCountBigInt(poolSize, config.resultSize) : 0n;

  const handleChange = (field: keyof GameConfig, value: number) => {
    const updated = { ...config, [field]: value };
    onChange(updated);
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3.5 mb-4 border-b border-slate-800 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-lg">
            <Layers className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Universal Game Matrix
            </h2>
            <p className="text-[11px] text-slate-400">
              Customizable dynamic universe range (0..60) and draw geometry
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <select
            aria-label="Load a game preset"
            className="text-xs bg-slate-950 border border-slate-700 text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) {
                onApplyPreset(e.target.value);
                e.target.value = '';
              }
            }}
            disabled={disabled}
          >
            <option value="" disabled>
              Load Sample Preset...
            </option>
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Universe Min */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
            Universe Min:
          </label>
          <div className="flex items-center">
            <button
              type="button"
              disabled={disabled || config.numberFrom <= 0}
              onClick={() => handleChange('numberFrom', Math.max(0, config.numberFrom - 1))}
              className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-l-lg border border-r-0 border-slate-700 text-xs font-bold disabled:opacity-40 cursor-pointer"
            >
              -
            </button>
            <input
              type="number"
              min={0}
              max={60}
              value={config.numberFrom}
              onChange={(e) => handleChange('numberFrom', parseInt(e.target.value, 10) || 0)}
              disabled={disabled}
              className="w-full bg-slate-950 border-y border-slate-700 py-2 text-sm text-center text-white focus:outline-none font-mono font-bold"
            />
            <button
              type="button"
              disabled={disabled || config.numberFrom >= config.numberTo}
              onClick={() => handleChange('numberFrom', Math.min(config.numberTo, config.numberFrom + 1))}
              className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-r-lg border border-l-0 border-slate-700 text-xs font-bold disabled:opacity-40 cursor-pointer"
            >
              +
            </button>
          </div>
        </div>

        {/* Universe Max */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
            Universe Max:
          </label>
          <div className="flex items-center">
            <button
              type="button"
              disabled={disabled || config.numberTo <= config.numberFrom}
              onClick={() => handleChange('numberTo', Math.max(config.numberFrom, config.numberTo - 1))}
              className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-l-lg border border-r-0 border-slate-700 text-xs font-bold disabled:opacity-40 cursor-pointer"
            >
              -
            </button>
            <input
              type="number"
              min={0}
              max={60}
              value={config.numberTo}
              onChange={(e) => handleChange('numberTo', parseInt(e.target.value, 10) || 0)}
              disabled={disabled}
              className="w-full bg-slate-950 border-y border-slate-700 py-2 text-sm text-center text-white focus:outline-none font-mono font-bold"
            />
            <button
              type="button"
              disabled={disabled || config.numberTo >= 60}
              onClick={() => handleChange('numberTo', Math.min(60, config.numberTo + 1))}
              className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-r-lg border border-l-0 border-slate-700 text-xs font-bold disabled:opacity-40 cursor-pointer"
            >
              +
            </button>
          </div>
        </div>

        {/* Ticket Size (k) */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
            Ticket Size (k):
          </label>
          <div className="flex items-center">
            <button
              type="button"
              disabled={disabled || config.ticketSize <= 1}
              onClick={() => handleChange('ticketSize', Math.max(1, config.ticketSize - 1))}
              className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-l-lg border border-r-0 border-slate-700 text-xs font-bold disabled:opacity-40 cursor-pointer"
            >
              -
            </button>
            <input
              type="number"
              min={1}
              max={poolSize || 40}
              value={config.ticketSize}
              onChange={(e) => handleChange('ticketSize', parseInt(e.target.value, 10) || 1)}
              disabled={disabled}
              className="w-full bg-slate-950 border-y border-slate-700 py-2 text-sm text-center text-white focus:outline-none font-mono font-bold"
            />
            <button
              type="button"
              disabled={disabled || config.ticketSize >= poolSize}
              onClick={() => handleChange('ticketSize', Math.min(poolSize, config.ticketSize + 1))}
              className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-r-lg border border-l-0 border-slate-700 text-xs font-bold disabled:opacity-40 cursor-pointer"
            >
              +
            </button>
          </div>
        </div>

        {/* Draw Size (m) */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
            Draw Size (m):
          </label>
          <div className="flex items-center">
            <button
              type="button"
              disabled={disabled || config.resultSize <= 1}
              onClick={() => handleChange('resultSize', Math.max(1, config.resultSize - 1))}
              className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-l-lg border border-r-0 border-slate-700 text-xs font-bold disabled:opacity-40 cursor-pointer"
            >
              -
            </button>
            <input
              type="number"
              min={1}
              max={poolSize || 40}
              value={config.resultSize}
              onChange={(e) => handleChange('resultSize', parseInt(e.target.value, 10) || 1)}
              disabled={disabled}
              className="w-full bg-slate-950 border-y border-slate-700 py-2 text-sm text-center text-white focus:outline-none font-mono font-bold"
            />
            <button
              type="button"
              disabled={disabled || config.resultSize >= poolSize}
              onClick={() => handleChange('resultSize', Math.min(poolSize, config.resultSize + 1))}
              className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-r-lg border border-l-0 border-slate-700 text-xs font-bold disabled:opacity-40 cursor-pointer"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* Combinatorial Overview Chips like client screenshot */}
      <div className="mt-4 pt-3 border-t border-slate-800 flex flex-wrap items-center gap-3 text-xs text-slate-400">
        <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded-md border border-slate-800">
          <Hash className="w-3.5 h-3.5 text-slate-400" />
          <span>POOL:</span>
          <span className="font-semibold text-slate-200">
            {config.numberFrom}..{config.numberTo} ({poolSize} numbers)
          </span>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded-md border border-slate-800">
          <span>COMBINATORIAL DRAWS:</span>
          <span className="font-bold text-cyan-300 font-mono">
            {possibleResultsBig.toLocaleString()}
          </span>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded-md border border-slate-800">
          <span>CANDIDATE TICKETS:</span>
          <span className="font-bold text-indigo-300 font-mono">
            {possibleTicketsBig.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
};
