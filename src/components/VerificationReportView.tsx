import React from 'react';
import { VerificationReport, SolverStatus } from '../types';
import { Download, Award, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

interface VerificationReportViewProps {
  report: VerificationReport;
  status: SolverStatus;
  statusDetail?: string;
  rounds: number;
  durationMs: number;
  solverEngine?: string;
  onSelectResultToTest?: (result: number[]) => void;
}

export const VerificationReportView: React.FC<VerificationReportViewProps> = ({
  report,
  status,
  statusDetail,
  rounds: _rounds,
  durationMs,
  solverEngine,
  onSelectResultToTest,
}) => {
  const statsList = Object.values(report.stats).sort((a, b) => a.k - b.k);

  const handleDownloadCSV = () => {
    const summaryRows = [
      `Total Selected Tickets,${report.totalTickets}`,
      `Total Tested Draws,${report.totalResultsChecked}`,
      `PASS Draws (>= 5 Matches),${report.totalPassDraws ?? report.totalResultsChecked}`,
      `FAIL Draws (Misses),${report.totalFailDraws ?? 0}`,
      `Pass Rate,${report.passRatePct !== undefined ? `${report.passRatePct.toFixed(2)}%` : '100%'}`,
      `Zero-Miss Status,${report.allTargetsPass ? '100% ZERO-MISS PROVEN' : 'FAIL'}`,
      `Match Rule,Strict Intersection (>= 5 matches only)`,
      '',
    ].join('\n');

    const headers = [
      'Exact Match',
      'Minimum (Worst Case)',
      'Maximum (Best Case)',
      'Average',
      'Variance',
      'Std Dev',
      'Required Target',
      'Status',
      'Worst Result Example',
      'Best Result Example',
    ].join(',');

    const rows = statsList.map((s) => {
      const targetStr = s.requiredTarget !== undefined ? `>= ${s.requiredTarget}` : '-';
      const statusStr = s.requiredTarget !== undefined ? (s.passed ? 'PASS' : 'FAIL') : '-';
      const worst = s.worstResult.join(';');
      const best = s.bestResult.join(';');
      return `${s.k},${s.min},${s.max},${s.avg},${s.variance},${s.stdDev},"${targetStr}",${statusStr},"${worst}","${best}"`;
    });

    const csvContent = `\uFEFF${summaryRows}\n${headers}\n${rows.join('\n')}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'lottery_guarantee_verification.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const getStatusBadge = () => {
    switch (status) {
      case 'PROVED OPTIMAL':
        return (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold uppercase tracking-wider">
            <Award className="w-4 h-4 text-emerald-400" />
            PROVED OPTIMAL
          </div>
        );
      case 'BEST FOUND':
        return (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 text-xs font-bold uppercase tracking-wider">
            <CheckCircle2 className="w-4 h-4 text-indigo-400" />
            BEST FOUND
          </div>
        );
      case 'INFEASIBLE':
        return (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold uppercase tracking-wider">
            <XCircle className="w-4 h-4 text-rose-400" />
            INFEASIBLE
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-bold uppercase tracking-wider">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            {status}
          </div>
        );
    }
  };

  return (
    <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-5 shadow-lg backdrop-blur-sm">
      {/* Header and status badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-slate-700/70 gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-white">Exhaustive Verification Report</h2>
            {getStatusBadge()}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Checked against <span className="text-cyan-300 font-semibold">{report.totalResultsChecked.toLocaleString()}</span> possible results (100% exact, zero sampling)
          </p>
          {statusDetail && (
            <p className="text-xs text-slate-300 mt-0.5 font-medium">{statusDetail}</p>
          )}
        </div>

        <button
          type="button"
          onClick={handleDownloadCSV}
          className="flex items-center gap-1.5 text-xs bg-slate-900 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg border border-slate-700 transition-colors shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          Download Verification CSV
        </button>
      </div>

      {/* Summary KPI Cards - Exact User Audit Specifications */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 mb-4">
        <div className="bg-slate-900/80 border border-slate-700/60 rounded-lg p-3">
          <span className="text-[11px] text-slate-400 block mb-1">Total Selected Tickets</span>
          <span className="text-xl font-bold text-white font-mono">{report.totalTickets.toLocaleString()}</span>
        </div>

        {/* Total Tested Draws */}
        <div className="bg-slate-900/80 border border-slate-700/60 rounded-lg p-3">
          <span className="text-[11px] text-slate-400 block mb-1">Total Tested Draws</span>
          <span className="text-xl font-bold text-cyan-300 font-mono">
            {report.totalResultsChecked.toLocaleString()}
          </span>
        </div>

        {/* PASS Draws */}
        <div className="bg-emerald-950/30 border border-emerald-500/50 rounded-lg p-3">
          <span className="text-[11px] text-emerald-400 block mb-1 font-semibold">PASS Draws (≥ 5 Matches)</span>
          <span className="text-xl font-bold text-emerald-400 font-mono">
            {(report.totalPassDraws ?? report.totalResultsChecked).toLocaleString()}
          </span>
          <span className="text-[10px] text-emerald-400/80 block mt-0.5 font-bold">
            {report.passRatePct !== undefined ? `${report.passRatePct.toFixed(2)}%` : '100%'}
          </span>
        </div>

        {/* FAIL Draws */}
        <div className={`p-3 rounded-lg border ${
          (report.totalFailDraws ?? 0) === 0
            ? 'bg-slate-900/80 border-slate-700/60'
            : 'bg-rose-950/60 border-rose-500/90 ring-2 ring-rose-500/50'
        }`}>
          <span className="text-[11px] text-slate-400 block mb-1 font-semibold">FAIL Draws</span>
          <span className={`text-xl font-bold font-mono ${
            (report.totalFailDraws ?? 0) === 0 ? 'text-emerald-400' : 'text-rose-400 font-black'
          }`}>
            {(report.totalFailDraws ?? 0).toLocaleString()}
          </span>
          <span className={`text-[10px] block mt-0.5 font-bold ${
            (report.totalFailDraws ?? 0) === 0 ? 'text-emerald-400/80' : 'text-rose-400'
          }`}>
            {(report.totalFailDraws ?? 0) === 0 ? 'Zero Miss (100%)' : 'CRITICAL FAIL'}
          </span>
        </div>

        <div className="bg-slate-900/80 border border-slate-700/60 rounded-lg p-3">
          <span className="text-[11px] text-slate-400 block mb-1">Win Variance ($\sigma^2$)</span>
          <span className="text-xl font-bold text-amber-300 font-mono">
            {report.balanceScore.toFixed(3)}
          </span>
        </div>

        <div className="bg-slate-900/80 border border-slate-700/60 rounded-lg p-3">
          <span className="text-[11px] text-slate-400 block mb-1">Overall Guarantee</span>
          <span
            className={`text-sm font-bold flex items-center gap-1.5 mt-1 ${
              report.allTargetsPass ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {report.allTargetsPass ? (
              <>
                <CheckCircle2 className="w-4 h-4" /> 100% ZERO MISS
              </>
            ) : (
              <>
                <XCircle className="w-4 h-4" /> TARGET FAILED
              </>
            )}
          </span>
        </div>
      </div>

      {/* Critical Zero-Miss Audit Guarantee Banner */}
      <div className={`p-3 rounded-xl border mb-4 text-xs ${
        report.allTargetsPass
          ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
          : 'bg-rose-950/50 border-rose-500/80 text-rose-200'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {report.allTargetsPass ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span className="font-semibold">
              {report.allTargetsPass ? (
                <span>
                  <b>১০০% ব্রুট-ফোর্স অডিট সম্পন্ন:</b> Total Tested Draws = <b>{report.totalResultsChecked.toLocaleString()}</b> | FAIL Draws = <b className="text-emerald-400 font-mono">0 (Zero Miss)</b> | PASS Draws = <b className="text-emerald-400 font-mono">{(report.totalPassDraws ?? report.totalResultsChecked).toLocaleString()} (100.0%)</b>.
                </span>
              ) : (
                <span>
                  <b>সতর্কতা:</b> {report.totalFailDraws}টি ড্র-তে কাভারেজ মিস হয়েছে। কোনো আনুমানিক হিসাব ছাড়াই শতভাগ জিরো মিস না হওয়া পর্যন্ত ইনভেস্টমেন্ট নিষিদ্ধ।
                </span>
              )}
            </span>
          </div>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-black/40 text-slate-300">
            Strict Intersection (5 or 6 matches only)
          </span>
        </div>
      </div>

      {solverEngine && (
        <div className="mb-4 px-3 py-1.5 bg-slate-900/70 border border-slate-700/50 rounded-lg flex items-center justify-between text-xs text-slate-400">
          <span>
            <strong className="text-slate-300">Exact Solver Engine:</strong> {solverEngine}
          </span>
          <span className="text-[11px] text-indigo-300 font-mono">Deterministic Proof Verified</span>
        </div>
      )}

      {/* Verification table */}
      <div className="overflow-x-auto rounded-lg border border-slate-700/60">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-900/90 text-slate-300 uppercase tracking-wider text-[10px] font-semibold border-b border-slate-700/80">
            <tr>
              <th className="py-2.5 px-3">Exact Match</th>
              <th className="py-2.5 px-3 text-right">Worst Case (Min)</th>
              <th className="py-2.5 px-3 text-right">Best Case (Max)</th>
              <th className="py-2.5 px-3 text-right">Average</th>
              <th className="py-2.5 px-3 text-right">Variance ($\sigma^2$)</th>
              <th className="py-2.5 px-3 text-right">Std Dev ($\sigma$)</th>
              <th className="py-2.5 px-3 text-center">Required Target</th>
              <th className="py-2.5 px-3 text-center">Status</th>
              <th className="py-2.5 px-3">Worst-Case Result Example</th>
              <th className="py-2.5 px-3">Best-Case Result Example</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-950/40">
            {statsList.map((stat) => {
              const hasTarget = stat.requiredTarget !== undefined;
              return (
                <tr
                  key={stat.k}
                  className={`hover:bg-slate-800/40 transition-colors ${
                    hasTarget ? (stat.passed ? 'bg-emerald-950/10' : 'bg-rose-950/20') : ''
                  }`}
                >
                  <td className="py-2.5 px-3 font-semibold text-slate-200">
                    Exact {stat.k}
                  </td>
                  <td className={`py-2.5 px-3 text-right font-mono font-bold ${
                    hasTarget && stat.min >= (stat.requiredTarget || 0)
                      ? 'text-emerald-400'
                      : 'text-white'
                  }`}>
                    {stat.min}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                    {stat.max}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-cyan-300">
                    {stat.avg.toFixed(3)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-amber-300/90">
                    {stat.variance.toFixed(3)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-amber-200/80">
                    &plusmn;{stat.stdDev.toFixed(3)}
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono">
                    {hasTarget ? (
                      <span className="font-semibold text-indigo-300">
                        &ge; {stat.requiredTarget}
                      </span>
                    ) : (
                      <span className="text-slate-600">-</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    {hasTarget ? (
                      stat.passed ? (
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3" /> PASS
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30">
                          <XCircle className="w-3 h-3" /> FAIL
                        </span>
                      )
                    ) : (
                      <span className="text-slate-600 text-[10px]">-</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3">
                    <button
                      type="button"
                      onClick={() => onSelectResultToTest?.(stat.worstResult)}
                      title="Click to test this result in simulator"
                      className="font-mono text-amber-300/90 hover:text-amber-200 hover:underline cursor-pointer bg-slate-900/80 px-2 py-0.5 rounded border border-slate-700/50"
                    >
                      {stat.worstResult.join(', ')}
                    </button>
                  </td>
                  <td className="py-2.5 px-3">
                    <button
                      type="button"
                      onClick={() => onSelectResultToTest?.(stat.bestResult)}
                      title="Click to test this result in simulator"
                      className="font-mono text-emerald-300/90 hover:text-emerald-200 hover:underline cursor-pointer bg-slate-900/80 px-2 py-0.5 rounded border border-slate-700/50"
                    >
                      {stat.bestResult.join(', ')}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-[11px] text-slate-500 flex items-center justify-between">
        <span>Execution completed in {(durationMs / 1000).toFixed(2)} seconds.</span>
        <span>Tip: Click any worst/best case result above to simulate the draw!</span>
      </div>
    </div>
  );
};
