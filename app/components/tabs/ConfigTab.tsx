'use client';

import React, { useState, useMemo } from 'react';
import type { Config, DashData, Recommendation, WLItem } from '../../lib/types';
import { fmtPrice, fmtMinValue, smartMinValue, downloadConfigJSON, getMutationAdvisory, getRarityWeight, computePriority, getMaxMutationPrice, getMutationSummary, type GemMode } from '../../lib/utils';
import { RarityBadge, TierBadge, ImageThumb } from '../ui';

interface ConfigTabProps {
  data: DashData;
  config: Config;
  setConfig: (config: Config | ((c: Config) => Config)) => void;
  showToast: (msg: string) => void;
}

/* ─── Profit Score (internal sort metric) ─── */
function profitScore(r: Recommendation): number {
  if (!r) return 0;
  const med = r.med ?? 0;
  const priceSignal = med > 0 ? Math.min(40, Math.sqrt(med) * 2) : 0;
  const flip = Math.min(15, (r.flipScore ?? 0) * 1.5);
  const demand = r.soldCount > 0 ? Math.min(15, Math.log2(r.soldCount + 1) * 3) : 0;
  const farm = Math.min(8, (r.farmScore ?? 0));
  const depth = Math.min(5, (r.listings ?? 0) >= 10 ? 5 : (r.listings ?? 0) >= 5 ? 3 : (r.listings ?? 0) >= 2 ? 1 : 0);
  const baseScore = Math.min(10, (r.score ?? 0) * 0.1);
  const rarityTiebreak = Math.max(0, 10 - getRarityWeight(r.rarity)) * 0.3;
  const score = priceSignal + flip + demand + farm + depth + baseScore + rarityTiebreak;
  return isFinite(score) ? score : 0;
}

/* ─── 3 Strategies ─── */
const STRATEGIES: Record<string, {
  label: string; desc: string; detail: string; icon: string; color: string; gradient: string;
  sort: (a: Recommendation, b: Recommendation) => number;
  gemMode?: GemMode;
  defaults?: { priceField?: 'min' | 'med' | 'max'; minPrice?: string; maxPrice?: string };
}> = {
  allstar: {
    label: 'All-Star', desc: 'Best overall value', detail: 'Full competitive gem budgets. Sorted by profit score (price + flip + demand + rarity). Premium items always 1M gems.', icon: '\u2B50', color: '#ffc048', gradient: 'linear-gradient(135deg, #ffc04822, #ff880022)',
    gemMode: 'default',
    sort: (a, b) => profitScore(b) - profitScore(a),
    defaults: { priceField: 'med', minPrice: '2' },
  },
  farmer: {
    label: 'Farmer', desc: 'Volume + proven demand', detail: 'Uses p25 pricing with tight gem budgets (50M-300M). Prioritizes high farm score, sold count, and listing depth. Premium items still 1M.', icon: '\uD83C\uDF3E', color: '#00d68f', gradient: 'linear-gradient(135deg, #00d68f22, #00b37a22)',
    gemMode: 'farmer',
    defaults: { priceField: 'med', minPrice: '2' },
    sort: (a, b) => {
      const aS = (a.farmScore || 0) * 3 + (a.soldCount || 0) * 2 + Math.min(a.listings ?? 0, 30) * 0.3 + ((a.med ?? 0) < 20 ? 5 : (a.med ?? 0) < 50 ? 3 : 0);
      const bS = (b.farmScore || 0) * 3 + (b.soldCount || 0) * 2 + Math.min(b.listings ?? 0, 30) * 0.3 + ((b.med ?? 0) < 20 ? 5 : (b.med ?? 0) < 50 ? 3 : 0);
      return bS - aS;
    },
  },
  trending: {
    label: 'Trending', desc: 'Hot items right now', detail: 'Momentum-based: trending listings × 5 + sold count × 2 + score. Default gem budgets. Catches fast movers.', icon: '\uD83D\uDD25', color: '#ff6b35', gradient: 'linear-gradient(135deg, #ff6b3522, #cc440022)',
    gemMode: 'default',
    defaults: { priceField: 'med', minPrice: '0' },
    sort: (a, b) => ((b.trendingListings || 0) * 5 + (b.soldCount || 0) * 2 + (b.score ?? 0) * 0.3)
                   - ((a.trendingListings || 0) * 5 + (a.soldCount || 0) * 2 + (a.score ?? 0) * 0.3),
  },
};

// $20+ = 1M gems = always worth grabbing = pinned at top of every strategy
const PREMIUM_THRESHOLD = 20;

const GEM_LABELS: Record<number, string> = {
  1000000: '1M', 10000000: '10M', 50000000: '50M', 100000000: '100M',
  150000000: '150M', 200000000: '200M', 300000000: '300M', 400000000: '400M',
  500000000: '500M', 600000000: '600M', 700000000: '700M', 800000000: '800M',
  1000000000: '1B', 1500000000: '1.5B', 2000000000: '2B',
};
const GEM_OPTIONS = Object.entries(GEM_LABELS).map(([v, l]) => ({ value: Number(v), label: l })).sort((a, b) => a.value - b.value);

/* ─── Quick filter chip types ─── */
type QuickFilter = 'hasSold' | 'hasMutations' | 'tierS' | 'tierA' | 'premium';

function ConfigTab({ data, config, setConfig, showToast }: ConfigTabProps) {
  const [activeStrategy, setActiveStrategy] = useState<string>('allstar');
  const [filterMinPrice, setFilterMinPrice] = useState('2');
  const [filterMaxPrice, setFilterMaxPrice] = useState('99999');
  const [filterPriceField, setFilterPriceField] = useState<'min' | 'med' | 'max'>('med');
  const [minListings, setMinListings] = useState('1');
  const [minSold, setMinSold] = useState('0');
  const [maxItems, setMaxItems] = useState('100');
  const [rarity, setRarity] = useState('all');
  const [excludedRarities, setExcludedRarities] = useState<Set<string>>(new Set());
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [blInput, setBlInput] = useState('');
  const [removedItems, setRemovedItems] = useState<Set<string>>(new Set());
  const [minValueOverrides, setMinValueOverrides] = useState<Record<string, number>>({});
  const [quickFilters, setQuickFilters] = useState<Set<QuickFilter>>(new Set());
  const [tableSearch, setTableSearch] = useState('');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const strat = STRATEGIES[activeStrategy];
  const gemMode: GemMode = strat?.gemMode || 'default';

  const allRarities = useMemo(() => {
    if (!data?.recommendations) return [];
    const set = new Set<string>();
    data.recommendations.forEach((r: Recommendation) => { if (r?.rarity) set.add(r.rarity); });
    return Array.from(set).sort((a, b) => getRarityWeight(a) - getRarityWeight(b));
  }, [data]);

  /* ─── Filter (mutation-aware) ─── */
  const filtered = useMemo(() => {
    if (!data?.recommendations) return [];
    const lo = parseFloat(filterMinPrice) || 0;
    const hi = parseFloat(filterMaxPrice) || 999999;
    const ml = parseInt(minListings) || 1;
    const ms = parseInt(minSold) || 0;
    const bl = new Set(config.blacklisted.map((n: string) => n.toLowerCase()));
    const pf = filterPriceField;
    return data.recommendations.filter((r: Recommendation) => {
      if (!r || !r.name || bl.has(r.name.toLowerCase()) || r.name.toLowerCase() === 'other') return false;
      if (rarity !== 'all' && r.rarity !== rarity) return false;
      if (excludedRarities.has(r.rarity)) return false;
      if (ms > 0 && (r.soldCount ?? 0) < ms) return false;
      const price = pf === 'min' ? (r.min ?? 0) : pf === 'max' ? (r.max ?? 0) : (r.med ?? 0);
      const maxMutPrice = getMaxMutationPrice(r);
      const effectivePrice = Math.max(r.med ?? 0, maxMutPrice);
      // Premium ($20+ base or mutation) ALWAYS pass
      if (effectivePrice >= PREMIUM_THRESHOLD) return (r.listings ?? 0) >= ml;
      // Include if any mutation price falls in range
      if (maxMutPrice > 0 && maxMutPrice >= lo && maxMutPrice <= hi) return (r.listings ?? 0) >= ml;
      return price >= lo && price <= hi && (r.listings ?? 0) >= ml;
    });
  }, [data, filterMinPrice, filterMaxPrice, filterPriceField, minListings, minSold, rarity, excludedRarities, config.blacklisted]);

  /* ─── Sort (premium pinned, strategy for the rest) ─── */
  const results = useMemo(() => {
    const sortFn = strat?.sort || ((a: Recommendation, b: Recommendation) => b.score - a.score);
    const maxN = parseInt(maxItems) || 100;
    const effectivePrice = (r: Recommendation) => Math.max(r.med ?? 0, getMaxMutationPrice(r));
    const premium = filtered.filter(r => effectivePrice(r) >= PREMIUM_THRESHOLD);
    const pool = filtered.filter(r => effectivePrice(r) < PREMIUM_THRESHOLD);
    premium.sort((a, b) => effectivePrice(b) - effectivePrice(a));
    pool.sort(sortFn);
    const seen = new Set<string>();
    const combined: Recommendation[] = [];
    for (const r of premium) { if (!seen.has(r.name)) { seen.add(r.name); combined.push(r); } }
    for (const r of pool) { if (combined.length >= maxN) break; if (!seen.has(r.name)) { seen.add(r.name); combined.push(r); } }
    return combined.slice(0, maxN);
  }, [filtered, strat, maxItems]);

  /* ─── Apply quick filters + search on display ─── */
  const displayResults = useMemo(() => {
    let list = results.filter(r => !removedItems.has(r.name));
    // Quick filters
    if (quickFilters.has('hasSold')) list = list.filter(r => (r.soldCount ?? 0) > 0);
    if (quickFilters.has('hasMutations')) list = list.filter(r => getMutationSummary(r).count > 0);
    if (quickFilters.has('tierS')) list = list.filter(r => r.tier === 'S');
    if (quickFilters.has('tierA')) list = list.filter(r => r.tier === 'S' || r.tier === 'A');
    if (quickFilters.has('premium')) list = list.filter(r => Math.max(r.med ?? 0, getMaxMutationPrice(r)) >= PREMIUM_THRESHOLD);
    // Table search
    if (tableSearch.trim()) {
      const q = tableSearch.toLowerCase().trim();
      list = list.filter(r => r.name.toLowerCase().includes(q) || r.rarity.toLowerCase().includes(q));
    }
    return list;
  }, [results, removedItems, quickFilters, tableSearch]);

  const getMinValue = (r: Recommendation) => {
    if (minValueOverrides[r.name] != null) return minValueOverrides[r.name];
    return smartMinValue(r, undefined, gemMode);
  };

  /* ─── Summary stats ─── */
  const summary = useMemo(() => {
    const premium = displayResults.filter(r => (r.med ?? 0) >= 20);
    const mid = displayResults.filter(r => (r.med ?? 0) >= 5 && (r.med ?? 0) < 20);
    const cheap = displayResults.filter(r => (r.med ?? 0) < 5);
    const totalSold = displayResults.reduce((s, r) => s + (r.soldCount ?? 0), 0);
    const totalValue = displayResults.reduce((s, r) => s + (r.med ?? 0), 0);
    const mutOverrides = displayResults.reduce((s, r) => s + getMutationAdvisory(r, gemMode).filter(a => a.needsOverride).length, 0);
    const tierCounts = { S: 0, A: 0, B: 0, C: 0, D: 0 };
    displayResults.forEach(r => { if (r.tier in tierCounts) tierCounts[r.tier as keyof typeof tierCounts]++; });
    return { premium: premium.length, mid: mid.length, cheap: cheap.length, totalSold, totalValue, mutOverrides, tierCounts, total: displayResults.length };
  }, [displayResults, gemMode]);

  /* ─── Generate + download ─── */
  const generateAndDownload = () => {
    const wl: WLItem[] = displayResults.map((r: Recommendation) => {
      if (!r?.name) return null as any;
      const item: WLItem = { pet_name: r.name, priority: computePriority(r), min_value: getMinValue(r) };
      const advisory = getMutationAdvisory(r, gemMode);
      const withOverrides = advisory.filter(a => a?.needsOverride);
      if (withOverrides.length > 0) {
        item.mutations = {};
        for (const o of withOverrides) {
          if (o?.mutation && typeof o.recommendedOverride === 'number') item.mutations[o.mutation] = o.recommendedOverride;
        }
      }
      return item;
    }).filter((w: WLItem | null) => w !== null);
    const genConfig: Config = { whitelisted: wl, blacklisted: config.blacklisted, version: '1.0' };
    setConfig(genConfig);
    downloadConfigJSON(genConfig, showToast, data.recommendations, gemMode);
  };

  /* ─── Save to DB ─── */
  const saveConfig = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ whitelisted: config.whitelisted, blacklisted: config.blacklisted }) });
      const result = await res.json();
      if (res.ok && result.success) showToast(`Saved ${result.whitelisted} items + ${result.blacklisted} blacklisted`);
      else showToast(`Save failed: ${result.error || 'unknown error'}`);
    } catch { showToast('Save failed'); }
    finally { setIsSaving(false); }
  };

  /* ─── Import JSON ─── */
  const importConfig = () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file || file.size > 5 * 1024 * 1024) { if (file) showToast('File too large'); return; }
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const imported = JSON.parse(ev.target?.result as string);
          if (!imported?.whitelisted || !Array.isArray(imported.whitelisted)) { showToast('Invalid config'); return; }
          const wl: WLItem[] = imported.whitelisted.map((w: any, i: number) => {
            const pet_name = (w?.pet_name || w?.name || '').toString().trim();
            const item: WLItem = { pet_name, priority: typeof w?.priority === 'number' ? w.priority : i, min_value: typeof w?.min_value === 'number' && w.min_value > 0 ? w.min_value : 1000000 };
            if (w?.mutations && typeof w.mutations === 'object') {
              const muts: Record<string, number> = {};
              for (const [k, v] of Object.entries(w.mutations)) { if (typeof v === 'number' && v > 0) muts[k] = v; }
              if (Object.keys(muts).length > 0) item.mutations = muts;
            }
            return item;
          }).filter((w: WLItem) => w.pet_name.length > 0);
          const bl = Array.isArray(imported.blacklisted) ? imported.blacklisted.filter((b: unknown) => typeof b === 'string' && (b as string).trim().length > 0).map((b: string) => b.trim()) : [];
          setConfig({ whitelisted: wl, blacklisted: bl, version: '1.0' });
          showToast(`Imported ${wl.length} items`);
        } catch (e) { showToast('Failed to parse: ' + (e instanceof Error ? e.message : 'unknown')); }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const addToBlacklist = (name: string) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    if (config.blacklisted.some((b: string) => b.toLowerCase() === trimmed.toLowerCase())) { showToast(`"${trimmed}" already blacklisted`); return; }
    setConfig((c: Config) => ({ ...c, blacklisted: [...c.blacklisted, trimmed] }));
    showToast(`Blacklisted "${trimmed}"`);
  };

  const switchStrategy = (id: string) => {
    setActiveStrategy(id);
    setRemovedItems(new Set());
    setMinValueOverrides({});
    setQuickFilters(new Set());
    setTableSearch('');
    setExpandedRow(null);
    const s = STRATEGIES[id];
    if (s?.defaults) {
      if (s.defaults.priceField) setFilterPriceField(s.defaults.priceField);
      if (s.defaults.minPrice != null) setFilterMinPrice(s.defaults.minPrice);
      if (s.defaults.maxPrice != null) setFilterMaxPrice(s.defaults.maxPrice);
      else setFilterMaxPrice('99999');
    }
  };

  const toggleQuickFilter = (f: QuickFilter) => {
    setQuickFilters(prev => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f); else next.add(f);
      return next;
    });
  };

  /* ─── Data freshness ─── */
  const dataFreshness = useMemo(() => {
    if (!data?.meta) return null;
    const runs = data.meta.scrapeRuns || [];
    const lastCompleted = runs.find((r: any) => r.status === 'completed');
    const lastScrapeAt = lastCompleted?.completed_at || lastCompleted?.started_at || null;
    const now = Date.now(); // eslint-disable-line
    const hoursAgo = lastScrapeAt ? Math.floor((now - new Date(lastScrapeAt).getTime()) / 3600000) : null;
    return { total: data.meta.totalListings || 0, unique: data.meta.uniqueBrainrots || 0, hoursAgo, isStale: hoursAgo === null || hoursAgo > 24 };
  }, [data]);

  const priceFieldLabel = filterPriceField === 'min' ? 'min' : filterPriceField === 'max' ? 'max' : 'med';

  return (
    <div className="d-flex flex-col gap-4 animate-fade-in">

      {/* ─── Data freshness (compact) ─── */}
      {dataFreshness && (
        <div className="d-flex items-center gap-2 flex-wrap" style={{ padding: '6px 12px', borderRadius: 8, background: dataFreshness.isStale ? 'rgba(245,158,11,0.08)' : 'rgba(0,214,143,0.06)', border: `1px solid ${dataFreshness.isStale ? 'rgba(245,158,11,0.2)' : 'rgba(0,214,143,0.15)'}` }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: dataFreshness.isStale ? '#f59e0b' : '#00d68f', flexShrink: 0 }} />
          <span className="text-xs fw-600" style={{ color: dataFreshness.isStale ? '#f59e0b' : '#00d68f' }}>
            {dataFreshness.isStale ? 'Stale' : 'Fresh'}
          </span>
          <span className="text-xs text-muted">
            {dataFreshness.total.toLocaleString()} listings · {dataFreshness.unique} pets
            {dataFreshness.hoursAgo !== null ? ` · ${dataFreshness.hoursAgo}h ago` : ''}
          </span>
        </div>
      )}

      {/* ─── Strategy picker ─── */}
      <div>
        <div className="section-header">Strategy</div>
        <div className="grid-strategies stagger-in">
          {Object.entries(STRATEGIES).map(([id, s]) => {
            const isActive = activeStrategy === id;
            return (
              <div key={id} onClick={() => switchStrategy(id)} role="button" tabIndex={0} aria-pressed={isActive}
                onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), switchStrategy(id))}
                className={`strategy-card ${isActive ? 'active' : ''}`}
                style={isActive ? { borderColor: s.color, boxShadow: `0 0 20px ${s.color}22, 0 4px 20px rgba(0,0,0,0.3)` } : undefined}>
                <div className="d-flex items-center gap-2">
                  <span className="text-2xl">{s.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="fw-700 text-md text-display" style={{ color: isActive ? s.color : 'var(--text)' }}>{s.label}</div>
                    <div className="text-xs text-muted leading-snug">{s.desc}</div>
                    {isActive && <div className="text-xs leading-snug mt-1" style={{ color: s.color, opacity: 0.7 }}>{s.detail}</div>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Filters ─── */}
      <div className="filter-panel">
        <div className="filter-panel-header" onClick={() => setShowAdvancedFilters(!showAdvancedFilters)} role="button" tabIndex={0} aria-expanded={showAdvancedFilters}
          onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setShowAdvancedFilters(!showAdvancedFilters))}>
          <div className="d-flex items-center gap-2">
            <span className="text-md fw-600 text-sub">Filters</span>
            <span className="text-sm" style={{ color: 'var(--accent2)' }}>{filtered.length} match</span>
            <span className="text-xs text-muted">/ {data?.recommendations?.length ?? 0} total</span>
            {config.blacklisted.length > 0 && <span className="pill pill-warn">{config.blacklisted.length} BL</span>}
          </div>
          <span className={`text-md text-muted animate-chevron${showAdvancedFilters ? ' open' : ''}`}>{'\u25BC'}</span>
        </div>
        {showAdvancedFilters && (
          <div className="filter-panel-body flex-col gap-3">
            <div className="grid-filters">
              <div>
                <label className="config-label">Price Col</label>
                <select className="select w-full" value={filterPriceField} onChange={e => setFilterPriceField(e.target.value as 'min' | 'med' | 'max')}>
                  <option value="min">Min</option>
                  <option value="med">Median</option>
                  <option value="max">Max</option>
                </select>
              </div>
              <div>
                <label className="config-label">From $ ({priceFieldLabel})</label>
                <input className="input" type="number" value={filterMinPrice} onChange={e => setFilterMinPrice(Math.max(0, parseFloat(e.target.value) || 0).toString())} min="0" step="0.5" />
              </div>
              <div>
                <label className="config-label">To $</label>
                <input className="input" type="number" value={filterMaxPrice} onChange={e => setFilterMaxPrice(Math.max(0, parseFloat(e.target.value) || 99999).toString())} min="0" />
              </div>
              <div>
                <label className="config-label">Min Listings</label>
                <input className="input" type="number" value={minListings} onChange={e => setMinListings(Math.max(1, parseInt(e.target.value) || 1).toString())} min="1" />
              </div>
              <div>
                <label className="config-label">Min Sold</label>
                <input className="input" type="number" value={minSold} onChange={e => setMinSold(Math.max(0, parseInt(e.target.value) || 0).toString())} min="0" />
              </div>
              <div>
                <label className="config-label">Max Items</label>
                <input className="input" type="number" value={maxItems} onChange={e => setMaxItems(Math.max(1, parseInt(e.target.value) || 100).toString())} min="1" />
              </div>
              <div>
                <label className="config-label">Rarity</label>
                <select className="select w-full" value={rarity} onChange={e => setRarity(e.target.value)}>
                  <option value="all">All</option>
                  {allRarities.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>

            {allRarities.length > 0 && (
              <div>
                <div className="d-flex justify-between items-center mb-1">
                  <span className="text-xs fw-600 text-sub">Exclude Rarities</span>
                  {excludedRarities.size > 0 && <button type="button" className="btn btn-sm" onClick={() => setExcludedRarities(new Set())} style={{ fontSize: '0.65rem' }}>Clear</button>}
                </div>
                <div className="d-flex flex-wrap gap-1">
                  {allRarities.map(r => (
                    <button key={r} type="button" className={`btn btn-sm ${excludedRarities.has(r) ? 'btn-danger' : ''}`}
                      onClick={() => setExcludedRarities(prev => { const next = new Set(prev); if (next.has(r)) next.delete(r); else next.add(r); return next; })}
                      aria-pressed={excludedRarities.has(r)} style={{ fontSize: '0.65rem', padding: '2px 6px' }}>
                      {excludedRarities.has(r) ? '\u2715 ' : ''}{r}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Blacklist */}
            <div>
              <div className="d-flex justify-between items-center mb-1">
                <span className="text-xs fw-600 text-red">Blacklist ({config.blacklisted.length})</span>
                {config.blacklisted.length > 0 && <button type="button" className="btn btn-sm" onClick={() => setConfig((c: Config) => ({ ...c, blacklisted: [] }))} style={{ fontSize: '0.65rem' }}>Clear All</button>}
              </div>
              <div className="d-flex gap-2 mb-1">
                <input className="input" placeholder="Add name..." value={blInput} onChange={e => setBlInput(e.target.value)} style={{ maxWidth: 180 }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { addToBlacklist(blInput); setBlInput(''); } }} />
                <button type="button" className="btn btn-sm" onClick={() => { addToBlacklist(blInput); setBlInput(''); }}>Add</button>
                <button type="button" className="btn btn-sm" onClick={importConfig}>Import</button>
              </div>
              {config.blacklisted.length > 0 && (
                <div className="d-flex flex-wrap gap-1" style={{ maxHeight: 80, overflow: 'auto' }}>
                  {config.blacklisted.map((name: string) => (
                    <div key={name} className="blacklist-chip">
                      <span className="text-red">{name}</span>
                      <button type="button" onClick={() => setConfig((c: Config) => ({ ...c, blacklisted: c.blacklisted.filter((n: string) => n !== name) }))} aria-label={`Remove ${name}`}>{'\u2715'}</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ─── Results ─── */}
      <div className="preview-container">
        {/* Header */}
        <div className="preview-header" style={{ background: strat?.gradient || undefined }}>
          <div className="d-flex items-center gap-2 flex-wrap">
            <span className="text-xl">{strat?.icon}</span>
            <span className="fw-700 text-lg" style={{ color: strat?.color || 'var(--text)' }}>{strat?.label}</span>
            <span className="text-sm text-sub">{displayResults.length}/{results.length} items</span>
          </div>
          <div className="d-flex gap-2 flex-wrap">
            <button type="button" className="btn-cta" onClick={generateAndDownload} disabled={displayResults.length === 0}>
              Download Config ({displayResults.length})
            </button>
            <button type="button" className="btn btn-sm" onClick={saveConfig} disabled={isSaving}>{isSaving ? 'Saving...' : 'Save to DB'}</button>
          </div>
        </div>

        {/* Summary bar */}
        {displayResults.length > 0 && (
          <div style={{ padding: '6px 14px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: '0.7rem', color: 'var(--text3)', alignItems: 'center' }}>
            <span><strong style={{ color: 'var(--gold)' }}>{summary.tierCounts.S}</strong>S</span>
            <span><strong style={{ color: 'var(--accent)' }}>{summary.tierCounts.A}</strong>A</span>
            <span><strong>{summary.tierCounts.B}</strong>B</span>
            <span style={{ opacity: 0.5 }}><strong>{summary.tierCounts.C + summary.tierCounts.D}</strong>C/D</span>
            <span style={{ borderLeft: '1px solid var(--border)', paddingLeft: 8 }}><strong className="text-green">{summary.premium}</strong> premium</span>
            <span><strong>{summary.mid}</strong> mid</span>
            <span><strong>{summary.cheap}</strong> budget</span>
            <span style={{ borderLeft: '1px solid var(--border)', paddingLeft: 8 }}><strong>{summary.totalSold}</strong> sold</span>
            {summary.mutOverrides > 0 && <span style={{ color: 'var(--cyan)' }}><strong>{summary.mutOverrides}</strong> mut overrides</span>}
            <span className="ml-auto fw-600" style={{ color: 'var(--green)' }}>${summary.totalValue.toFixed(0)} total value</span>
          </div>
        )}

        {/* Search + Quick filters */}
        <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)' }}>
          <div className="d-flex gap-2 items-center flex-wrap">
            <div style={{ position: 'relative', flex: '1 1 180px', maxWidth: 240 }}>
              <input className="input" placeholder="Search in results..." value={tableSearch} onChange={e => setTableSearch(e.target.value)}
                style={{ paddingLeft: 10, fontSize: 12, minHeight: 32 }} />
            </div>
            {/* Quick filter chips */}
            {([
              { key: 'hasSold' as QuickFilter, label: 'Has Sold', color: 'var(--green)' },
              { key: 'hasMutations' as QuickFilter, label: 'Has Mutations', color: 'var(--cyan)' },
              { key: 'tierS' as QuickFilter, label: 'S-Tier', color: 'var(--gold)' },
              { key: 'tierA' as QuickFilter, label: 'S+A Tier', color: 'var(--accent)' },
              { key: 'premium' as QuickFilter, label: '$20+', color: 'var(--green)' },
            ]).map(f => (
              <button key={f.key} type="button"
                className={`btn btn-sm ${quickFilters.has(f.key) ? '' : 'btn-ghost'}`}
                style={quickFilters.has(f.key) ? { borderColor: f.color, color: f.color, fontSize: '0.65rem', padding: '2px 8px' } : { fontSize: '0.65rem', padding: '2px 8px' }}
                onClick={() => toggleQuickFilter(f.key)}>
                {f.label}
              </button>
            ))}
            {(quickFilters.size > 0 || tableSearch) && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setQuickFilters(new Set()); setTableSearch(''); }} style={{ fontSize: '0.6rem', padding: '2px 6px' }}>Clear</button>
            )}
          </div>
        </div>

        {displayResults.length === 0 ? (
          <div className="empty-state">No items match your filters.</div>
        ) : (
          <div className="preview-body">
            {removedItems.size > 0 && (
              <div className="d-flex justify-between items-center" style={{ padding: '4px 12px', background: 'rgba(245,158,11,0.06)', borderRadius: 4, margin: '4px 8px' }}>
                <span className="text-xs text-muted">{removedItems.size} removed</span>
                <button type="button" className="btn btn-sm" onClick={() => setRemovedItems(new Set())} style={{ fontSize: '0.6rem', padding: '2px 6px' }}>Undo All</button>
              </div>
            )}
            <div className="table-wrap">
              <table className="dash-table" role="table">
                <thead><tr role="row">
                  <th className="w-30">#</th>
                  <th className="w-28"></th>
                  <th>Name</th>
                  <th>Tier</th>
                  <th>Rarity</th>
                  <th>Score</th>
                  <th>Med $</th>
                  <th>Min $</th>
                  <th>Listings</th>
                  <th>Sold</th>
                  <th>Muts</th>
                  <th>Pri</th>
                  <th>Gems</th>
                  <th></th>
                </tr></thead>
                <tbody role="rowgroup">
                  {displayResults.map((r: Recommendation, i: number) => {
                    if (!r?.name) return null;
                    const effectivePrice = Math.max(r.med ?? 0, getMaxMutationPrice(r));
                    const isPremium = effectivePrice >= PREMIUM_THRESHOLD;
                    const minVal = getMinValue(r);
                    const pri = computePriority(r);
                    const mutSummary = getMutationSummary(r);
                    const advisory = getMutationAdvisory(r, gemMode);
                    const mutCount = advisory.filter(a => a.needsOverride).length;
                    const isExpanded = expandedRow === r.name;

                    // Row background by tier
                    const rowBg = isPremium ? 'rgba(0,214,143,0.03)'
                      : (r.med ?? 0) >= 5 ? undefined
                      : 'rgba(255,255,255,0.005)';

                    return (
                      <React.Fragment key={`config-${r.name}`}>
                        <tr role="row" style={rowBg ? { background: rowBg } : undefined}
                          className={mutCount > 0 ? 'cursor-pointer' : ''}
                          onClick={mutCount > 0 ? () => setExpandedRow(isExpanded ? null : r.name) : undefined}>
                          <td className="text-muted text-mono">{i + 1}</td>
                          <td><ImageThumb src={r.imageUrl || ''} size={22} /></td>
                          <td className="fw-600">
                            {r.name}
                            {mutSummary.maxPrice >= PREMIUM_THRESHOLD && (r.med ?? 0) < PREMIUM_THRESHOLD && (
                              <span className="tag tag-warn ml-1" title={`${mutSummary.maxName} = $${mutSummary.maxPrice.toFixed(0)}`}>MUT$</span>
                            )}
                          </td>
                          <td><TierBadge tier={r.tier} /></td>
                          <td><RarityBadge rarity={r.rarity || ''} /></td>
                          <td className="text-mono text-xs" style={{ color: r.score >= 70 ? 'var(--gold)' : r.score >= 40 ? 'var(--text)' : 'var(--text3)' }}>{r.score}</td>
                          <td className="text-mono fw-600">{fmtPrice(r.med ?? 0)}</td>
                          <td className="text-green text-mono">{fmtPrice(r.min ?? 0)}</td>
                          <td className="text-muted">{r.listings ?? 0}</td>
                          <td style={{ color: (r.soldCount ?? 0) > 0 ? 'var(--accent2)' : 'var(--text3)' }}>{r.soldCount ?? 0}</td>
                          <td>
                            {mutCount > 0 ? (
                              <span className="text-mono text-xs" style={{ color: 'var(--cyan)' }} title="Click row to expand mutations">
                                {mutCount} {isExpanded ? '\u25B2' : '\u25BC'}
                              </span>
                            ) : (
                              <span className="text-muted text-xs">—</span>
                            )}
                          </td>
                          <td className="text-mono text-xs" style={{ color: pri <= 25 ? 'var(--green)' : pri <= 50 ? 'var(--gold)' : 'var(--text3)' }}>{pri}</td>
                          <td onClick={e => e.stopPropagation()}>
                            <select className="select text-mono text-accent fw-600" style={{ fontSize: '0.7rem', padding: '2px 4px', minWidth: 68, minHeight: 28 }}
                              value={minVal} aria-label={`Gem budget for ${r.name}`}
                              onChange={e => setMinValueOverrides(prev => ({ ...prev, [r.name]: parseInt(e.target.value) }))}>
                              {GEM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                              {!GEM_LABELS[minVal] && <option value={minVal}>{fmtMinValue(minVal)}</option>}
                            </select>
                          </td>
                          <td onClick={e => e.stopPropagation()}>
                            <button type="button" className="btn btn-sm" onClick={() => setRemovedItems(prev => new Set([...prev, r.name]))}
                              style={{ fontSize: '0.6rem', padding: '2px 5px', color: '#ff4757', minHeight: 24 }} title={`Remove ${r.name}`} aria-label={`Remove ${r.name}`}>{'\u2715'}</button>
                          </td>
                        </tr>
                        {/* Expanded mutation details */}
                        {isExpanded && mutCount > 0 && (
                          <tr className="animate-fade-in">
                            <td colSpan={14} style={{ padding: '0 12px 8px 44px', background: 'rgba(6,182,212,0.02)', borderBottom: '1px solid var(--border)' }}>
                              <div className="text-xs fw-600 text-muted mb-1" style={{ marginTop: 4 }}>Mutation Gem Budgets:</div>
                              <div className="d-flex flex-wrap gap-2">
                                {advisory.filter(a => a.needsOverride).map(a => (
                                  <div key={a.mutation} style={{ padding: '3px 8px', borderRadius: 6, background: 'var(--bg3)', border: '1px solid var(--border)', fontSize: 11 }}>
                                    <span className="fw-600" style={{ color: a.priceRatio >= 2 ? 'var(--gold)' : 'var(--cyan)' }}>{a.mutation}</span>
                                    <span className="text-muted ml-1">{fmtPrice(a.medianPrice)}</span>
                                    <span className="text-muted ml-1">·</span>
                                    <span className="text-accent fw-600 ml-1">{fmtMinValue(a.recommendedOverride)}</span>
                                    <span className="text-muted ml-1">· {a.listings}L</span>
                                    {a.priceRatio >= 1.5 && <span className="text-gold ml-1">({a.priceRatio}x)</span>}
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default React.memo(ConfigTab);
