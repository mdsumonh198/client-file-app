import React from 'react';
import { GameConfig } from '../types';
import { PRESETS } from '../lib/presets';
import { combinationCountBigInt } from '../lib/core';
import { Dices, Hash, Sparkles } from 'lucide-react';

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
    <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-5 shadow-lg backdrop-blur-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-slate-700/70 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg">
            <Dices className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">Game Parameters</h2>
            <p className="text-xs text-slate-400">Configure number range and draw sizes</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <select
            aria-label="Load a game preset"
            className="text-xs bg-slate-900 border border-slate-700 text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
              Load Preset...
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
        {/* Number From */}
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">
            Number From (min 0)
          </label>
          <input
            type="number"
            min={0}
            max={40}
            value={config.numberFrom}
            onChange={(e) => handleChange('numberFrom', parseInt(e.target.value, 10) || 0)}
            disabled={disabled}
            className="w-full bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
          />
        </div>

        {/* Number To */}
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">
            Number To (max 40)
          </label>
          <input
            type="number"
            min={0}
            max={40}
            value={config.numberTo}
            onChange={(e) => handleChange('numberTo', parseInt(e.target.value, 10) || 0)}
            disabled={disabled}
            className="w-full bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
          />
        </div>

        {/* Ticket Size */}
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">
            Ticket Size (k numbers)
          </label>
          <input
            type="number"
            min={1}
            max={poolSize || 40}
            value={config.ticketSize}
            onChange={(e) => handleChange('ticketSize', parseInt(e.target.value, 10) || 1)}
            disabled={disabled}
            className="w-full bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
          />
        </div>

        {/* Result Size */}
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">
            Result Size (drawn count)
          </label>
          <input
            type="number"
            min={1}
            max={poolSize || 40}
            value={config.resultSize}
            onChange={(e) => handleChange('resultSize', parseInt(e.target.value, 10) || 1)}
            disabled={disabled}
            className="w-full bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
          />
        </div>
      </div>

      {/* Combinatorial Overview Chips */}
      <div className="mt-4 pt-3 border-t border-slate-700/50 flex flex-wrap items-center gap-3 text-xs text-slate-400">
        <div className="flex items-center gap-1.5 bg-slate-900/60 px-2.5 py-1 rounded-md border border-slate-800">
          <Hash className="w-3.5 h-3.5 text-slate-400" />
          <span>Pool:</span>
          <span className="font-semibold text-slate-200">
            {poolSize} numbers ({config.numberFrom}..{config.numberTo})
          </span>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-900/60 px-2.5 py-1 rounded-md border border-slate-800">
          <span>Possible Tickets C({poolSize}, {config.ticketSize}):</span>
          <span className="font-semibold text-indigo-300">
            {possibleTicketsBig.toLocaleString()}
          </span>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-900/60 px-2.5 py-1 rounded-md border border-slate-800">
          <span>Possible Results C({poolSize}, {config.resultSize}):</span>
          <span className="font-semibold text-cyan-300">
            {possibleResultsBig.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
};
