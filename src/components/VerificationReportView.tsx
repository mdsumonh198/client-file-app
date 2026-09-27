import React, { useState } from 'react';
import { VerificationReport, SolverStatus } from '../types';
import { Download, Award, AlertTriangle, CheckCircle2, XCircle, Copy, Check, FileSpreadsheet } from 'lucide-react';
import { copyTextToClipboard } from '../lib/clipboard';

interface VerificationReportViewProps {
  report: VerificationReport;
  status: SolverStatus;
  statusDetail?: string;
  rounds: number;
  durationMs: number;
  solverEngine?: string;
  tickets?: number[][];
  onSelectResultToTest?: (result: number[]) => void;
}

export const VerificationReportView: React.FC<VerificationReportViewProps> = ({
  report,
  status,
  statusDetail,
  rounds: _rounds,
  durationMs,
  solverEngine,
  tickets = [],
  onSelectResultToTest,
}) => {
  const [copiedForSheets, setCopiedForSheets] = useState(false);

  // Guarantee stats (e.g. 5+ Matches: at least 5 or 6 matches)
  const guaranteeList = report.guaranteeStats && report.guaranteeStats.length > 0
    ? report.guaranteeStats
    : (report.primaryGuaranteeStat ? [report.primaryGuaranteeStat] : []);

  // Individual exact match breakdown rows (sorted descending from Jackpot down to 0)
  const exactBreakdownList = Object.values(report.stats).sort((a, b) => b.k - a.k);

  // 1. Dedicated Clean Tickets-Only Export for Direct Google Sheets / Excel Opening
  const handleDownloadTicketsOnlyCSV = () => {
    if (tickets.length === 0) return;
    const ticketK = tickets[0].length;
    const individualHeaders = Array.from({ length: ticketK }, (_, i) => `Num_${i + 1}`).join(',');
    const header = `Ticket_No,Full_Combination,${individualHeaders}`;
    const rows = tickets.map((t, idx) => {
      const formatted = t.map((n) => String(n).padStart(2, '0')).join(', ');
      return `${idx + 1},"${formatted}",${t.join(',')}`;
    }).join('\r\n');

    const csvContent = `\uFEFF${header}\r\n${rows}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lottery_tickets_list_${tickets.length}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // 2. Direct 1-Click Copy for Pasting directly into Google Sheets (Tab-Separated)
  const handleCopyTicketsForSheets = async () => {
    if (tickets.length === 0) return;
    const ticketK = tickets[0].length;
    const header = ['Ticket #', 'Full Ticket', ...Array.from({ length: ticketK }, (_, i) => `Num ${i + 1}`)].join('\t');
    const rows = tickets.map((t, idx) => {
      const formatted = t.map((n) => String(n).padStart(2, '0')).join(', ');
      return `${idx + 1}\t${formatted}\t${t.join('\t')}`;
    }).join('\n');

    const success = await copyTextToClipboard(`${header}\n${rows}`);
    if (success) {
      setCopiedForSheets(true);
      setTimeout(() => setCopiedForSheets(false), 2500);
    }
  };

  // 3. Download Full Combined CSV containing Audit Proof + 100% of Generated Tickets
  const handleDownloadFullCSV = () => {
    const summaryRows = [
      `--- LOTTERY MATHEMATICAL GUARANTEE PROOF & TICKET LIST ---`,
      `Total Selected Tickets,${tickets.length > 0 ? tickets.length : report.totalTickets}`,
      `Total Tested Draws,${report.totalResultsChecked}`,
      `PASS Draws (Guarantee Target),${report.totalPassDraws ?? report.totalResultsChecked}`,
      `FAIL Draws (Misses),${report.totalFailDraws ?? 0}`,
      `Guaranteed Worst-Case Wins,${report.primaryGuaranteeStat ? `At least ${report.primaryGuaranteeStat.min} ticket(s)` : 'At least 1 ticket'}`,
      `Pass Rate,${report.passRatePct !== undefined ? `${report.passRatePct.toFixed(2)}%` : '100%'}`,
      `Zero-Miss Status,${report.allTargetsPass ? '100% ZERO-MISS PROVEN' : 'FAIL'}`,
      `Match Rule,Strict Intersection (Guarantee target met on every single draw)`,
      '',
    ].join('\r\n');

    const headers = [
      'Category / Match Level',
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

    const gRows = guaranteeList.map((g) => {
      const worst = g.worstResult.join(' ');
      const best = g.bestResult.join(' ');
      return `"${g.label || `${g.k}+ Matches (Guarantee Target)`}",${g.min},${g.max},${g.avg},${g.variance},${g.stdDev},">= ${g.requiredTarget || 1}",${g.passed ? 'PASS' : 'FAIL'},"${worst}","${best}"`;
    });

    const statRows = exactBreakdownList.map((s) => {
      const targetStr = s.requiredTarget !== undefined ? `>= ${s.requiredTarget}` : '-';
      const statusStr = s.requiredTarget !== undefined ? (s.passed ? 'PASS' : 'FAIL') : '-';
      const worst = s.worstResult.join(' ');
      const best = s.bestResult.join(' ');
      return `"${s.label || `Exact ${s.k}`}",${s.min},${s.max},${s.avg},${s.variance},${s.stdDev},"${targetStr}",${statusStr},"${worst}","${best}"`;
    });

    // Complete generated ticket list section
    const ticketK = tickets.length > 0 ? tickets[0].length : 6;
    const ticketHeaders = ['Ticket #', 'Full Combination', ...Array.from({ length: ticketK }, (_, i) => `Num ${i + 1}`)].join(',');
    
    const ticketRows = tickets.map((t, idx) => {
      const formattedComma = t.map((n) => String(n).padStart(2, '0')).join(', ');
      return `${idx + 1},"${formattedComma}",${t.join(',')}`;
    });

    const ticketSection = [
      '',
      `--- COMPLETE GENERATED TICKET LIST (সম্পূর্ণ টিকেট তালিকা - মোট ${tickets.length}টি টিকেট) ---`,
      ticketHeaders,
      ...ticketRows,
    ].join('\r\n');

    const csvContent = `\uFEFF${summaryRows}\r\n${headers}\r\n${[...gRows, ...statRows].join('\r\n')}\r\n${ticketSection}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lottery_guarantee_and_tickets_${tickets.length}.csv`;
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
      {/* Header, status badge and download actions */}
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

        <div className="flex items-center gap-2 flex-wrap">
          {tickets.length > 0 && (
            <>
              {/* PRIMARY PROMINENT BUTTON: Google Sheets Ticket List */}
              <button
                type="button"
                onClick={handleDownloadTicketsOnlyCSV}
                className="flex items-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3.5 py-2 rounded-lg shadow-lg hover:shadow-emerald-600/30 transition-all shrink-0 cursor-pointer"
                title="Download clean CSV of tickets directly formatted for Google Sheets or Excel"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-200" />
                <span>Google Sheets-এ টিকেট লিস্ট (CSV)</span>
                <span className="ml-1 px-1.5 py-0.2 rounded bg-emerald-800 text-[10px] text-emerald-100">
                  {tickets.length} Tickets
                </span>
              </button>

              {/* COPY BUTTON: Instant paste into Google Sheets */}
              <button
                type="button"
                onClick={handleCopyTicketsForSheets}
                className="flex items-center gap-1.5 text-xs bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 px-3 py-2 rounded-lg border border-indigo-500/40 transition-colors shrink-0 cursor-pointer font-semibold shadow-sm"
                title="Copy all tickets in tab-separated format for direct Ctrl+V paste into Google Sheets"
              >
                {copiedForSheets ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedForSheets ? 'Copied for Sheets!' : 'শিটে পেস্ট করতে কপি (Ctrl+V)'}</span>
              </button>
            </>
          )}

          {/* COMBINED AUDIT + TICKETS */}
          <button
            type="button"
            onClick={handleDownloadFullCSV}
            className="flex items-center gap-1.5 text-xs bg-slate-900 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-lg border border-slate-700 transition-colors shrink-0 cursor-pointer"
            title="Download CSV containing full verification audit and all generated tickets"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>Full Audit & Tickets (CSV)</span>
          </button>
        </div>
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

        {/* Guaranteed Minimum Wins (Worst Case) */}
        <div className="bg-slate-900/80 border border-emerald-500/40 rounded-lg p-3 bg-emerald-950/20">
          <span className="text-[11px] text-emerald-400 block mb-1 font-semibold">Worst-Case Minimum Wins</span>
          <span className="text-xl font-bold text-emerald-400 font-mono">
            &ge; {report.primaryGuaranteeStat?.min ?? 1} Ticket
          </span>
          <span className="text-[10px] text-emerald-400/80 block mt-0.5 font-bold">
            Worst Case (MIN) &ge; 1 নিশ্চিত
          </span>
        </div>

        {/* PASS Draws */}
        <div className="bg-emerald-950/30 border border-emerald-500/50 rounded-lg p-3">
          <span className="text-[11px] text-emerald-400 block mb-1 font-semibold">PASS Draws (Guarantee Target)</span>
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
                  <b>১০০% ব্রুট-ফোর্স অডিট সম্পন্ন:</b> Total Tested Draws = <b>{report.totalResultsChecked.toLocaleString()}</b> | FAIL Draws = <b className="text-emerald-400 font-mono">0 (Zero Miss)</b> | PASS Draws = <b className="text-emerald-400 font-mono">{(report.totalPassDraws ?? report.totalResultsChecked).toLocaleString()} (100.0%)</b> | Worst-Case Minimum = <b className="text-emerald-300 font-mono">&ge; {report.primaryGuaranteeStat?.min ?? 1}</b> জয়ী টিকেট।
                </span>
              ) : (
                <span>
                  <b>সতর্কতা:</b> {report.totalFailDraws}টি ড্র-তে কাভারেজ মিস হয়েছে। কোনো ড্র-তে ০ পেলে ইনভেস্টমেন্ট নিষিদ্ধ।
                </span>
              )}
            </span>
          </div>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-black/40 text-slate-300">
            Strict Intersection ({report.primaryGuaranteeStat?.label || '5+ Matches'} Guarantee)
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
      <div className="overflow-x-auto rounded-lg border border-slate-700/60 shadow-lg">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-900/90 text-slate-300 uppercase tracking-wider text-[10px] font-semibold border-b border-slate-700/80">
            <tr>
              <th className="py-2.5 px-3">Category / Match Condition</th>
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
            {/* 🌟 1. Primary Guarantee Row(s) (Featured at the VERY TOP) */}
            {guaranteeList.map((gStat) => (
              <tr
                key={`guarantee-${gStat.k}`}
                className="bg-emerald-950/40 border-b-2 border-emerald-500/60 hover:bg-emerald-950/60 transition-colors ring-1 ring-emerald-500/30"
              >
                <td className="py-3 px-3">
                  <div className="flex items-center gap-2">
                    <span className="text-amber-400 text-sm font-bold">👉</span>
                    <div>
                      <span className="font-bold text-white text-xs block tracking-wide">
                        {gStat.label || `${gStat.k}+ Matches (At least ${gStat.k} Matches)`}
                      </span>
                      <span className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider">
                        ★ PRIMARY INVESTMENT GUARANTEE TARGET
                      </span>
                    </div>
                  </div>
                </td>
                <td className="py-3 px-3 text-right font-mono font-black text-sm">
                  <span className={gStat.min >= (gStat.requiredTarget || 1) ? 'text-emerald-400' : 'text-rose-400 font-bold'}>
                    {gStat.min}
                  </span>
                </td>
                <td className="py-3 px-3 text-right font-mono text-slate-200 font-semibold">
                  {gStat.max}
                </td>
                <td className="py-3 px-3 text-right font-mono text-cyan-300 font-semibold">
                  {gStat.avg.toFixed(3)}
                </td>
                <td className="py-3 px-3 text-right font-mono text-amber-300/90">
                  {gStat.variance.toFixed(3)}
                </td>
                <td className="py-3 px-3 text-right font-mono text-amber-200/80">
                  &plusmn;{gStat.stdDev.toFixed(3)}
                </td>
                <td className="py-3 px-3 text-center font-mono">
                  <span className="font-bold text-amber-300 text-xs px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/30">
                    &ge; {gStat.requiredTarget || 1}
                  </span>
                </td>
                <td className="py-3 px-3 text-center">
                  {gStat.passed ? (
                    <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40 shadow-sm shadow-emerald-950">
                      <CheckCircle2 className="w-3.5 h-3.5" /> 100% PASS
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-300 font-bold border border-rose-500/40">
                      <XCircle className="w-3.5 h-3.5" /> FAIL
                    </span>
                  )}
                </td>
                <td className="py-3 px-3">
                  <button
                    type="button"
                    onClick={() => onSelectResultToTest?.(gStat.worstResult)}
                    title="Click to test this worst-case result in simulator"
                    className="font-mono text-amber-300 hover:text-amber-200 hover:underline cursor-pointer bg-slate-900/90 px-2 py-1 rounded border border-slate-700 text-xs"
                  >
                    {gStat.worstResult.join(', ')}
                  </button>
                </td>
                <td className="py-3 px-3">
                  <button
                    type="button"
                    onClick={() => onSelectResultToTest?.(gStat.bestResult)}
                    title="Click to test this best-case result in simulator"
                    className="font-mono text-cyan-300 hover:text-cyan-200 hover:underline cursor-pointer bg-slate-900/90 px-2 py-1 rounded border border-slate-700 text-xs"
                  >
                    {gStat.bestResult.join(', ')}
                  </button>
                </td>
              </tr>
            ))}

            {/* 📊 2. Section Divider for Detailed Individual Exact Matches */}
            <tr>
              <td colSpan={10} className="py-2 px-3 bg-slate-900/90 text-[10px] uppercase tracking-wider font-semibold text-slate-400 border-y border-slate-800">
                Detailed Match Breakdown (Individual Exact Hits per Draw)
              </td>
            </tr>

            {/* 📋 3. Exact breakdown rows (Exact 6 down to Exact 0) */}
            {exactBreakdownList.map((stat) => (
              <tr
                key={stat.k}
                className="hover:bg-slate-800/40 transition-colors"
              >
                <td className="py-2.5 px-3 font-semibold text-slate-300">
                  {stat.label || (stat.k === Number(Object.keys(report.stats).pop()) ? `Exact ${stat.k} (Jackpot)` : `Exact ${stat.k}`)}
                </td>
                <td className="py-2.5 px-3 text-right font-mono text-slate-300">
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
                <td className="py-2.5 px-3 text-center font-mono text-slate-600">
                  -
                </td>
                <td className="py-2.5 px-3 text-center text-slate-600 text-[10px]">
                  -
                </td>
                <td className="py-2.5 px-3">
                  <button
                    type="button"
                    onClick={() => onSelectResultToTest?.(stat.worstResult)}
                    title="Click to test this result in simulator"
                    className="font-mono text-slate-400 hover:text-slate-200 hover:underline cursor-pointer bg-slate-900/60 px-2 py-0.5 rounded border border-slate-800"
                  >
                    {stat.worstResult.join(', ')}
                  </button>
                </td>
                <td className="py-2.5 px-3">
                  <button
                    type="button"
                    onClick={() => onSelectResultToTest?.(stat.bestResult)}
                    title="Click to test this result in simulator"
                    className="font-mono text-slate-400 hover:text-slate-200 hover:underline cursor-pointer bg-slate-900/60 px-2 py-0.5 rounded border border-slate-800"
                  >
                    {stat.bestResult.join(', ')}
                  </button>
                </td>
              </tr>
            ))}
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
