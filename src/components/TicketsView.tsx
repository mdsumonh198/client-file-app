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
  FileSpreadsheet,
  Table,
  Grid,
  SlidersHorizontal,
} from 'lucide-react';
import { copyTextToClipboard } from '../lib/clipboard';

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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [viewMode, setViewMode] = useState<'sheet' | 'grid'>('sheet'); // Default to 'sheet' as requested
  const [showSheetsGuide, setShowSheetsGuide] = useState(false);

  const [copiedForSheets, setCopiedForSheets] = useState(false);
  const [copiedSingleCol, setCopiedSingleCol] = useState(false);
  const [copiedTicketId, setCopiedTicketId] = useState<number | null>(null);

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

  // Pre-calculate exact matches per ticket against active drawn result
  const ticketMatches = useMemo(() => {
    if (!highlightNumbers || highlightNumbers.length === 0) return null;
    return tickets.map((t) => t.filter((n) => highlightSet.has(n)).length);
  }, [tickets, highlightNumbers, highlightSet]);

  // Match counts breakdown across tiers
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

  // Filter items by match tab
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

  const effectivePageSize = pageSize === 0 ? Math.max(1, filteredTickets.length) : pageSize;
  const totalPages = Math.max(1, Math.ceil(filteredTickets.length / effectivePageSize));
  const currentTickets = useMemo(() => {
    if (pageSize === 0) return filteredTickets;
    const start = (page - 1) * effectivePageSize;
    return filteredTickets.slice(start, start + effectivePageSize);
  }, [filteredTickets, page, effectivePageSize, pageSize]);

  const ticketSize = tickets.length > 0 ? tickets[0].length : 6;

  // 1. Download Clean CSV (RFC 4180 with CRLF \r\n and UTF-8 BOM)
  const handleDownloadCSV = (onlyCurrentTab: boolean = false) => {
    const exportItems = onlyCurrentTab ? filteredTickets : tickets.map((t, idx) => ({
      ticket: t,
      globalIdx: idx + 1,
      matchCount: ticketMatches ? ticketMatches[idx] : null,
    }));

    if (exportItems.length === 0) return;

    const sampleTicket = exportItems[0].ticket;
    const numHeaders = sampleTicket.map((_, i) => `Num_${i + 1}`).join(',');
    const header = `Ticket_No,Full_Combination,${numHeaders}${ticketMatches ? ',Matches' : ''}`;

    const rows = exportItems.map((item) => {
      const formatted = item.ticket.map((n) => String(n).padStart(2, '0')).join(', ');
      const nums = item.ticket.join(',');
      const matchCol = item.matchCount !== null ? `,${item.matchCount}` : '';
      return `${item.globalIdx},"${formatted}",${nums}${matchCol}`;
    }).join('\r\n');

    const csvContent = `\uFEFF${header}\r\n${rows}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const filename = onlyCurrentTab && currentTab !== 'all'
      ? `lottery_tickets_${currentTab}_match_${exportItems.length}.csv`
      : `lottery_tickets_sheet_${exportItems.length}.csv`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // 2. Download TSV (Tab-Separated Values) for direct Excel / Google Sheets opening without delimiter questions
  const handleDownloadTSV = (onlyCurrentTab: boolean = false) => {
    const exportItems = onlyCurrentTab ? filteredTickets : tickets.map((t, idx) => ({
      ticket: t,
      globalIdx: idx + 1,
      matchCount: ticketMatches ? ticketMatches[idx] : null,
    }));

    if (exportItems.length === 0) return;

    const sampleTicket = exportItems[0].ticket;
    const numHeaders = sampleTicket.map((_, i) => `Num ${i + 1}`).join('\t');
    const header = `Ticket #\tFull Ticket\t${numHeaders}${ticketMatches ? '\tMatches' : ''}`;

    const rows = exportItems.map((item) => {
      const formatted = item.ticket.map((n) => String(n).padStart(2, '0')).join(', ');
      const nums = item.ticket.join('\t');
      const matchCol = item.matchCount !== null ? `\t${item.matchCount}` : '';
      return `${item.globalIdx}\t${formatted}\t${nums}${matchCol}`;
    }).join('\r\n');

    const tsvContent = `\uFEFF${header}\r\n${rows}`;
    const blob = new Blob([tsvContent], { type: 'text/tab-separated-values;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lottery_tickets_sheet_${exportItems.length}.tsv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // 3. Reliable Copy for Google Sheets (Pastes across columns cleanly with Ctrl+V)
  const handleCopyForGoogleSheets = async (onlyCurrentTab: boolean = false) => {
    const exportItems = onlyCurrentTab
      ? filteredTickets
      : tickets.map((t, idx) => ({
          ticket: t,
          globalIdx: idx + 1,
          matchCount: ticketMatches ? ticketMatches[idx] : null,
        }));
    if (exportItems.length === 0) return;

    const sampleTicket = exportItems[0].ticket;
    const numHeaders = sampleTicket.map((_, i) => `Num ${i + 1}`).join('\t');
    const header = `Ticket #\tFull Ticket\t${numHeaders}${ticketMatches ? '\tMatches' : ''}`;

    const text = exportItems
      .map((item) => {
        const formatted = item.ticket.map((n) => String(n).padStart(2, '0')).join(', ');
        const matchCol = item.matchCount !== null ? `\t${item.matchCount}` : '';
        return `${item.globalIdx}\t${formatted}\t${item.ticket.join('\t')}${matchCol}`;
      })
      .join('\n');

    const success = await copyTextToClipboard(`${header}\n${text}`);
    if (success) {
      setCopiedForSheets(true);
      setTimeout(() => setCopiedForSheets(false), 2500);
    }
  };

  // 4. Copy 1-Column Format (e.g. "01, 02, 03, 04, 05, 06\n01, 02, ...")
  const handleCopySingleColumn = async (onlyCurrentTab: boolean = false) => {
    const exportItems = onlyCurrentTab
      ? filteredTickets
      : tickets.map((t, idx) => ({ ticket: t, globalIdx: idx + 1, matchCount: null }));
    if (exportItems.length === 0) return;

    const text = exportItems
      .map((item) => item.ticket.map((n) => String(n).padStart(2, '0')).join(', '))
      .join('\n');

    const success = await copyTextToClipboard(text);
    if (success) {
      setCopiedSingleCol(true);
      setTimeout(() => setCopiedSingleCol(false), 2000);
    }
  };

  // 5. Copy single ticket
  const handleCopySingleTicket = async (ticket: number[], idx: number) => {
    const text = ticket.map((n) => String(n).padStart(2, '0')).join(', ');
    const success = await copyTextToClipboard(text);
    if (success) {
      setCopiedTicketId(idx);
      setTimeout(() => setCopiedTicketId(null), 1500);
    }
  };

  if (tickets.length === 0) {
    return (
      <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-8 text-center">
        <TicketIcon className="w-10 h-10 text-slate-500 mx-auto mb-3" />
        <h3 className="text-sm font-semibold text-slate-300">No Tickets Generated</h3>
        <p className="text-xs text-slate-500 mt-1">
          প্যারামিটার কনফিগার করে &ldquo;Calculate Minimum Tickets&rdquo; বাটনে ক্লিক করে টিকিট শিট তৈরি করুন।
        </p>
      </div>
    );
  }

  // Generate tabs list in descending order from resultSize down to 0
  const matchTabsList = Array.from({ length: resultSize + 1 }, (_, i) => resultSize - i);

  return (
    <div id="tickets-sheet-section" className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-5 shadow-2xl backdrop-blur-sm space-y-4">
      {/* Top Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-4 border-b border-slate-700/80 gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30 shadow-inner">
            <FileSpreadsheet className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-base sm:text-lg font-black text-white tracking-tight">
                Generated Tickets Sheet &amp; Table
              </h2>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40">
                মোট {tickets.length.toLocaleString()}টি টিকিট
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-cyan-950/80 text-cyan-300 border border-cyan-500/30 font-mono font-semibold">
                Google Sheets Ready
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              সম্পূর্ণ গাণিতিক কাভারেজযুক্ত টিকিটের তালিকা। সরাসরি গুগল শিটে পেস্ট করতে বা স্প্রেডশিটে ডাউনলোড করতে নিচের বাটনগুলো ব্যবহার করুন।
            </p>
          </div>
        </div>

        {/* View Mode Toggle & Primary Actions */}
        <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
          {/* View Mode Switcher: Sheet View vs Ball Cards */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-700/80 shadow-inner">
            <button
              type="button"
              onClick={() => setViewMode('sheet')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'sheet'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="স্প্রেডশিট / এক্সেল টেবিল ভিউ (কলাম ও রো আকারে)"
            >
              <Table className="w-3.5 h-3.5" />
              <span>Sheet View (শিট টেবিল)</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="লটারি বল ও কার্ড ভিউ"
            >
              <Grid className="w-3.5 h-3.5" />
              <span>Ball Cards (বল ভিউ)</span>
            </button>
          </div>

          {/* PRIMARY: Google Sheets CSV Download */}
          <button
            type="button"
            onClick={() => handleDownloadCSV(currentTab !== 'all')}
            className="flex items-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-2 rounded-xl shadow-lg hover:shadow-emerald-600/30 transition-all cursor-pointer"
            title="Download clean CSV of tickets directly formatted for Google Sheets or Excel"
          >
            <Download className="w-3.5 h-3.5 text-emerald-100" />
            <span>{currentTab !== 'all' ? `Sheets CSV (${currentTab}-Match)` : 'Google Sheets CSV (ডাউনলোড)'}</span>
          </button>

          {/* Direct Copy for Google Sheets (Paste with Ctrl+V) */}
          <button
            type="button"
            onClick={() => handleCopyForGoogleSheets(currentTab !== 'all')}
            className="flex items-center gap-1.5 text-xs bg-indigo-950/90 hover:bg-indigo-900 text-indigo-300 hover:text-white px-3 py-2 rounded-xl border border-indigo-500/50 transition-colors cursor-pointer font-bold shadow-sm"
            title="গুগল শিটে সরাসরি কলামে পেস্ট করতে ক্লিক করুন (Ctrl+V)"
          >
            {copiedForSheets ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedForSheets ? 'শিটের জন্য কপি সম্পন্ন!' : 'শিটে পেস্ট করতে কপি (Ctrl+V)'}</span>
          </button>

          {/* Secondary Options: TSV & 1-Col dropdown / buttons */}
          <button
            type="button"
            onClick={() => handleDownloadTSV(currentTab !== 'all')}
            className="flex items-center gap-1 text-xs bg-slate-900 hover:bg-slate-700 text-slate-300 px-2.5 py-2 rounded-xl border border-slate-700 transition-colors cursor-pointer font-mono"
            title="Download Excel / TSV Tab-Separated file"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-cyan-400" />
            <span>TSV</span>
          </button>

          <button
            type="button"
            onClick={() => handleCopySingleColumn(currentTab !== 'all')}
            className="flex items-center gap-1 text-xs bg-slate-900 hover:bg-slate-700 text-slate-300 px-2.5 py-2 rounded-xl border border-slate-700 transition-colors cursor-pointer"
            title="১টি কলামে লাইন বাই লাইন পুরো টিকেট কপি করুন"
          >
            {copiedSingleCol ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>{copiedSingleCol ? 'কপি হয়েছে' : '1-Col'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowSheetsGuide(!showSheetsGuide)}
            className="p-2 text-slate-400 hover:text-white bg-slate-900 border border-slate-700 rounded-xl cursor-pointer"
            title="গুগল শিটে কীভাবে সহজে নিবেন (গাইড)"
          >
            <HelpCircle className="w-4 h-4 text-cyan-400" />
          </button>
        </div>
      </div>

      {/* Google Sheets 1-Click Guide Callout (if opened) */}
      {showSheetsGuide && (
        <div className="bg-gradient-to-r from-emerald-950/40 via-slate-900 to-indigo-950/40 border border-emerald-500/40 rounded-xl p-4 text-xs space-y-2 animate-in fade-in">
          <div className="flex items-center justify-between pb-1 border-b border-emerald-500/20">
            <span className="font-bold text-emerald-300 flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              গুগল শিট (Google Sheets)-এ টিকেট নেওয়ার ৩টি সহজ উপায়:
            </span>
            <button
              type="button"
              onClick={() => setShowSheetsGuide(false)}
              className="text-slate-400 hover:text-white"
            >
              &times;
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1 text-[11px] leading-relaxed">
            <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800 space-y-1">
              <span className="font-bold text-amber-300 block">উপায় ১: সরাসরি পেস্ট (Fastest)</span>
              <p className="text-slate-300">
                ১. উপরের <b>&ldquo;শিটে পেস্ট করতে কপি (Ctrl+V)&rdquo;</b> বাটনে ক্লিক করুন।
              </p>
              <p className="text-slate-300">
                ২. নতুন গুগল শিট খুলুন (ব্রাউজারে <code>sheets.new</code> লিখুন)।
              </p>
              <p className="text-slate-300">
                ৩. সেল A1-এ রেখে <b>Ctrl + V</b> চাপুন। সকল টিকেট স্বয়ংক্রিয়ভাবে আলাদা কলামে বসে যাবে!
              </p>
            </div>
            <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800 space-y-1">
              <span className="font-bold text-emerald-300 block">উপায় ২: CSV ডাউনলোড</span>
              <p className="text-slate-300">
                ১. <b>&ldquo;Google Sheets CSV&rdquo;</b> বাটনে ক্লিক করে ফাইলটি ডাউনলোড করুন।
              </p>
              <p className="text-slate-300">
                ২. Google Sheets-এ গিয়ে <b>File &rarr; Import &rarr; Upload</b> দিয়ে ফাইলটি সিলেক্ট করুন।
              </p>
              <p className="text-slate-300">
                ৩. সুন্দর ফরমেটে পুরো টিকিট শিট ওপেন হবে।
              </p>
            </div>
            <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800 space-y-1">
              <span className="font-bold text-cyan-300 block">উপায় ৩: TSV বা ১-কলাম কপি</span>
              <p className="text-slate-300">
                আপনার যদি একটি কলামে সব টিকিট দরকার হয়, তবে <b>&ldquo;1-Col&rdquo;</b> বাটনে ক্লিক করলে প্রতি লাইনে ১টি করে টিকিট কপি হয়ে যাবে।
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Match Filter Tabs Row */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-cyan-400" />
            ম্যাচ অনুযায়ী ফিল্টার (Match Tabs):
          </span>
          {highlightNumbers.length > 0 && (
            <span className="text-[11px] text-slate-400 font-mono">
              টেস্ট ড্র: [{highlightNumbers.map((n) => String(n).padStart(2, '0')).join(', ')}]
            </span>
          )}
        </div>

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
            <span>All Tickets (সকল টিকিট)</span>
            <span className="px-1.5 py-0.2 rounded-full bg-black/40 text-[10px] font-mono">
              {tickets.length.toLocaleString()}
            </span>
          </button>

          {/* Individual Match Tabs: 5 Match, 4 Match, 3 Match, 2 Match, 1 Match, 0 Match */}
          {matchTabsList.map((k) => {
            const count = matchCounts[k] || 0;
            const isSelected = currentTab === k;
            const hasMatches = count > 0;

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

      {/* Filter and Search Bar with Page Size Selector */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-2 w-full sm:w-auto flex-1">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search numbers (e.g. 1, 6, 14)..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
            />
          </div>

          {/* Rows per page selector */}
          <div className="flex items-center gap-1 text-xs text-slate-400 shrink-0">
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden sm:inline">Rows:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(parseInt(e.target.value, 10));
                setPage(1);
              }}
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
            >
              <option value={25}>25 rows</option>
              <option value={50}>50 rows</option>
              <option value={100}>100 rows</option>
              <option value={250}>250 rows</option>
              <option value={500}>500 rows</option>
              <option value={0}>All rows</option>
            </select>
          </div>
        </div>

        {/* Total Summary */}
        <div className="text-xs text-slate-300 shrink-0">
          <span>
            প্রদর্শিত হচ্ছে:{' '}
            <b className="text-emerald-400 font-mono">{filteredTickets.length.toLocaleString()}</b> টি টিকিট
            {filteredTickets.length < tickets.length && ` (মোট ${tickets.length.toLocaleString()}টি থেকে)`}
          </span>
        </div>

        {/* Pagination Controls */}
        {pageSize !== 0 && totalPages > 1 && (
          <div className="flex items-center gap-2 text-xs text-slate-400 shrink-0">
            <span>
              Page <b className="text-slate-200 font-mono">{page}</b> of <b className="text-slate-200 font-mono">{totalPages}</b>
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage(1)}
                disabled={page <= 1}
                className="px-2 py-1 bg-slate-900 border border-slate-700 rounded hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-slate-300 font-mono text-[11px]"
                title="First Page"
              >
                &laquo;
              </button>
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
              <button
                type="button"
                onClick={() => setPage(totalPages)}
                disabled={page >= totalPages}
                className="px-2 py-1 bg-slate-900 border border-slate-700 rounded hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-slate-300 font-mono text-[11px]"
                title="Last Page"
              >
                &raquo;
              </button>
            </div>
          </div>
        )}
      </div>

      {/* SPREADSHEET TABLE VIEW (SHEET VIEW) */}
      {viewMode === 'sheet' && (
        <div className="border border-slate-700/80 rounded-xl overflow-hidden shadow-inner bg-slate-950/60">
          <div className="max-h-[560px] overflow-x-auto overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700">
            <table className="w-full text-left text-xs text-slate-300 border-collapse">
              <thead className="bg-[#0c1222] text-[11px] text-slate-400 uppercase font-mono tracking-wider sticky top-0 z-10 border-b border-slate-700/90 shadow-sm">
                <tr>
                  <th className="py-2.5 px-3 border-r border-slate-800 w-16 text-center font-bold">
                    Ticket #
                  </th>
                  <th className="py-2.5 px-4 border-r border-slate-800 font-bold min-w-[200px]">
                    Full Combination (সম্পূর্ণ টিকিট)
                  </th>
                  {Array.from({ length: ticketSize }, (_, i) => (
                    <th key={i} className="py-2.5 px-2 border-r border-slate-800 text-center w-12 font-bold text-slate-300">
                      N{i + 1}
                    </th>
                  ))}
                  {ticketMatches && (
                    <th className="py-2.5 px-3 border-r border-slate-800 text-center w-28 font-bold text-cyan-300">
                      Match Count
                    </th>
                  )}
                  <th className="py-2.5 px-3 text-center w-20 font-bold">
                    Copy
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 font-mono text-xs">
                {currentTickets.length === 0 ? (
                  <tr>
                    <td colSpan={ticketSize + 4} className="py-8 text-center text-slate-500 italic font-sans">
                      কোনো টিকিট পাওয়া যায়নি। ফিল্টার রিসেট করুন।
                    </td>
                  </tr>
                ) : (
                  currentTickets.map((item, rowIdx) => {
                    const { ticket, globalIdx, matchCount } = item;
                    const isJackpot = matchCount !== null && matchCount >= resultSize - 1;
                    const formattedComma = ticket.map((n) => String(n).padStart(2, '0')).join(', ');

                    return (
                      <tr
                        key={globalIdx}
                        className={`hover:bg-indigo-950/40 transition-colors ${
                          isJackpot
                            ? 'bg-amber-950/20 hover:bg-amber-950/40'
                            : rowIdx % 2 === 0
                            ? 'bg-slate-900/50'
                            : 'bg-slate-950/40'
                        }`}
                      >
                        {/* Ticket Number */}
                        <td className="py-2 px-3 border-r border-slate-800/80 text-center font-bold text-slate-400">
                          #{globalIdx}
                        </td>

                        {/* Full Combination */}
                        <td className="py-2 px-4 border-r border-slate-800/80 font-mono font-bold text-slate-100 flex items-center justify-between gap-2">
                          <span className="tracking-wide">{formattedComma}</span>
                          <button
                            type="button"
                            onClick={() => handleCopySingleTicket(ticket, globalIdx)}
                            className="p-1 text-slate-500 hover:text-white rounded hover:bg-slate-800 transition-colors cursor-pointer"
                            title="এই টিকিট নম্বর কপি করুন"
                          >
                            {copiedTicketId === globalIdx ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </td>

                        {/* Individual Number Columns (Ball 1 to Ball K) */}
                        {ticket.map((num, i) => {
                          const isHit = highlightSet.has(num);
                          return (
                            <td
                              key={i}
                              className={`py-2 px-1 border-r border-slate-800/80 text-center font-mono ${
                                isHit
                                  ? 'bg-amber-400 text-slate-950 font-black shadow-inner'
                                  : 'text-slate-300'
                              }`}
                            >
                              {String(num).padStart(2, '0')}
                            </td>
                          );
                        })}

                        {/* Match Count Badge */}
                        {ticketMatches && (
                          <td className="py-2 px-3 border-r border-slate-800/80 text-center">
                            {matchCount !== null && (
                              <span
                                className={`inline-block text-[11px] font-bold font-mono px-2 py-0.5 rounded border ${
                                  matchCount >= 5
                                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 ring-1 ring-amber-400/40'
                                    : matchCount === 4
                                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                    : matchCount === 3
                                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                                    : matchCount === 2
                                    ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                                    : 'bg-slate-800 text-slate-400 border-slate-700'
                                }`}
                              >
                                {matchCount} {matchCount === 1 ? 'Match' : 'Matches'}
                              </span>
                            )}
                          </td>
                        )}

                        {/* Quick Copy Action */}
                        <td className="py-2 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleCopySingleTicket(ticket, globalIdx)}
                            className="text-xs text-indigo-400 hover:text-indigo-200 underline cursor-pointer"
                          >
                            {copiedTicketId === globalIdx ? 'Copied' : 'Copy'}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Sheet Footer summary */}
          <div className="bg-[#0a0f1c] px-4 py-2.5 border-t border-slate-800 text-xs text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-2">
            <span>
              মোট কলাম: <b className="text-slate-200">{ticketSize + 2}টি</b> (Ticket #, Full Ticket, N1..N{ticketSize}) | মোট ডাটা রো:{' '}
              <b className="text-emerald-400 font-mono">{filteredTickets.length.toLocaleString()}</b> টি
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleCopyForGoogleSheets(currentTab !== 'all')}
                className="text-indigo-400 hover:text-indigo-300 underline font-semibold cursor-pointer"
              >
                সম্পূর্ণ শিট কপি করুন (Ctrl+V)
              </button>
              <button
                type="button"
                onClick={() => handleDownloadCSV(currentTab !== 'all')}
                className="text-emerald-400 hover:text-emerald-300 underline font-semibold cursor-pointer"
              >
                Google Sheets CSV ডাউনলোড
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BALL CARDS GRID VIEW */}
      {viewMode === 'grid' && (
        <>
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
        </>
      )}
    </div>
  );
};
