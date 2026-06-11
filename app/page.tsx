'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { TabErrorBoundary } from './components/ErrorBoundary';
import { DashboardSkeleton } from './components/ui';
import FirstSyncOverlay from './components/FirstSyncOverlay';
import BlacklistModal from './components/BlacklistModal';
import type { Config, TabId } from './lib/types';
import { TABS } from './lib/constants';
import { timeAgo, downloadConfigJSON, exportData, smartMinValue, buildMutationOverrides, computePriority } from './lib/utils';
import { useData } from './lib/useData';

/* ─── Lazy-loaded tab components ─── */
const OverviewTab = dynamic(() => import('./components/tabs/OverviewTab'), { ssr: false });
const BrainrotsTab = dynamic(() => import('./components/tabs/BrainrotsTab'), { ssr: false });
const DetailTab = dynamic(() => import('./components/tabs/DetailTab'), { ssr: false });
const RecsTab = dynamic(() => import('./components/tabs/RecsTab'), { ssr: false });
const WatchlistTab = dynamic(() => import('./components/tabs/WatchlistTab'), { ssr: false });
const SellersTab = dynamic(() => import('./components/tabs/SellersTab'), { ssr: false });
const SoldTab = dynamic(() => import('./components/tabs/SoldTab'), { ssr: false });
const TrendingTab = dynamic(() => import('./components/tabs/TrendingTab'), { ssr: false });
const MutationsTab = dynamic(() => import('./components/tabs/MutationsTab'), { ssr: false });
const ConfigTab = dynamic(() => import('./components/tabs/ConfigTab'), { ssr: false });

/* ─── Main Dashboard ─── */
export default function Dashboard() {
  const { data, error: loadError, isLoading, refresh } = useData();

  const [tab, setTab] = useState<TabId>('overview');
  // Where the user was before drilling into Detail (not in the tab bar)
  const [prevTab, setPrevTab] = useState<TabId>('overview');
  const [showBlacklist, setShowBlacklist] = useState(false);
  const [selectedBrainrot, setSelectedBrainrot] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState('score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [config, setConfig] = useState<Config>({ whitelisted: [], blacklisted: [], version: '1.0' });
  const [toast, setToast] = useState('');
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage?.getItem('brainrot-theme');
      if (saved === 'light' || saved === 'dark') return saved;
    }
    return 'dark';
  });

  /* ─── Theme sync ─── */
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { window.localStorage?.setItem('brainrot-theme', theme); } catch {}
  }, [theme]);
  const toggleTheme = useCallback(() => setTheme(t => t === 'dark' ? 'light' : 'dark'), []);

  /* ─── "Loaded X ago" timer ─── */
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [loadedAgoText, setLoadedAgoText] = useState('');
  useEffect(() => {
    // Reset on every successful (re)validation — SWR refreshes every 5 min,
    // so pinning to first load would claim the data is older than it is.
    if (data) setLoadedAt(Date.now()); // eslint-disable-line
  }, [data]);
  useEffect(() => {
    if (!loadedAt) return;
    const update = () => {
      const m = Math.floor((Date.now() - loadedAt) / 60000);
      setLoadedAgoText(m < 1 ? 'just now' : m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ago`);
    };
    update();
    const id = setInterval(update, 30000);
    return () => clearInterval(id);
  }, [loadedAt]);

  /* ─── Tab nav scroll indicators ─── */
  const tabNavCleanupRef = React.useRef<(() => void) | null>(null);
  const tabNavRef = useCallback((el: HTMLDivElement | null) => {
    if (tabNavCleanupRef.current) {
      tabNavCleanupRef.current();
      tabNavCleanupRef.current = null;
    }
    if (!el) return;
    const nav = el.querySelector('.tab-nav') as HTMLElement;
    if (!nav) return;
    const update = () => {
      el.classList.toggle('scroll-left', nav.scrollLeft > 8);
      el.classList.toggle('scroll-right', nav.scrollLeft < nav.scrollWidth - nav.clientWidth - 8);
    };
    nav.addEventListener('scroll', update, { passive: true });
    update();
    tabNavCleanupRef.current = () => nav.removeEventListener('scroll', update);
  }, []);

  /* ─── Sync config from API data (only on initial load, not on SWR refresh) ─── */
  const configLoadedRef = React.useRef(false);
  useEffect(() => {
    if (data?.config && !configLoadedRef.current) {
      setConfig({ whitelisted: data.config.whitelisted || [], blacklisted: data.config.blacklisted || [], version: '1.0' });
      configLoadedRef.current = true;
    }
  }, [data]);

  /* ─── Toast ─── */
  const toastTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => setToast(''), 3000);
  }, []);

  /* ─── Keyboard shortcuts ─── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Inert while a modal owns the keyboard, and when typing in inputs
      if (showBlacklist) return;
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return;

      const tabIds = TABS.map(t => t.id);
      const idx = tabIds.indexOf(tab);

      if (e.key === 'Escape' && tab === 'detail') {
        e.preventDefault();
        setTab(prevTab);
      } else if (e.key === 'ArrowLeft' && idx > 0) {
        e.preventDefault();
        setTab(tabIds[idx - 1]);
      } else if (e.key === 'ArrowRight' && idx >= 0 && idx < tabIds.length - 1) {
        e.preventDefault();
        setTab(tabIds[idx + 1]);
      } else if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        const searchEl = document.querySelector<HTMLInputElement>('.search-input');
        searchEl?.focus();
      } else if (e.key === 'r' && !e.metaKey && !e.ctrlKey) {
        refresh();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [tab, prevTab, refresh, showBlacklist]);

  /* ─── Watchlist helpers ─── */
  const isOnWL = useCallback((name: string) => config.whitelisted.some(w => w.pet_name.toLowerCase() === name.toLowerCase()), [config]);

  const buildWLItem = useCallback((name: string) => {
    const rec = data?.recommendations.find(r => r.name.toLowerCase() === name.toLowerCase());
    const b = data?.brainrots?.[name];
    const newItem: { pet_name: string; priority: number; min_value: number; mutations?: Record<string, number> } = {
      pet_name: name,
      priority: computePriority(rec || b as any),
      min_value: smartMinValue(rec || b),
    };
    if (rec) {
      const muts = buildMutationOverrides(rec);
      if (muts) newItem.mutations = muts;
    }
    return newItem;
  }, [data]);

  const addToWL = useCallback((name: string) => {
    if (isOnWL(name)) return;
    const newItem = buildWLItem(name);
    setConfig(c => ({ ...c, whitelisted: [...c.whitelisted, newItem] }));
    showToast(`Added ${name} to watchlist`);
  }, [isOnWL, buildWLItem, showToast]);

  const addManyToWL = useCallback((names: string[]) => {
    const fresh = names.filter(n => !isOnWL(n));
    if (fresh.length === 0) { showToast('All of those are already on the watchlist'); return; }
    const items = fresh.map(buildWLItem);
    setConfig(c => ({ ...c, whitelisted: [...c.whitelisted, ...items] }));
    showToast(`Added ${items.length} item${items.length === 1 ? '' : 's'} to watchlist`);
  }, [isOnWL, buildWLItem, showToast]);

  const removeFromWL = useCallback((name: string) => {
    setConfig(c => ({ ...c, whitelisted: c.whitelisted.filter(w => w.pet_name.toLowerCase() !== name.toLowerCase()) }));
    showToast(`Removed ${name} from watchlist`);
  }, [showToast]);

  /* ─── Watchlist persistence ───
     Config changes used to live only in React state — every "+ WL" was lost
     on restart unless the user happened to press Save in the Config tab.
     Auto-save with a debounce; skipped until the initial config has loaded. */
  useEffect(() => {
    if (!configLoadedRef.current) return;
    const t = setTimeout(() => {
      fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ whitelisted: config.whitelisted, blacklisted: config.blacklisted }),
      }).catch(() => { /* offline/transient — next change retries */ });
    }, 1500);
    return () => clearTimeout(t);
  }, [config]);

  /* ─── Scrape trigger (local app — no external cron) ─── */
  const [isScraping, setIsScraping] = useState(false);
  const scrapePollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (scrapePollRef.current) clearInterval(scrapePollRef.current); }, []);
  const scrapeRunning = isScraping;

  const wasScrapingRef = React.useRef(false);
  const pollTickRef = React.useRef(0);
  const watchScrape = useCallback(() => {
    if (scrapePollRef.current) clearInterval(scrapePollRef.current);
    const poll = async () => {
      try {
        const s = await fetch('/api/scrape?action=status').then(r => r.json());
        const status = s?.run?.status;
        if (status === 'running') {
          wasScrapingRef.current = true;
          setIsScraping(true);
          // Refresh dashboard data every ~20s mid-scrape so the bootstrap
          // preview (and growing numbers) appear without user action
          pollTickRef.current++;
          if (pollTickRef.current % 4 === 0) refresh();
        } else if (status) {
          if (scrapePollRef.current) { clearInterval(scrapePollRef.current); scrapePollRef.current = null; }
          setIsScraping(false);
          if (wasScrapingRef.current) {
            wasScrapingRef.current = false;
            refresh();
            showToast(status === 'completed'
              ? `Scrape done: ${s.run.total_listings?.toLocaleString() || '?'} listings`
              : 'Scrape failed — try again');
          }
        }
      } catch { /* transient poll error — keep waiting */ }
    };
    poll();
    scrapePollRef.current = setInterval(poll, 5000);
  }, [refresh, showToast]);

  // If the app loads while a scrape is already running (e.g. Electron
  // auto-scrape on launch), attach the progress poller automatically.
  // Stale 'running' rows (crashed runs >30 min old) are ignored — the next
  // trigger marks them failed.
  useEffect(() => {
    const run = data?.meta?.scrapeRuns?.[0];
    if (!isScraping && run?.status === 'running' && run.startedAt
      && Date.now() - new Date(run.startedAt).getTime() < 30 * 60 * 1000) {
      watchScrape();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, watchScrape]);

  const triggerScrape = useCallback(async () => {
    if (scrapeRunning) return;
    try {
      const res = await fetch('/api/scrape');
      const j = await res.json().catch(() => ({}));
      if (res.status === 409) {
        showToast('Scrape already running');
        wasScrapingRef.current = true;
        setIsScraping(true);
        watchScrape();
        return;
      }
      if (!res.ok || !j.success) {
        showToast(`Scrape failed to start: ${j.error || `HTTP ${res.status}`}`);
        return;
      }
      showToast('Scrape started — full market sweep takes ~5-10 min');
      wasScrapingRef.current = true;
      setIsScraping(true);
      watchScrape();
    } catch {
      showToast('Could not reach the scraper');
    }
  }, [scrapeRunning, watchScrape, showToast]);

  /* ─── Navigation helpers ─── */
  // Detail is a drill-in view — remember where the user came from
  const openDetail = useCallback((name: string) => {
    setSelectedBrainrot(name);
    if (tab !== 'detail') setPrevTab(tab);
    setTab('detail');
  }, [tab, setPrevTab]);
  const closeDetail = useCallback(() => setTab(prevTab), [prevTab]);

  const handleSort = useCallback((col: string) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  }, [sortCol]);

  /* ─── Price change alerts ───
     priceHistory has one row per (name, mutation, ms) per day. The old code
     compared the two latest ROWS for a name — often different combos — and
     used avg_price (polluted by decoy listings), producing nonsense like
     "+441135%". Now: collapse each name to one robust price per DAY
     (listing-count-weighted median_price), then compare the two most recent
     distinct days. Percent change is clamped so a stray value can't dominate. */
  const alerts = useMemo(() => {
    if (!data?.priceHistory || data.priceHistory.length < 2) return [];
    const items: { name: string; type: string; detail: string; pct: number; color: string }[] = [];
    // name -> date -> { weightedSum, weight }
    const byName: Record<string, Record<string, { sum: number; w: number }>> = {};
    for (const p of data.priceHistory) {
      const price = p.median_price;
      if (!(price > 0) || !isFinite(price)) continue;
      const w = Math.max(1, p.listing_count || 1);
      const days = (byName[p.name] ||= {});
      const d = (days[p.snapshot_date] ||= { sum: 0, w: 0 });
      d.sum += price * w;
      d.w += w;
    }
    for (const [name, days] of Object.entries(byName)) {
      const dates = Object.keys(days).sort();
      if (dates.length < 2) continue;
      const latest = days[dates[dates.length - 1]];
      const prev = days[dates[dates.length - 2]];
      const latestPrice = latest.sum / latest.w;
      const prevPrice = prev.sum / prev.w;
      if (!(prevPrice > 0) || !(latestPrice > 0)) continue;
      let pct = ((latestPrice - prevPrice) / prevPrice) * 100;
      if (!isFinite(pct)) continue;
      pct = Math.max(-99, Math.min(999, pct)); // clamp display
      if (Math.abs(pct) >= 15) {
        items.push({
          name,
          type: pct > 0 ? 'PRICE_UP' : 'PRICE_DROP',
          detail: `${pct > 0 ? '+' : ''}${pct.toFixed(0)}%`,
          pct,
          color: pct > 0 ? 'var(--green)' : 'var(--red)',
        });
      }
    }
    return items.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, 20);
  }, [data]);

  /* ─── Loading state — premium skeleton ─── */
  if (isLoading) return (
    <div role="status" aria-live="polite">
      <div className="loading-screen" style={{ minHeight: 'auto', padding: 'var(--sp-8) 0 var(--sp-4)' }}>
        <div className="loading-brand">Brainrot Intel</div>
        <div className="spinner" aria-hidden="true" />
        <div className="loading-hint">Connecting to market feed...</div>
      </div>
      <DashboardSkeleton />
    </div>
  );

  /* ─── Error / empty state ─── */
  if (!data) return (
    <div className="empty-state p-4 text-center">
      <div className="empty-state-title">
        {loadError ? 'Error Loading Data' : 'No Data Available'}
      </div>
      <div className="empty-state-sub">
        {loadError || 'The dashboard could not load. Please try refreshing.'}
      </div>
      <div className="d-flex gap-2 justify-center mt-3">
        <button type="button" className="btn btn-primary" onClick={() => refresh()}>
          Retry
        </button>
        <button type="button" className="btn" onClick={() => window.location.reload()}>
          Hard Refresh
        </button>
      </div>
    </div>
  );

  const { meta, recommendations, soldArchive, trending } = data;
  const isEmpty = meta.totalListings === 0;

  return (
    <div className="dashboard-wrap">
      {/* Header */}
      <div className="dash-header">
        <div className="dash-header-top">
          <div className="d-flex items-center gap-2 flex-wrap min-w-0 flex-1">
            <h1>Brainrot Market Intelligence</h1>
            {!isEmpty && <span className="pill pill-live">LIVE</span>}
            {isEmpty && <span className="pill pill-warn">AWAITING DATA</span>}
            {alerts.length > 0 && <span className="pill pill-alert">{alerts.length} ALERTS</span>}
          </div>
          <div className="dash-header-actions">
            <button type="button" className="theme-toggle" onClick={toggleTheme} aria-label="Toggle theme" title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
              {theme === 'dark' ? '\u2600\uFE0F' : '\uD83C\uDF19'}
            </button>
            <button type="button" className="btn btn-compact" onClick={triggerScrape} disabled={scrapeRunning}
              title="Fetch fresh market data from Eldorado (~5-10 min)">
              {scrapeRunning ? 'Scraping…' : '⟳ Scrape Now'}
            </button>
            <button type="button" className="btn btn-compact" onClick={() => setShowBlacklist(true)}
              title="Brainrots skipped when scraping and hidden from the app">
              🚫 Blacklist
            </button>
            <button type="button" className="btn btn-primary btn-export" onClick={() => downloadConfigJSON(config, showToast, recommendations)}>
              Export Config
            </button>
            <button type="button" className="btn btn-compact" onClick={() => exportData(recommendations.map(r => ({ name: r.name, tier: r.tier, score: r.score, rarity: r.rarity, median: r.med, min: r.min, max: r.max, roi: r.roiPct, sold: r.soldCount, listings: r.listings })), 'recommendations', 'csv')}>Recs CSV</button>
            <button type="button" className="btn btn-compact" onClick={async () => {
              // Pull the full dataset incl. raw listings (omitted from the
              // lightweight poll payload) for a complete export.
              try {
                const full = await fetch('/api/data?include=raw').then(r => r.json());
                exportData(full, 'full-data', 'json');
              } catch { exportData(data, 'full-data', 'json'); }
            }}>Export All</button>
          </div>
        </div>
        <div className="header-stats">
          <span>{meta.totalListings.toLocaleString()} listings</span>
          <span>{meta.uniqueBrainrots} brainrots</span>
          <span>{meta.totalSellers.toLocaleString()} sellers</span>
          <span>{meta.totalQty?.toLocaleString()} total qty</span>
          {meta.trendingCount > 0 && <span className="stat-orange">{meta.trendingCount} trending</span>}
          {meta.totalSoldLast30d > 0 && <span className="text-red">{meta.totalSoldLast30d} sold/delisted (30d)</span>}
          {meta.lastScrape && <span>Last scrape: {timeAgo(meta.lastScrape)}</span>}
          {loadedAgoText && <span className="stat-accent">Loaded {loadedAgoText}</span>}
        </div>
      </div>

      {/* Empty state: full sync screen while the first scrape runs, banner otherwise */}
      {isEmpty && scrapeRunning && <FirstSyncOverlay />}
      {isEmpty && !scrapeRunning && (
        <div className="banner banner-error">
          <div className="fw-700 text-lg text-red mb-1">No live listings data</div>
          <div className="text-md text-sub">
            Hit <strong>Scrape Now</strong> in the header to pull the full Eldorado market (~5-10 min). Historical price data, sold archive, and market changes are still available below.
            {meta.scrapeRuns && meta.scrapeRuns.length > 0 && (
              <span> Last successful scrape had {meta.scrapeRuns.find(r => r.status === 'completed')?.totalListings?.toLocaleString() || '?'} listings.</span>
            )}
          </div>
        </div>
      )}

      {/* Alerts bar */}
      {alerts.length > 0 && (
        <div className="alert-bar">
          {alerts.slice(0, 8).map((a) => (
            <button type="button" key={`alert-${a.name}-${a.type}`} onClick={() => openDetail(a.name)} className="chip cursor-pointer" style={{ borderColor: a.color }}>
              <span className="chip-icon" style={{ color: a.color }}>{a.type === 'PRICE_UP' ? '\u25B2' : '\u25BC'}</span>
              <span className="chip-label">{a.name}</span>
              <span className="chip-detail" style={{ color: a.color }}>{a.detail}</span>
            </button>
          ))}
        </div>
      )}

      {/* Tab navigation (hidden during first sync) */}
      {!(isEmpty && scrapeRunning) && (
      <div className="tab-nav-wrap mb-4" ref={tabNavRef}>
        <div className="tab-nav" role="tablist" aria-label="Dashboard sections">
          {TABS.map(t => (
            <button type="button" key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`tab-btn ${tab === t.id ? 'active' : ''} ${t.accent ? 'accent' : ''}`}>
              {t.label}
              {t.id === 'sold' && (soldArchive?.recent?.length ?? 0) > 0 && <span className="tab-count tab-count-red">({soldArchive.recent.length})</span>}
              {t.id === 'trending' && trending.length > 0 && <span className="tab-count tab-count-orange">({trending.length})</span>}
              {t.id === 'watchlist' && config.whitelisted.length > 0 && <span className="tab-count tab-count-gold">({config.whitelisted.length})</span>}
              {t.id === 'config' && config.whitelisted.length > 0 && <span className="tab-count tab-count-accent">({config.whitelisted.length})</span>}
            </button>
          ))}
        </div>
      </div>
      )}

      {/* Tab content (hidden during first sync) */}
      {!(isEmpty && scrapeRunning) && (
      <div className="animate-fade-in" key={tab} role="tabpanel" aria-label={TABS.find(t => t.id === tab)?.label}>
        <TabErrorBoundary key={`eb-${tab}`}>
          {tab === 'overview' && <OverviewTab data={data} openDetail={openDetail} />}
          {tab === 'brainrots' && <BrainrotsTab data={data} search={search} setSearch={setSearch} sortCol={sortCol} sortDir={sortDir} handleSort={handleSort} openDetail={openDetail} isOnWL={isOnWL} addToWL={addToWL} removeFromWL={removeFromWL} />}
          {tab === 'detail' && (
            <>
              <button type="button" className="btn btn-sm mb-3" onClick={closeDetail} aria-label="Back to previous view">
                ← Back to {TABS.find(t => t.id === prevTab)?.label || 'Overview'}
              </button>
              <DetailTab data={data} selected={selectedBrainrot} setSelected={setSelectedBrainrot} isOnWL={isOnWL} addToWL={addToWL} removeFromWL={removeFromWL} />
            </>
          )}
          {tab === 'recs' && <RecsTab data={data} search={search} setSearch={setSearch} openDetail={openDetail} isOnWL={isOnWL} addToWL={addToWL} addManyToWL={addManyToWL} removeFromWL={removeFromWL} />}
          {tab === 'watchlist' && <WatchlistTab data={data} config={config} openDetail={openDetail} removeFromWL={removeFromWL} showToast={showToast} />}
          {tab === 'sellers' && <SellersTab data={data} />}
          {tab === 'sold' && <SoldTab data={data} openDetail={openDetail} />}
          {tab === 'trending' && <TrendingTab data={data} openDetail={openDetail} />}
          {tab === 'mutations' && <MutationsTab data={data} />}
          {tab === 'config' && <ConfigTab data={data} config={config} setConfig={setConfig} showToast={showToast} />}
        </TabErrorBoundary>
      </div>
      )}

      {/* Scrape blacklist manager */}
      {showBlacklist && (
        <BlacklistModal
          onClose={() => setShowBlacklist(false)}
          showToast={showToast}
          onChanged={() => refresh()}
          suggestions={Object.keys(data.brainrots || {}).sort()}
        />
      )}

      {/* Floating config shortcut */}
      {tab !== 'config' && config.whitelisted.length > 0 && (
        <button type="button" className="fab" onClick={() => setTab('config')} title="Go to Config" aria-label="Go to Config tab">
          {'\u2699\uFE0F'} <span className="fab-count">{config.whitelisted.length}</span>
        </button>
      )}

      {/* Footer: version + disclaimer */}
      <footer className="d-flex justify-between items-center flex-wrap gap-2 mt-4" style={{ padding: '14px 4px 8px', borderTop: '1px solid var(--border)', fontSize: '0.68rem', color: 'var(--text3)' }}>
        <span>Brainrot Market Intelligence v1.2.2 · data refreshes automatically from Eldorado.gg</span>
        <span>Unofficial fan tool — not affiliated with Roblox, Steal a Brainrot, or Eldorado.gg. Prices are public marketplace data; use at your own risk.</span>
      </footer>

      {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
    </div>
  );
}
