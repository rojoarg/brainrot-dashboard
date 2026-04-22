'use client';

import React, { useState, useMemo } from 'react';
import type { DashData, Config, WLItem, Recommendation, Brainrot, Seller } from '../../lib/types';
import { fmtPrice, smartMinValue, downloadConfigJSON, exportData, getMutationAdvisory, getRarityWeight, masterSort } from '../../lib/utils';
import { StatCard, TierBadge, RarityBadge, WLButton, ImageThumb, SearchInput, TrustBadge } from '../ui';

interface UserDashTabProps {
  data: DashData;
  config: Config;
  setConfig: (config: Config | ((c: Config) => Config)) => void;
  showToast: (msg: string) => void;
  openDetail: (name: string) => void;
  isOnWL: (name: string) => boolean;
  addToWL: (name: string) => void;
  removeFromWL: (name: string) => void;
}

type PortfolioItem = WLItem & { rec: Recommendation; sold: { count: number; avgPrice?: number } };

/* ─── Bookmark search sub-component ─── */
function BookmarkSearch({ data, bookmarks, toggleBookmark }: { data: DashData; bookmarks: string[]; toggleBookmark: (n: string) => void }) {
  const [q, setQ] = useState('');
  const results = useMemo(() => {
    if (!q) return [];
    return data.recommendations.filter((r: Recommendation) => r.name.toLowerCase().includes(q.toLowerCase())).slice(0, 10);
  }, [data, q]);

  return (
    <div>
      <SearchInput value={q} onChange={setQ} placeholder="Search to bookmark..." maxWidth={260} />
      {results.length > 0 && (
        <div className="d-flex flex-wrap gap-2 mt-1">
          {results.map((r: Recommendation) => (
            <div key={r.name} className={`chip cursor-pointer${bookmarks.includes(r.name) ? ' chip-active' : ''}`} onClick={() => toggleBookmark(r.name)}>
              <TierBadge tier={r.tier} />
              <span className="text-md">{r.name}</span>
              <span className={`text-xs ${bookmarks.includes(r.name) ? 'color-cyan' : 'color-muted'}`}>
                {bookmarks.includes(r.name) ? '★' : '+'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* masterSort and getRarityWeight imported from utils */

function UserDashTab({ data, config, setConfig, showToast, openDetail, isOnWL, addToWL, removeFromWL }: UserDashTabProps) {
  const [storeName, setStoreName] = useState(() => {
    if (typeof window !== 'undefined') return window.sessionStorage?.getItem?.('brainrot_store') || '';
    return '';
  });
  const [importText, setImportText] = useState('');
  const [bookmarks, setBookmarks] = useState<string[]>(() => {
    try { if (typeof window !== 'undefined') return JSON.parse(window.sessionStorage?.getItem?.('brainrot_bookmarks') || '[]'); } catch { return []; }
    return [];
  });
  const [notes, setNotes] = useState(() => {
    if (typeof window !== 'undefined') return window.sessionStorage?.getItem?.('brainrot_notes') || '';
    return '';
  });

  const saveStore = (name: string) => { setStoreName(name); try { window.sessionStorage?.setItem?.('brainrot_store', name); } catch {} };
  const toggleBookmark = (name: string) => {
    setBookmarks(b => {
      const next = b.includes(name) ? b.filter(x => x !== name) : [...b, name];
      try { window.sessionStorage?.setItem?.('brainrot_bookmarks', JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const saveNotes = (v: string) => { setNotes(v); try { window.sessionStorage?.setItem?.('brainrot_notes', v); } catch {} };

  // Portfolio: WL items with current prices
  const portfolio = useMemo(() => {
    return config.whitelisted
      .map((w: WLItem) => {
        const rec = data.recommendations.find((r: Recommendation) => r.name.toLowerCase() === w.pet_name.toLowerCase());
        const sold = data.soldArchive?.byName?.[w.pet_name] || { count: 0, avgPrice: 0 };
        return { ...w, rec, sold } as PortfolioItem & { rec?: Recommendation };
      })
      .filter((p): p is PortfolioItem => !!p.rec);
  }, [config, data]) as PortfolioItem[];

  const portfolioValue = useMemo(() => {
    return portfolio.reduce((s: number, p: PortfolioItem) => s + p.rec.med, 0);
  }, [portfolio]);

  const avgROI = useMemo(() => {
    const withROI = portfolio.filter((p: PortfolioItem) => p.rec.roiPct > 0);
    return withROI.length > 0 ? withROI.reduce((s: number, p: PortfolioItem) => s + p.rec.roiPct, 0) / withROI.length : 0;
  }, [portfolio]);

  // Bookmarked items
  const bookmarkedItems = useMemo(() => {
    return bookmarks.map(name => data.recommendations.find((r: Recommendation) => r.name.toLowerCase() === name.toLowerCase())).filter((r): r is Recommendation => !!r);
  }, [bookmarks, data]);

  // Store matching: find seller in data
  const storeData = useMemo(() => {
    if (!storeName) return null;
    return data.topSellers.find((s: Seller) => s.name.toLowerCase() === storeName.toLowerCase());
  }, [storeName, data]);

  // Import WL from text
  const handleImport = () => {
    const names = importText.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
    const existing = new Set(config.whitelisted.map((w: WLItem) => w.pet_name.toLowerCase()));
    const newItems = names.filter(n => !existing.has(n.toLowerCase())).map((n, i) => {
      const rec = data.recommendations.find((r: Recommendation) => r.name.toLowerCase() === n.toLowerCase());
      const b = data.brainrots?.[n];
      return {
        pet_name: n,
        priority: config.whitelisted.length + i + 1,
        min_value: smartMinValue(rec || b || { med: 0 }),
      };
    });
    if (newItems.length > 0) {
      setConfig((c: Config) => ({ ...c, whitelisted: [...c.whitelisted, ...newItems] }));
      showToast(`Imported ${newItems.length} items`);
    }
    setImportText('');
  };

  // User stats summary
  const tierBreakdown = useMemo(() => {
    const counts: Record<string, number> = { S: 0, A: 0, B: 0, C: 0, D: 0 };
    portfolio.forEach((p: PortfolioItem) => { if (p.rec?.tier) counts[p.rec.tier] = (counts[p.rec.tier] || 0) + 1; });
    return counts;
  }, [portfolio]);

  return (
    <div className="d-flex flex-col gap-4">
      {/* User stats hero */}
      <div className="grid-stats stagger-in">
        <StatCard label="Watchlist Items" value={config.whitelisted.length} color="var(--gold)" />
        <StatCard label="Portfolio Value" value={fmtPrice(portfolioValue)} sub="at median prices" color="var(--accent2)" />
        <StatCard label="Avg ROI" value={`${avgROI.toFixed(1)}%`} color="var(--green)" />
        <StatCard label="Bookmarks" value={bookmarks.length} color="var(--cyan)" />
        <StatCard label="S-Tier Items" value={tierBreakdown.S} color="var(--gold)" sub={`${tierBreakdown.A} A-tier`} />
        <StatCard label="Items Sold (tracked)" value={portfolio.reduce((s: number, p: PortfolioItem) => s + (p.sold?.count || 0), 0)} color="var(--red)" />
      </div>

      {/* Store Link + Quick Stats */}
      <div className="grid-2col">
        <div className="glass-card p-4">
          <h3 className="section-heading d-flex items-center gap-2">
            <span className="icon-md">🏪</span> My Store
          </h3>
          <div className="d-flex gap-2 mb-3">
            <input className="input flex-1" placeholder="Your Eldorado seller name..." value={storeName} onChange={e => saveStore(e.target.value)} />
          </div>
          {storeData ? (
            <div className="d-flex flex-col gap-2">
              <div className="config-item flex-col items-start gap-2">
                <div className="d-flex items-center gap-2">
                  <span className="fw-700 text-lg">{storeData.name}</span>
                  {storeData.verified && <span className="text-xs px-2 py-1 verified-tag">VERIFIED</span>}
                </div>
                <div className="grid-stats w-full text-md">
                  <div><span className="text-muted">Listings: </span><span className="fw-600">{storeData.listings}</span></div>
                  <div><span className="text-muted">Unique Pets: </span><span className="fw-600">{storeData.uniquePets}</span></div>
                  <div><span className="text-muted">Rating: </span><span className={`fw-600 ${storeData.rating >= 95 ? 'color-green' : 'color-gold'}`}>{storeData.rating}%</span></div>
                  <div><span className="text-muted">Trust: </span><TrustBadge score={storeData.trustScore} /></div>
                  <div><span className="text-muted">Total Value: </span><span className="fw-600">{fmtPrice(storeData.avgPrice * (storeData.listings ?? 0))}</span></div>
                  <div><span className="text-muted">Avg Price: </span><span className="fw-600">{fmtPrice(storeData.avgPrice)}</span></div>
                </div>
                {storeData.warranty && <div className="text-sm text-green">✓ Warranty offered</div>}
              </div>
            </div>
          ) : storeName ? (
            <div className="text-md text-muted p-3">
              Seller &quot;{storeName}&quot; not found in current data. Make sure the name matches your Eldorado store exactly.
            </div>
          ) : (
            <div className="text-md text-muted p-3">
              Link your Eldorado store to see your seller stats, trust score, and compare against market averages.
            </div>
          )}
        </div>

        {/* Quick Tools */}
        <div className="glass-card p-4">
          <h3 className="section-heading d-flex items-center gap-2">
            <span className="icon-md">🛠️</span> Tools
          </h3>
          <div className="d-flex flex-col gap-2">
            <button type="button" className="btn w-full text-left btn-tool" onClick={() => downloadConfigJSON(config, showToast, data.recommendations)}>
              <span className="fw-600">Export Config + Overrides</span>
              <span className="text-sm text-muted ml-2">JSON + mutation advisory</span>
            </button>
            <button type="button" className="btn w-full text-left btn-tool" onClick={() => exportData(portfolio.filter((p: PortfolioItem) => p.rec).map((p: PortfolioItem) => ({ name: p.pet_name, tier: p.rec.tier, score: p.rec.score, med: p.rec.med, roi: p.rec.roiPct, sold: p.sold.count, rarity: p.rec.rarity })), 'portfolio-report', 'csv')}>
              <span className="fw-600">📊 Portfolio Report</span>
              <span className="text-sm text-muted ml-2">CSV with all stats</span>
            </button>
            <button type="button" className="btn w-full text-left btn-tool" onClick={() => {
              const alert = portfolio.filter((p: PortfolioItem) => p.rec && p.rec.roiPct > 50).map((p: PortfolioItem) => `${p.pet_name}: ${p.rec.roiPct}% ROI`).join('\n');
              if (alert) showToast(`High ROI items:\n${alert.split('\n').slice(0, 5).join(', ')}`);
              else showToast('No items with >50% ROI currently');
            }}>
              <span className="fw-600">🚨 ROI Alert Check</span>
              <span className="text-sm text-muted ml-2">Find high ROI opportunities</span>
            </button>
            <button type="button" className="btn w-full text-left btn-tool" onClick={() => {
              const undervalued = data.recommendations.filter((r: Recommendation) => r.tier === 'S' && r.listings >= 3 && !isOnWL(r.name)).slice(0, 5);
              if (undervalued.length > 0) {
                undervalued.forEach((r: Recommendation) => addToWL(r.name));
                showToast(`Added ${undervalued.length} S-tier items you're missing`);
              } else showToast('Watchlist already covers all available S-tier items');
            }}>
              <span className="fw-600">🎯 Auto-Scout</span>
              <span className="text-sm text-muted ml-2">Add missing S-tier items</span>
            </button>
          </div>
        </div>
      </div>

      {/* Import / Batch Add */}
      <div className="glass-card p-4">
        <h3 className="section-heading d-flex items-center gap-2">
          <span className="icon-md">📋</span> Import Watchlist
        </h3>
        <p className="text-md text-muted mb-2">Paste brainrot names separated by commas or new lines to bulk-add to your watchlist.</p>
        <div className="d-flex gap-2">
          <textarea className="input resize-v flex-1" placeholder="Paste names here... (e.g., Italian Brainrot, Bombardiro, Tralalero)" value={importText} onChange={e => setImportText(e.target.value)} rows={3} />
          <button type="button" className="btn btn-primary self-end" onClick={handleImport} disabled={!importText.trim()}>Import</button>
        </div>
      </div>

      {/* Bookmarks */}
      <div className="glass-card p-4">
        <h3 className="section-heading d-flex items-center gap-2 color-cyan">
          <span className="icon-md">🔖</span> Bookmarks ({bookmarks.length})
        </h3>
        <p className="text-md text-muted mb-3">Quick-access items you&apos;re watching closely. Add from the search below.</p>
        {bookmarkedItems.length > 0 ? (
          <div className="d-flex flex-col gap-1">
            {bookmarkedItems.map((r: Recommendation) => (
              <div key={r.name} className="config-item cursor-pointer">
                <ImageThumb src={r.imageUrl} size={24} />
                <TierBadge tier={r.tier} />
                <span className="fw-600 text-lg" onClick={() => openDetail(r.name)}>{r.name}</span>
                <RarityBadge rarity={r.rarity} />
                <span className="text-md text-sub">{fmtPrice(r.med)} · {r.listings} listings</span>
                {r.roiPct > 0 && <span className="text-sm text-green fw-600">{r.roiPct}% ROI</span>}
                <div className="d-flex gap-2 ml-auto">
                  <WLButton name={r.name} isOnWL={isOnWL(r.name)} onAdd={addToWL} onRemove={removeFromWL} />
                  <button className="btn btn-danger btn-sm text-xs" onClick={() => toggleBookmark(r.name)}>✕</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-md text-muted p-2">No bookmarks yet. Search below to add items.</div>
        )}
        <div className="mt-3">
          <BookmarkSearch data={data} bookmarks={bookmarks} toggleBookmark={toggleBookmark} />
        </div>
      </div>

      {/* Portfolio breakdown */}
      {portfolio.length > 0 && (
        <div className="glass-card p-4">
          <h3 className="section-heading color-accent2">Portfolio Breakdown</h3>
          <div className="grid-strategies">
            {portfolio.slice(0, 20).map((p: PortfolioItem) => (
              <div key={p.pet_name} onClick={() => openDetail(p.pet_name)} className="config-item cursor-pointer">
                <ImageThumb src={p.rec?.imageUrl} size={28} />
                <div className="flex-1 min-w-0">
                  <div className="d-flex items-center gap-2">
                    <TierBadge tier={p.rec.tier} />
                    <span className="fw-600 text-sm truncate">{p.pet_name}</span>
                  </div>
                  <div className="text-sm text-sub mt-1">
                    {fmtPrice(p.rec.med)} med · {p.rec.listings} listings
                    {p.sold.count > 0 && <span className="text-red ml-1">{p.sold.count} sold</span>}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-sm fw-700 color-accent2">{p.rec.score}</div>
                  {p.rec.roiPct > 0 && <div className="text-xs text-green">{p.rec.roiPct}% ROI</div>}
                </div>
              </div>
            ))}
          </div>
          {portfolio.length > 20 && <div className="text-md text-muted mt-2 text-center">+ {portfolio.length - 20} more items</div>}
        </div>
      )}

      {/* Notes */}
      <div className="glass-card p-4">
        <h3 className="section-heading d-flex items-center gap-2">
          <span className="icon-md">📝</span> Notes
        </h3>
        <textarea className="input text-mono text-md w-full resize-v leading-relaxed" placeholder="Personal notes, strategy reminders, trade log..." value={notes} onChange={e => saveNotes(e.target.value)} rows={4} />
      </div>
    </div>
  );
}

export default React.memo(UserDashTab);
