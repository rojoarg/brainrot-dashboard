'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import type { DashData, Config, TabId } from './lib/types';
import { TABS } from './lib/constants';
import { timeAgo, downloadConfigJSON, exportData, smartMinValue, getMutationAdvisory } from './lib/utils';
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
const UserDashTab = dynamic(() => import('./components/tabs/UserDashTab'), { ssr: false });
const ConfigTab = dynamic(() => import('./components/tabs/ConfigTab'), { ssr: false });
const RawTab = dynamic(() => import('./components/tabs/RawTab'), { ssr: false });

/* ─── Main Dashboard ─── */
export default function Dashboard() {
  const { data, error: loadError, isLoading } = useData();

  const [tab, setTab] = useState<TabId>('overview');
  const [selectedBrainrot, setSelectedBrainrot] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState('score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [config, setConfig] = useState<Config>({ whitelisted: [], blacklisted: [], version: '1.0' });
  const [toast, setToast] = useState('');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  /* ─── Theme ─── */
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage?.getItem('brainrot-theme') : null;
    if (saved === 'light' || saved === 'dark') setTheme(saved);
  }, []);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { window.localStorage?.setItem('brainrot-theme', theme); } catch {}
  }, [theme]);
  const toggleTheme = useCallback(() => setTheme(t => t === 'dark' ? 'light' : 'dark'), []);

  /* ─── "Loaded X ago" timer ─── */
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [loadedAgoText, setLoadedAgoText] = useState('');
  useEffect(() => {
    if (data && !loadedAt) setLoadedAt(Date.now());
  }, [data, loadedAt]);
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

  /* ─── Sync config from API data ─── */
  useEffect(() => {
    if (data?.config) {
      setConfig({ whitelisted: data.config.whitelisted || [], blacklisted: data.config.blacklisted || [], version: '1.0' });
    }
  }, [data]);

  /* ─── Toast ─── */
  const toastTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => setToast(''), 3000);
  }, []);

  /* ─── Watchlist helpers ─── */
  const isOnWL = useCallback((name: string) => config.whitelisted.some(w => w.pet_name.toLowerCase() === name.toLowerCase()), [config]);

  const addToWL = useCallback((name: string) => {
    if (isOnWL(name)) return;
    const rec = data?.recommendations.find(r => r.name.toLowerCase() === name.toLowerCase());
    const b = data?.brainrots?.[name];
    const newItem: { pet_name: string; priority: number; min_value: number; mutations?: Record<string, number> } = {
      pet_name: name,
      priority: rec ? Math.round(100 - rec.score) : 50,
      min_value: smartMinValue(rec || b),
    };
    if (rec) {
      const advisory = getMutationAdvisory(rec);
      const overrides = advisory.filter(a => a.needsOverride);
      if (overrides.length > 0) {
        newItem.mutations = {};
        for (const o of overrides) {
          newItem.mutations[o.mutation] = o.recommendedOverride;
        }
      }
    }
    setConfig(c => ({
      ...c,
      whitelisted: [...c.whitelisted, newItem],
    }));
    showToast(`Added ${name} to watchlist`);
  }, [data, isOnWL, showToast]);

  const removeFromWL = useCallback((name: string) => {
    setConfig(c => ({ ...c, whitelisted: c.whitelisted.filter(w => w.pet_name.toLowerCase() !== name.toLowerCase()) }));
    showToast(`Removed ${name} from watchlist`);
  }, [showToast]);

  /* ─── Navigation helpers ─── */
  const openDetail = useCallback((name: string) => { setSelectedBrainrot(name); setTab('detail'); }, []);

  const handleSort = useCallback((col: string) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  }, [sortCol]);

  /* ─── Price change alerts ─── */
  const alerts = useMemo(() => {
    if (!data?.priceHistory || data.priceHistory.length < 2) return [];
    const items: { name: string; type: string; detail: string; color: string }[] = [];
    const byName: Record<string, typeof data.priceHistory> = {};
    data.priceHistory.forEach(p => {
      if (!byName[p.name]) byName[p.name] = [];
      byName[p.name].push(p);
    });
    for (const [name, snapshots] of Object.entries(byName)) {
      if (snapshots.length < 2) continue;
      const sorted = [...snapshots].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
      const latest = sorted[sorted.length - 1];
      const prev = sorted[sorted.length - 2];
      if (prev.avg_price > 0 && latest.avg_price > 0 && isFinite(prev.avg_price) && isFinite(latest.avg_price)) {
        const pctChange = ((latest.avg_price - prev.avg_price) / prev.avg_price) * 100;
        if (isFinite(pctChange) && Math.abs(pctChange) >= 15) {
          items.push({
            name,
            type: pctChange > 0 ? 'PRICE_UP' : 'PRICE_DROP',
            detail: `${pctChange > 0 ? '+' : ''}${pctChange.toFixed(0)}% avg price`,
            color: pctChange > 0 ? 'var(--green)' : 'var(--red)',
          });
        }
      }
    }
    return items.sort((a, b) => Math.abs(parseFloat(b.detail)) - Math.abs(parseFloat(a.detail))).slice(0, 20);
  }, [data]);

  /* ─── Loading state ─── */
  if (isLoading) return (
    <div className="loading-screen">
      <div className="loading-brand">Brainrot Intel</div>
      <div className="spinner" />
      <div className="loading-hint">Loading market intelligence...</div>
    </div>
  );

  /* ─── Error / empty state ─── */
  if (!data) return (
    <div className="empty-state" style={{ padding: 40, textAlign: 'center' }}>
      <div className="empty-state-title">
        {loadError ? 'Error Loading Data' : 'No Data Available'}
      </div>
      <div className="empty-state-sub">
        {loadError || 'The dashboard could not load. Please try refreshing.'}
      </div>
      <button type="button" className="btn btn-primary" onClick={() => window.location.reload()} style={{ marginTop: 16 }}>
        Refresh
      </button>
    </div>
  );

  const { meta, recommendations, soldArchive, trending } = data;
  const isEmpty = meta.totalListings === 0;

  return (
    <div className="dashboard-wrap">
      {/* Header */}
      <div className="dash-header">
        <div className="dash-header-top">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0, flex: 1 }}>
            <h1 style={{ whiteSpace: 'nowrap' }}>Brainrot Market Intelligence</h1>
            {!isEmpty && <span className="pill pill-live">LIVE</span>}
            {isEmpty && <span className="pill pill-warn">AWAITING DATA</span>}
            {alerts.length > 0 && <span className="pill pill-alert">{alerts.length} ALERTS</span>}
          </div>
          <div className="dash-header-actions" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle theme" title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
              {theme === 'dark' ? '\u2600\uFE0F' : '\uD83C\uDF19'}
            </button>
            <button type="button" className="btn btn-primary" style={{ fontSize: 12, fontWeight: 700, minWidth: 'auto' }} onClick={() => downloadConfigJSON(config, showToast, recommendations)}>
              Export Config
            </button>
            <button type="button" className="btn" style={{ fontSize: 11, minWidth: 'auto' }} onClick={() => exportData(recommendations.map(r => ({ name: r.name, tier: r.tier, score: r.score, rarity: r.rarity, median: r.med, min: r.min, max: r.max, roi: r.roiPct, sold: r.soldCount, listings: r.listings })), 'recommendations', 'csv')}>Recs CSV</button>
            <button type="button" className="btn" style={{ fontSize: 11, minWidth: 'auto' }} onClick={() => exportData(data, 'full-data', 'json')}>Export All</button>
          </div>
        </div>
        <div className="header-stats">
          <span>{meta.totalListings.toLocaleString()} listings</span>
          <span>{meta.uniqueBrainrots} brainrots</span>
          <span>{meta.totalSellers.toLocaleString()} sellers</span>
          <span>{meta.totalQty?.toLocaleString()} total qty</span>
          {meta.trendingCount > 0 && <span style={{ color: 'var(--orange)' }}>{meta.trendingCount} trending</span>}
          {meta.totalSoldLast30d > 0 && <span style={{ color: 'var(--red)' }}>{meta.totalSoldLast30d} sold/delisted (30d)</span>}
          {meta.lastScrape && <span>Last scrape: {timeAgo(meta.lastScrape)}</span>}
          {loadedAgoText && <span style={{ color: 'var(--accent2)' }}>Loaded {loadedAgoText}</span>}
        </div>
      </div>

      {/* Empty state banner */}
      {isEmpty && (
        <div className="banner banner-error">
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--red)', marginBottom: 4 }}>No live listings data</div>
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>
            The scraper will repopulate data at the next scheduled run (6am UTC daily). Historical price data, sold archive, and market changes are still available below.
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
            <div key={`alert-${a.name}-${a.type}`} onClick={() => openDetail(a.name)} className="chip cursor-pointer" style={{ borderColor: a.color }}>
              <span style={{ fontSize: 10, color: a.color, fontWeight: 700 }}>{a.type === 'PRICE_UP' ? '\u25B2' : '\u25BC'}</span>
              <span style={{ fontSize: 11 }}>{a.name}</span>
              <span style={{ fontSize: 10, color: a.color, fontWeight: 600 }}>{a.detail}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tab navigation */}
      <div className="tab-nav-wrap" style={{ marginBottom: 20 }} ref={tabNavRef}>
        <div className="tab-nav" role="tablist" aria-label="Dashboard sections">
          {TABS.map(t => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`tab-btn ${tab === t.id ? 'active' : ''} ${t.accent ? 'accent' : ''}`}>
              {t.label}
              {t.id === 'sold' && (soldArchive?.recent?.length ?? 0) > 0 && <span className="tab-count tab-count-red">({soldArchive.recent.length})</span>}
              {t.id === 'trending' && trending.length > 0 && <span className="tab-count tab-count-orange">({trending.length})</span>}
              {t.id === 'watchlist' && config.whitelisted.length > 0 && <span className="tab-count tab-count-gold">({config.whitelisted.length})</span>}
              {t.id === 'config' && config.whitelisted.length > 0 && <span className="tab-count tab-count-accent">({config.whitelisted.length})</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="animate-fade-in" key={tab} role="tabpanel" aria-label={TABS.find(t => t.id === tab)?.label}>
        {tab === 'overview' && <OverviewTab data={data} openDetail={openDetail} />}
        {tab === 'brainrots' && <BrainrotsTab data={data} search={search} setSearch={setSearch} sortCol={sortCol} sortDir={sortDir} handleSort={handleSort} openDetail={openDetail} isOnWL={isOnWL} addToWL={addToWL} removeFromWL={removeFromWL} />}
        {tab === 'detail' && <DetailTab data={data} selected={selectedBrainrot} setSelected={setSelectedBrainrot} isOnWL={isOnWL} addToWL={addToWL} removeFromWL={removeFromWL} />}
        {tab === 'recs' && <RecsTab data={data} search={search} setSearch={setSearch} openDetail={openDetail} isOnWL={isOnWL} addToWL={addToWL} removeFromWL={removeFromWL} />}
        {tab === 'watchlist' && <WatchlistTab data={data} config={config} openDetail={openDetail} removeFromWL={removeFromWL} />}
        {tab === 'sellers' && <SellersTab data={data} openDetail={openDetail} />}
        {tab === 'sold' && <SoldTab data={data} openDetail={openDetail} />}
        {tab === 'trending' && <TrendingTab data={data} openDetail={openDetail} />}
        {tab === 'mutations' && <MutationsTab data={data} />}
        {tab === 'user' && <UserDashTab data={data} config={config} setConfig={setConfig} showToast={showToast} openDetail={openDetail} isOnWL={isOnWL} addToWL={addToWL} removeFromWL={removeFromWL} />}
        {tab === 'config' && <ConfigTab data={data} config={config} setConfig={setConfig} showToast={showToast} />}
        {tab === 'raw' && <RawTab data={data} />}
      </div>

      {/* Floating config shortcut */}
      {tab !== 'config' && config.whitelisted.length > 0 && (
        <button className="fab" onClick={() => setTab('config')} title="Go to Config" aria-label="Go to Config tab">
          {'\u2699\uFE0F'} <span className="fab-count">{config.whitelisted.length}</span>
        </button>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
