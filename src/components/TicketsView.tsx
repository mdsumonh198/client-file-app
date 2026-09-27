import React, { useState, useMemo } from 'react';
import {
  Download,
  Copy,
  Check,
  Search,
  Ticket as TicketIcon,
  Sparkles,
  Trophy,
  Filter,
  HelpCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface TicketsViewProps {
  tickets: number[][];
  highlightNumbers?: number[];
  resultSize?: number;
  activeMatchTab?: number | 'all';
  onMatchTabChange?: (tab: number | 'all') => void;
}

export const TicketsView: React.FC<TicketsViewProps> = ({
  tickets,
  highlightNumbers = [],
  resultSize = 6,
  activeMatchTab,
  onMatchTabChange,
}) => {
  const [internalTab, setInternalTab] = useState<number | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [copied, setCopied] = useState(false);
  const [page, setPage] = useState(1);
  const [showExplanation, setShowExplanation] = useState(true);
  const pageSize = 50;

  const currentTab = activeMatchTab !== undefined ? activeMatchTab : internalTab;
  const setTab = (tab: number | 'all') => {
    if (onMatchTabChange) {
      onMatchTabChange(tab);
    } else {
      setInternalTab(tab);
    }
    setPage(1);
  };

  const highlightSet = useMemo(() => new Set(highlightNumbers), [highlightNumbers]);

  // Pre-calculate exact matches per ticket against the active drawn result
  const ticketMatches = useMemo(() => {
    if (!highlightNumbers || highlightNumbers.length === 0) return null;
    return tickets.map((t) => t.filter((n) => highlightSet.has(n)).length);
  }, [tickets, highlightNumbers, highlightSet]);

  // Aggregate count of tickets for each match level (e.g. 0 to resultSize)
  const matchCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (let k = 0; k <= resultSize; k++) {
      counts[k] = 0;
    }
    if (!ticketMatches) return counts;
    for (const m of ticketMatches) {
      if (counts[m] !== undefined) {
        counts[m]++;
      } else {
        counts[m] = 1;
      }
    }
    return counts;
  }, [ticketMatches, resultSize]);

  // Filter tickets by selected match tab
  const tabFilteredItems = useMemo(() => {
    if (currentTab === 'all' || !ticketMatches) {
      return tickets.map((t, idx) => ({
        ticket: t,
        globalIdx: idx + 1,
        matchCount: ticketMatches ? ticketMatches[idx] : null,
      }));
    }

    const items: { ticket: number[]; globalIdx: number; matchCount: number | null }[] = [];
    for (let i = 0; i < tickets.length; i++) {
      if (ticketMatches[i] === currentTab) {
        items.push({
          ticket: tickets[i],
          globalIdx: i + 1,
          matchCount: ticketMatches[i],
        });
      }
    }
    return items;
  }, [tickets, ticketMatches, currentTab]);

  // Apply number search query
  const filteredTickets = useMemo(() => {
    if (!searchTerm.trim()) return tabFilteredItems;
    const searchNums = searchTerm
      .split(/[\s,]+/)
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));

    if (searchNums.length === 0) return tabFilteredItems;

    return tabFilteredItems.filter((item) =>
      searchNums.every((num) => item.ticket.includes(num))
    );
  }, [tabFilteredItems, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredTickets.length / pageSize));
  const currentTickets = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredTickets.slice(start, start + pageSize);
  }, [filteredTickets, page]);

  const [copiedSingleCol, setCopiedSingleCol] = useState(false);
  const [copiedTicketId, setCopiedTicketId] = useState<number | null>(null);

  const handleDownloadCSV = (onlyCurrentTab: boolean = false) => {
    const exportItems = onlyCurrentTab
      ? filteredTickets
      : tickets.map((t, idx) => ({
          ticket: t,
          globalIdx: idx + 1,
          matchCount: ticketMatches ? ticketMatches[idx] : null,
        }));

    if (exportItems.length === 0) return;

    const sampleTicket = exportItems[0].ticket;
    const individualHeaders = sampleTicket.map((_, i) => `N${i + 1}`).join(',');

    // Column B has the FULL ticket numbers in 1 single column for easy copying in Google Sheets / Excel
    const header = `Ticket #,Full Ticket (Single Column),Full Ticket (Space Separated),Match Count,${individualHeaders}`;

    const rows = exportItems.map((item) => {
      const formattedComma = item.ticket.map((n) => String(n).padStart(2, '0')).join(', ');
      const formattedSpace = item.ticket.map((n) => String(n).padStart(2, '0')).join(' ');
      const matchStr = item.matchCount !== null ? item.matchCount : '';
      const splitNums = item.ticket.join(',');
      return `${item.globalIdx},"${formattedComma}","${formattedSpace}",${matchStr},${splitNums}`;
    }).join('\n');

    const csvContent = `data:text/csv;charset=utf-8,\uFEFF${header}\n${rows}`;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    const filename = onlyCurrentTab && currentTab !== 'all'
      ? `tickets_${currentTab}_match.csv`
      : 'tickets_all.csv';
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Copy pure 1-column ticket list (e.g. "02, 03, 04, 05, 06, 07\n01, 03, ...")
  const handleCopySingleColumn = (onlyCurrentTab: boolean = false) => {
    const exportItems = onlyCurrentTab
      ? filteredTickets
      : tickets.map((t, idx) => ({ ticket: t, globalIdx: idx + 1, matchCount: null }));
    if (exportItems.length === 0) return;

    const text = exportItems
      .map((item) => item.ticket.map((n) => String(n).padStart(2, '0')).join(', '))
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopiedSingleCol(true);
    setTimeout(() => setCopiedSingleCol(false), 2000);
  };

  const handleCopyClipboard = (onlyCurrentTab: boolean = false) => {
    const exportList = onlyCurrentTab ? filteredTickets : tickets.map((t, idx) => ({ ticket: t, globalIdx: idx + 1, matchCount: null }));
    if (exportList.length === 0) return;

    const text = exportList
      .map((item) => `Ticket #${item.globalIdx}: ${item.ticket.map((n) => String(n).padStart(2, '0')).join(', ')}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopySingleTicket = (ticket: number[], idx: number) => {
    const text = ticket.map((n) => String(n).padStart(2, '0')).join(', ');
    navigator.clipboard.writeText(text);
    setCopiedTicketId(idx);
    setTimeout(() => setCopiedTicketId(null), 1500);
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

  // Generate tabs list in descending order from resultSize down to 0
  const matchTabsList = Array.from({ length: resultSize + 1 }, (_, i) => resultSize - i);

  return (
    <div id="tickets-section" className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-5 shadow-lg backdrop-blur-sm space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-700/70 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg">
            <TicketIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white">Generated Tickets Matrix</h2>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                {tickets.length.toLocaleString()} total tickets
              </span>
            </div>
            <p className="text-xs text-slate-400">
              সকল ড্র-এর বিপরীতে গ্যারান্টিযুক্ত টিকিট সেট (যেকোনো ড্র টেস্ট করে ম্যাচ অনুযায়ী ফিল্টার করুন)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Copy 1-Column Format (Directly ready to paste into 1 column of Google Sheets / Excel) */}
          <button
            type="button"
            onClick={() => handleCopySingleColumn(currentTab !== 'all')}
            className="flex items-center gap-1.5 text-xs bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 px-3 py-1.5 rounded-lg border border-emerald-500/40 transition-colors cursor-pointer font-semibold shadow-sm"
            title="১টি কলামে লাইন বাই লাইন পুরো টিকেট কপি করুন (সহজে শিটে পেস্ট করার জন্য)"
          >
            {copiedSingleCol ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedSingleCol ? 'Copied 1-Col!' : currentTab !== 'all' ? `Copy 1-Col (${currentTab}-Match)` : 'Copy 1-Column List'}
          </button>

          <button
            type="button"
            onClick={() => handleCopyClipboard(currentTab !== 'all')}
            className="flex items-center gap-1.5 text-xs bg-slate-900 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg border border-slate-700 transition-colors cursor-pointer"
            title={currentTab !== 'all' ? `Copy only ${currentTab}-match tickets with ID` : 'Copy all tickets with ID'}
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied!' : 'Copy with #ID'}
          </button>

          <button
            type="button"
            onClick={() => handleDownloadCSV(currentTab !== 'all')}
            className="flex items-center gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-3 py-1.5 rounded-lg shadow transition-colors cursor-pointer"
            title="Download CSV (শিটের কলাম B-তে পুরো টিকেট নম্বর ১টি সেলে থাকবে)"
          >
            <Download className="w-3.5 h-3.5" />
            {currentTab !== 'all' ? `Download ${currentTab}-Match CSV` : 'Download CSV (1-Col Sheet)'}
          </button>
        </div>
      </div>

      {/* Explanation Banner (Why so many tickets for 100% full universe covering vs single draw) */}
      <div className="bg-slate-950/70 border border-indigo-500/30 rounded-xl p-3.5 text-xs text-slate-300">
        <div
          className="flex items-center justify-between cursor-pointer select-none"
          onClick={() => setShowExplanation(!showExplanation)}
        >
          <div className="flex items-center gap-2 text-indigo-300 font-semibold">
            <HelpCircle className="w-4 h-4 text-indigo-400 shrink-0" />
            <span>কেন মোট {tickets.length.toLocaleString()}টি টিকিট এসেছে এবং ড্র-তে কীভাবে ম্যাচ কাজ করে?</span>
          </div>
          <button type="button" className="text-slate-400 hover:text-white p-1">
            {showExplanation ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {showExplanation && (
          <div className="mt-2.5 pt-2.5 border-t border-slate-800 space-y-1.5 text-[11px] leading-relaxed text-slate-300">
            <p>
              • <b className="text-emerald-400">১০০% গ্যারান্টি (Full Universe Wheel):</b> লটারিতে ১–২৭ নম্বরের মধ্যে মোট <b>২৯৬,০১০টি</b> সম্ভাব্য ড্র হতে পারে। ১টি টিকিট মাত্র ১২৬টি ভিন্ন ড্র-এর সাথে ৫-ম্যাচ দিতে পারে। ভবিষ্যতের <b>যেকোনো অজানা ড্র</b> আসুক না কেন, কোনো মিস ছাড়া অন্তত ১টি ৫-ম্যাচ নিশ্চিত করতেই সম্পূর্ণ গাণিতিক কাভারেজে মোট {tickets.length.toLocaleString()}টি টিকিটের প্রয়োজন হয়।
            </p>
            <p>
              • <b className="text-amber-300">নির্দিষ্ট ড্র-এর ক্ষেত্রে ম্যাচ বণ্টন:</b> লটারির যেকোনো <b>একটি ড্র-তে</b> সব টিকিট একই সাথে ৫-ম্যাচ করে না। কিছু টিকিট ৫ মিলবে, কিছু ৪, কিছু ৩, এবং বাকিগুলো ২ বা ১ মিলবে।
            </p>
            <p>
              • <b className="text-cyan-300">ট্যাব নির্বাচন করুন:</b> বর্তমান টেস্ট ড্র-এর জন্য ঠিক কোন টিকিটগুলো ৫-ম্যাচ করেছে তা দেখতে নিচের <span className="px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300 font-bold border border-amber-400/40">5 Matches</span> ট্যাবে ক্লিক করুন!
            </p>
          </div>
        )}
      </div>

      {/* MATCH TABS (5 Match, 4 Match, 3 Match, 2 Match, 1 Match, 0 Match, All) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-cyan-400" />
            ম্যাচ অনুযায়ী টিকিট ফিল্টার করুন (Match Tabs):
          </span>
          {highlightNumbers.length > 0 && (
            <span className="text-[11px] text-slate-400 font-mono">
              টেস্ট ড্র: [{highlightNumbers.map((n) => String(n).padStart(2, '0')).join(', ')}]
            </span>
          )}
        </div>

        {/* Tab Buttons Row */}
        <div className="flex flex-wrap items-center gap-2 p-1.5 bg-slate-950/90 rounded-xl border border-slate-800">
          {/* All Tickets Tab */}
          <button
            type="button"
            onClick={() => setTab('all')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              currentTab === 'all'
                ? 'bg-indigo-600 text-white shadow-md ring-2 ring-indigo-400/50'
                : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-700/60'
            }`}
          >
            <span>All Tickets</span>
            <span className="px-1.5 py-0.2 rounded-full bg-black/40 text-[10px] font-mono">
              {tickets.length.toLocaleString()}
            </span>
          </button>

          {/* Individual Match Tabs: 5 Match, 4 Match, 3 Match, 2 Match, 1 Match, 0 Match */}
          {matchTabsList.map((k) => {
            const count = matchCounts[k] || 0;
            const isSelected = currentTab === k;
            const hasMatches = count > 0;

            // Visual styling based on match tier
            let activeColor = 'bg-slate-700 text-white ring-2 ring-slate-400/40';
            let badgeBg = 'bg-slate-800 text-slate-300';
            let icon = null;

            if (k >= 5) {
              activeColor = 'bg-gradient-to-r from-amber-500 to-emerald-500 text-slate-950 font-black ring-2 ring-amber-300 shadow-md shadow-amber-500/20';
              badgeBg = isSelected ? 'bg-black/60 text-amber-200' : 'bg-amber-400/20 text-amber-300 border border-amber-400/30';
              icon = <Trophy className="w-3.5 h-3.5 text-amber-300 shrink-0" />;
            } else if (k === 4) {
              activeColor = 'bg-emerald-600 text-white ring-2 ring-emerald-400/50';
              badgeBg = isSelected ? 'bg-black/40 text-emerald-200' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
              icon = <Sparkles className="w-3 h-3 text-emerald-300 shrink-0" />;
            } else if (k === 3) {
              activeColor = 'bg-cyan-600 text-white ring-2 ring-cyan-400/50';
              badgeBg = isSelected ? 'bg-black/40 text-cyan-200' : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30';
            } else if (k === 2) {
              activeColor = 'bg-blue-600 text-white ring-2 ring-blue-400/50';
              badgeBg = isSelected ? 'bg-black/40 text-blue-200' : 'bg-blue-500/20 text-blue-300 border border-blue-500/30';
            } else if (k === 1) {
              activeColor = 'bg-violet-600 text-white ring-2 ring-violet-400/50';
              badgeBg = isSelected ? 'bg-black/40 text-violet-200' : 'bg-violet-500/20 text-violet-300 border border-violet-500/30';
            }

            return (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  isSelected
                    ? activeColor
                    : hasMatches
                    ? 'bg-slate-900 text-slate-200 hover:bg-slate-800 border border-slate-700/80 hover:border-slate-600'
                    : 'bg-slate-900/50 text-slate-500 border border-slate-800/60 opacity-60'
                }`}
              >
                {icon}
                <span>{k} {k === 1 ? 'Match' : 'Matches'}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${badgeBg}`}>
                  {count.toLocaleString()}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search specific numbers (e.g. 1, 6, 14)..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
          />
        </div>

        {/* Tab Status Summary */}
        <div className="text-xs text-slate-300">
          {currentTab === 'all' ? (
            <span>মোট টিকিট: <b className="text-white font-mono">{filteredTickets.length.toLocaleString()}</b> টি</span>
          ) : (
            <span>
              <b className="text-amber-400 font-mono">{currentTab}-ম্যাচ</b> প্রাপ্ত টিকিট:{' '}
              <b className="text-emerald-400 font-mono">{filteredTickets.length.toLocaleString()}</b> টি
            </span>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>
              Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-2.5 py-1 bg-slate-900 border border-slate-700 rounded hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-slate-200"
              >
                Prev
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-2.5 py-1 bg-slate-900 border border-slate-700 rounded hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-slate-200"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Current Match Banner when viewing a specific match tab */}
      {currentTab !== 'all' && (
        <div className={`p-2.5 rounded-lg border text-xs flex items-center justify-between ${
          currentTab >= 5
            ? 'bg-amber-950/40 border-amber-500/50 text-amber-200'
            : currentTab === 4
            ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
            : 'bg-slate-900 border-slate-700 text-slate-300'
        }`}>
          <div className="flex items-center gap-2">
            {currentTab >= 5 ? <Trophy className="w-4 h-4 text-amber-400" /> : <Filter className="w-4 h-4 text-cyan-400" />}
            <span>
              বর্তমান টেস্ট ড্র-এর বিপরীতে <b>{currentTab}টি নম্বর হুবহু মিলে যাওয়া টিকিটসমূহ</b> প্রদর্শিত হচ্ছে (মোট {filteredTickets.length}টি)।
            </span>
          </div>
          <button
            type="button"
            onClick={() => setTab('all')}
            className="text-[11px] underline hover:text-white cursor-pointer"
          >
            Show All Tickets &times;
          </button>
        </div>
      )}

      {/* Tickets Grid Display */}
      {filteredTickets.length === 0 ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-8 text-center text-slate-400 text-xs">
          এই ফিল্টারে কোনো টিকিট পাওয়া যায়নি।
          <button
            type="button"
            onClick={() => {
              setTab('all');
              setSearchTerm('');
            }}
            className="block mx-auto mt-2 text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
          >
            রিসেট করে সকল টিকিট দেখুন
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5 max-h-[520px] overflow-y-auto pr-1">
          {currentTickets.map((item) => {
            const { ticket, globalIdx, matchCount } = item;
            const isJackpot = matchCount !== null && matchCount >= resultSize - 1;

            return (
              <div
                key={globalIdx}
                className={`flex items-center justify-between rounded-lg p-2.5 transition-all ${
                  isJackpot
                    ? 'bg-gradient-to-r from-amber-950/60 to-slate-900 border border-amber-500/60 shadow-sm'
                    : 'bg-slate-900/80 border border-slate-700/60 hover:border-slate-600'
                }`}
              >
                <span className="text-[11px] font-mono text-slate-400 w-11 shrink-0 font-semibold">
                  #{globalIdx}
                </span>

                {/* Number Balls */}
                <div className="flex flex-wrap items-center gap-1.5 justify-end">
                  {ticket.map((num) => {
                    const isHit = highlightSet.has(num);
                    return (
                      <span
                        key={num}
                        className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-all ${
                          isHit
                            ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-300 scale-105 shadow-sm font-black'
                            : 'bg-slate-800 text-slate-200 border border-slate-700'
                        }`}
                      >
                        {String(num).padStart(2, '0')}
                      </span>
                    );
                  })}
                </div>

                <div className="flex items-center gap-1.5 ml-2 shrink-0">
                  {/* Match Badge */}
                  {matchCount !== null && (
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                        matchCount >= 5
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 ring-1 ring-amber-400/30'
                          : matchCount === 4
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : matchCount === 3
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                          : matchCount === 2
                          ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {matchCount} {matchCount === 1 ? 'match' : 'matches'}
                    </span>
                  )}

                  {/* Individual Ticket Copy Icon */}
                  <button
                    type="button"
                    onClick={() => handleCopySingleTicket(ticket, globalIdx)}
                    className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors cursor-pointer"
                    title="এই পুরো টিকেট নম্বর কপি করুন"
                  >
                    {copiedTicketId === globalIdx ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
