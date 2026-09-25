import React, { useState, useMemo } from 'react';
import { Download, Copy, Check, Search, Ticket as TicketIcon } from 'lucide-react';

interface TicketsViewProps {
  tickets: number[][];
  highlightNumbers?: number[];
}

export const TicketsView: React.FC<TicketsViewProps> = ({ tickets, highlightNumbers = [] }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [copied, setCopied] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const highlightSet = useMemo(() => new Set(highlightNumbers), [highlightNumbers]);

  const filteredTickets = useMemo(() => {
    if (!searchTerm.trim()) return tickets;
    const searchNums = searchTerm
      .split(/[\s,]+/)
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));

    if (searchNums.length === 0) return tickets;

    return tickets.filter((ticket) =>
      searchNums.every((num) => ticket.includes(num))
    );
  }, [tickets, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredTickets.length / pageSize));
  const currentTickets = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredTickets.slice(start, start + pageSize);
  }, [filteredTickets, page]);

  const handleDownloadCSV = () => {
    if (tickets.length === 0) return;
    const header = tickets[0].map((_, i) => `N${i + 1}`).join(',');
    const rows = tickets.map((t) => t.join(',')).join('\n');
    const csvContent = `data:text/csv;charset=utf-8,${header}\n${rows}`;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'tickets.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyClipboard = () => {
    const text = tickets.map((t, idx) => `Ticket #${idx + 1}: ${t.join(', ')}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (tickets.length === 0) {
    return (
      <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-8 text-center">
        <TicketIcon className="w-10 h-10 text-slate-500 mx-auto mb-3" />
        <h3 className="text-sm font-semibold text-slate-300">No Tickets Generated</h3>
        <p className="text-xs text-slate-500 mt-1">
          Configure parameters and click &ldquo;Start Optimization&rdquo; to generate your ticket set.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-5 shadow-lg backdrop-blur-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-slate-700/70 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg">
            <TicketIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-white">Generated Tickets</h2>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">
                {tickets.length} total tickets
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Optimal combination set satisfying all requested guarantees
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleCopyClipboard}
            className="flex items-center gap-1.5 text-xs bg-slate-900 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg border border-slate-700 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied!' : 'Copy Tickets'}
          </button>
          <button
            type="button"
            onClick={handleDownloadCSV}
            className="flex items-center gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-3 py-1.5 rounded-lg shadow transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Download CSV
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-4">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Filter by numbers (e.g. 3, 7)..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>
              Page {page} of {totalPages} ({filteredTickets.length} tickets)
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-2 py-1 bg-slate-900 border border-slate-700 rounded disabled:opacity-40"
              >
                Prev
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-2 py-1 bg-slate-900 border border-slate-700 rounded disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tickets List */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5 max-h-[480px] overflow-y-auto pr-1">
        {currentTickets.map((ticket, idx) => {
          const globalIdx = (page - 1) * pageSize + idx + 1;
          const matchCount = highlightNumbers.length > 0
            ? ticket.filter((n) => highlightSet.has(n)).length
            : null;

          return (
            <div
              key={globalIdx}
              className="flex items-center justify-between bg-slate-900/80 border border-slate-700/60 rounded-lg p-2.5 hover:border-slate-600 transition-colors"
            >
              <span className="text-[11px] font-mono text-slate-400 w-10 shrink-0">
                #{globalIdx}
              </span>

              <div className="flex flex-wrap items-center gap-1.5 justify-end">
                {ticket.map((num) => {
                  const isHit = highlightSet.has(num);
                  return (
                    <span
                      key={num}
                      className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-all ${
                        isHit
                          ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-300 scale-105 shadow-sm'
                          : 'bg-slate-800 text-slate-200 border border-slate-700'
                      }`}
                    >
                      {String(num).padStart(2, '0')}
                    </span>
                  );
                })}
              </div>

              {matchCount !== null && (
                <span className="ml-2 text-[10px] font-semibold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 shrink-0">
                  {matchCount} match{matchCount === 1 ? '' : 'es'}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
