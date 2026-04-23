'use client';

import React, { useState, useMemo } from 'react';
import type { Config, DashData, Recommendation, WLItem } from '../../lib/types';
import { fmtPrice, smartMinValue, downloadConfigJSON, getMutationAdvisory, getRarityWeight, computePriority } from '../../lib/utils';
import { RarityBadge, ImageThumb } from '../ui';

interface ConfigTabProps {
  data: DashData;
  config: Config;
  setConfig: (config: Config | ((c: Config) => Config)) => void;
  showToast: (msg: string) => void;
}

/* ─── Profit Score — unified value ranking ─── */
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

/* ─── Strategy Presets ─── */
const STRATEGIES: Record<string, {
  label: string; desc: string; icon: string; color: string; gradient: string;
  sort: (a: Recommendation, b: Recommendation) => number;
  diversified?: boolean;
  autoMaxPrice?: number;
  /** Use min price instead of median for gem budget (Farmer/Budget buy cheapest listings) */
  gemPrice?: (r: Recommendation) => number;
  /** Skip premium pinning — Budget/Farmer want ONLY cheap items */
  noPremiumPin?: boolean;
}> = {
  allstar: {
    label: 'All-Star', desc: 'Best overall value — balances price, demand, flip & rarity', icon: '\u2B50', color: '#ffc048', gradient: 'linear-gradient(135deg, #ffc04822, #ff880022)',
    sort: (a, b) => profitScore(b) - profitScore(a),
  },
  farmer: {
    label: 'Farmer', desc: 'High volume, proven demand, easy resell', icon: '\uD83C\uDF3E', color: '#00d68f', gradient: 'linear-gradient(135deg, #00d68f22, #00b37a22)',
    // Use p25 (25th percentile) — realistic cheap price, avoids outlier lowball listings
    // Raw min is often a $0.50 scam listing for a $5 med item → breaks gem tiers
    gemPrice: (r) => r.p25 ?? r.min ?? r.med ?? 0,
    noPremiumPin: true,
    sort: (a, b) => {
      const aScore = (a.farmScore || 0) * 3 + (a.soldCount || 0) * 2 + Math.min(a.listings ?? 0, 30) * 0.3 + ((a.med ?? 0) < 20 ? 5 : (a.med ?? 0) < 50 ? 3 : 0);
      const bScore = (b.farmScore || 0) * 3 + (b.soldCount || 0) * 2 + Math.min(b.listings ?? 0, 30) * 0.3 + ((b.med ?? 0) < 20 ? 5 : (b.med ?? 0) < 50 ? 3 : 0);
      return bScore - aScore;
    },
  },
  flipper: {
    label: 'Flipper', desc: 'Buy low sell high — max spread & ROI', icon: '\uD83D\uDCB0', color: '#45d0ff', gradient: 'linear-gradient(135deg, #45d0ff22, #0099cc22)',
    sort: (a, b) => {
      const aScore = (a.flipScore || 0) * 3 + (a.roiPct ?? 0) * 0.15 + (a.spreadScore || 0) * 2 + ((a.soldCount ?? 0) > 0 ? 5 : 0) + ((a.listings ?? 0) >= 3 ? 3 : 0);
      const bScore = (b.flipScore || 0) * 3 + (b.roiPct ?? 0) * 0.15 + (b.spreadScore || 0) * 2 + ((b.soldCount ?? 0) > 0 ? 5 : 0) + ((b.listings ?? 0) >= 3 ? 3 : 0);
      return bScore - aScore;
    },
  },
  sniper: {
    label: 'Sniper', desc: 'Scarce high-value items — underpriced gems', icon: '\uD83C\uDFAF', color: '#ff4757', gradient: 'linear-gradient(135deg, #ff475722, #cc000022)',
    sort: (a, b) => {
      const aPrice = Math.min(10, Math.log10((a.med ?? 0) + 1) * 3);
      const bPrice = Math.min(10, Math.log10((b.med ?? 0) + 1) * 3);
      const aScore = aPrice * 4 + (a.scarcityScore ?? 0) * 3 + (a.valueScore ?? 0) * 2 + ((a.soldCount ?? 0) > 0 ? 3 : 0);
      const bScore = bPrice * 4 + (b.scarcityScore ?? 0) * 3 + (b.valueScore ?? 0) * 2 + ((b.soldCount ?? 0) > 0 ? 3 : 0);
      return bScore - aScore;
    },
  },
  whale: {
    label: 'Whale', desc: 'Premium high-value items only — $10+ market', icon: '\uD83D\uDC0B', color: '#a78bfa', gradient: 'linear-gradient(135deg, #a78bfa22, #7c3aed22)',
    sort: (a, b) => {
      const aScore = (a.med ?? 0) * 1.0 + ((a.soldCount ?? 0) > 0 ? 10 : 0) + (a.sellerCount ?? 0) * 0.3;
      const bScore = (b.med ?? 0) * 1.0 + ((b.soldCount ?? 0) > 0 ? 10 : 0) + (b.sellerCount ?? 0) * 0.3;
      return bScore - aScore;
    },
  },
  trending: {
    label: 'Trending', desc: 'Hot items trending now — ride the wave', icon: '\uD83D\uDD25', color: '#ff6b35', gradient: 'linear-gradient(135deg, #ff6b3522, #cc440022)',
    sort: (a, b) => {
      const aScore = (a.trendingListings || 0) * 5 + (a.soldCount || 0) * 2 + (a.score ?? 0) * 0.3;
      const bScore = (b.trendingListings || 0) * 5 + (b.soldCount || 0) * 2 + (b.score ?? 0) * 0.3;
      return bScore - aScore;
    },
  },
  budget: {
    label: 'Budget', desc: 'Max value under $5 — high ROI for small capital', icon: '\uD83C\uDFF7\uFE0F', color: '#f59e0b', gradient: 'linear-gradient(135deg, #f59e0b22, #d9790022)',
    autoMaxPrice: 5,
    gemPrice: (r) => r.p25 ?? r.min ?? r.med ?? 0,
    noPremiumPin: true,
    sort: (a, b) => {
      const aPrice = Math.max(a.med ?? 0, 0.01);
      const bPrice = Math.max(b.med ?? 0, 0.01);
      const aVal = ((a.score ?? 0) / aPrice) * ((a.soldCount ?? 0) > 0 ? 2 : 1);
      const bVal = ((b.score ?? 0) / bPrice) * ((b.soldCount ?? 0) > 0 ? 2 : 1);
      return bVal - aVal;
    },
  },
  diversified: {
    label: 'Diversified', desc: 'Balanced portfolio across all rarities', icon: '\uD83C\uDFB2', color: '#06b6d4', gradient: 'linear-gradient(135deg, #06b6d422, #0891b222)',
    sort: (a, b) => profitScore(b) - profitScore(a),
    diversified: true,
  },
};

const PREMIUM_THRESHOLD = 50;

function ConfigTab({ data, config, setConfig, showToast }: ConfigTabProps) {
  const [activeStrategy, setActiveStrategy] = useState<string>('allstar');
  const [filterMinPrice, setFilterMinPrice] = useState('2');
  const [filterMaxPrice, setFilterMaxPrice] = useState('99999');
  const [filterPriceField, setFilterPriceField] = useState<'min' | 'med' | 'max'>('min');
  const [minListings, setMinListings] = useState('1');
  const [maxItems, setMaxItems] = useState('50');
  const [rarity, setRarity] = useState('all');
  const [excludedRarities, setExcludedRarities] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [blInput, setBlInput] = useState('');
  const [removedItems, setRemovedItems] = useState<Set<string>>(new Set());
  const [minValueOverrides, setMinValueOverrides] = useState<Record<string, number>>({});

  const strat = STRATEGIES[activeStrategy];

  const allRarities = useMemo(() => {
    if (!data?.recommendations) return [];
    const set = new Set<string>();
    data.recommendations.forEach((r: Recommendation) => { if (r?.rarity) set.add(r.rarity); });
    return Array.from(set).sort();
  }, [data]);

  /* ─── Filter recommendations ─── */
  const filtered = useMemo(() => {
    if (!data?.recommendations) return [];
    const lo = parseFloat(filterMinPrice) || 0;
    const userHi = parseFloat(filterMaxPrice) || 999999;
    const hi = strat?.autoMaxPrice ? Math.min(userHi, strat.autoMaxPrice) : userHi;
    const ml = parseInt(minListings) || 1;
    const bl = new Set(config.blacklisted.map((n: string) => n.toLowerCase()));
    const pf = filterPriceField;
    return data.recommendations.filter((r: Recommendation) => {
      if (!r || !r.name || bl.has(r.name.toLowerCase()) || r.name.toLowerCase() === 'other') return false;
      if (rarity !== 'all' && r.rarity !== rarity) return false;
      if (excludedRarities.has(r.rarity)) return false;
      const price = pf === 'min' ? (r.min ?? 0) : pf === 'max' ? (r.max ?? 0) : (r.med ?? 0);
      // Premium items ($50+) always pass price filters UNLESS strategy disables premium pinning
      if (!strat?.noPremiumPin && (r.med ?? 0) >= PREMIUM_THRESHOLD) {
        return (r.listings ?? 0) >= ml;
      }
      return price >= lo && price <= hi && (r.listings ?? 0) >= ml;
    });
  }, [data, filterMinPrice, filterMaxPrice, filterPriceField, minListings, rarity, excludedRarities, config.blacklisted, strat]);

  /* ─── Sort + cap results ─── */
  const results = useMemo(() => {
    const sortFn = strat?.sort || ((a: Recommendation, b: Recommendation) => b.score - a.score);
    const maxN = parseInt(maxItems) || 50;

    if (strat?.diversified) {
      const byRarity: Record<string, Recommendation[]> = {};
      for (const r of filtered) {
        if (!byRarity[r.rarity]) byRarity[r.rarity] = [];
        byRarity[r.rarity].push(r);
      }
      const result: Recommendation[] = [];
      const rarities = Object.keys(byRarity).sort((a, b) => getRarityWeight(a) - getRarityWeight(b));
      const totalWeight = rarities.reduce((sum, r) => sum + (11 - getRarityWeight(r)), 0);
      for (const rar of rarities) {
        const weight = 11 - getRarityWeight(rar);
        const slots = Math.max(2, Math.round((weight / Math.max(totalWeight, 1)) * maxN));
        byRarity[rar].sort(sortFn);
        result.push(...byRarity[rar].slice(0, slots));
      }
      const seen = new Set<string>();
      return result.filter(r => { if (seen.has(r.name)) return false; seen.add(r.name); return true; })
        .sort(sortFn).slice(0, maxN);
    }

    // Premium pinning: $50+ items at top (unless noPremiumPin)
    if (!strat?.noPremiumPin) {
      const premium = filtered.filter(r => (r.med ?? 0) >= PREMIUM_THRESHOLD);
      const pool = filtered.filter(r => (r.med ?? 0) < PREMIUM_THRESHOLD);
      premium.sort((a, b) => (b.med ?? 0) - (a.med ?? 0));
      pool.sort(sortFn);
      const seen = new Set<string>();
      const combined: Recommendation[] = [];
      for (const r of premium) { if (!seen.has(r.name)) { seen.add(r.name); combined.push(r); } }
      for (const r of pool) { if (combined.length >= maxN) break; if (!seen.has(r.name)) { seen.add(r.name); combined.push(r); } }
      return combined.slice(0, maxN);
    }

    // No premium pinning — just sort by strategy
    const sorted = [...filtered].sort(sortFn);
    const seen = new Set<string>();
    return sorted.filter(r => { if (seen.has(r.name)) return false; seen.add(r.name); return true; }).slice(0, maxN);
  }, [filtered, strat, maxItems]);

  /* ─── Display results (with user removals) ─── */
  const displayResults = useMemo(() => results.filter(r => !removedItems.has(r.name)), [results, removedItems]);

  /* ─── Strategy-aware min_value ─── */
  const getMinValue = (r: Recommendation) => {
    if (minValueOverrides[r.name] != null) return minValueOverrides[r.name];
    if (strat?.gemPrice) return smartMinValue(r, strat.gemPrice(r));
    return smartMinValue(r);
  };

  /* ─── Generate config + download ─── */
  const generateAndDownload = () => {
    const wl: WLItem[] = displayResults.map((r: Recommendation) => {
      if (!r?.name) return null as any;
      const item: WLItem = {
        pet_name: r.name,
        priority: computePriority(r),
        min_value: getMinValue(r),
      };
      const advisory = getMutationAdvisory(r);
      const overrides = advisory.filter(a => a?.needsOverride);
      if (overrides.length > 0) {
        item.mutations = {};
        for (const o of overrides) {
          if (o?.mutation && typeof o.recommendedOverride === 'number') {
            item.mutations[o.mutation] = o.recommendedOverride;
          }
        }
      }
      return item;
    }).filter((w: WLItem | null) => w !== null);

    const genConfig: Config = { whitelisted: wl, blacklisted: config.blacklisted, version: '1.0' };
    setConfig(genConfig);
    downloadConfigJSON(genConfig, showToast);
  };

  /* ─── Save to DB ─── */
  const saveConfig = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ whitelisted: config.whitelisted, blacklisted: config.blacklisted }),
      });
      const result = await res.json();
      if (res.ok && result.success) {
        showToast(`Saved ${result.whitelisted} items + ${result.blacklisted} blacklisted`);
      } else {
        showToast(`Save failed: ${result.error || 'unknown error'}`);
      }
    } catch { showToast('Save failed — network error'); }
    finally { setIsSaving(false); }
  };

  /* ─── Import JSON ─── */
  const importConfig = () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { showToast('File too large (max 5MB)'); return; }
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const imported = JSON.parse(ev.target?.result as string);
          if (!imported?.whitelisted || !Array.isArray(imported.whitelisted)) {
            showToast('Invalid config: missing whitelisted array'); return;
          }
          const wl: WLItem[] = imported.whitelisted.map((w: any, i: number) => {
            const pet_name = (w?.pet_name || w?.name || '').toString().trim();
            const priority = typeof w?.priority === 'number' ? w.priority : i;
            const min_value = typeof w?.min_value === 'number' && w.min_value > 0 ? w.min_value : 1000000;
            const item: WLItem = { pet_name, priority, min_value };
            if (w?.mutations && typeof w.mutations === 'object') {
              const muts: Record<string, number> = {};
              for (const [k, v] of Object.entries(w.mutations)) {
                if (typeof v === 'number' && v > 0) muts[k] = v;
              }
              if (Object.keys(muts).length > 0) item.mutations = muts;
            }
            return item;
          }).filter((w: WLItem) => w.pet_name.length > 0);
          const bl: string[] = Array.isArray(imported.blacklisted)
            ? imported.blacklisted.filter((b: unknown) => typeof b === 'string' && (b as string).trim().length > 0).map((b: string) => b.trim())
            : [];
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
    if (config.blacklisted.some((b: string) => b.toLowerCase() === trimmed.toLowerCase())) {
      showToast(`"${trimmed}" already blacklisted`); return;
    }
    setConfig((c: Config) => ({ ...c, blacklisted: [...c.blacklisted, trimmed] }));
  };

  const switchStrategy = (id: string) => {
    setActiveStrategy(id);
    setRemovedItems(new Set());
    setMinValueOverrides({});
  };

  /* ─── Data freshness ─── */
  const dataFreshness = useMemo(() => {
    if (!data?.meta) return null;
    const total = data.meta.totalListings || 0;
    const unique = data.meta.uniqueBrainrots || 0;
    const runs = data.meta.scrapeRuns || [];
    const lastCompleted = runs.find((r: any) => r.status === 'completed');
    const lastScrapeAt = lastCompleted?.completed_at || lastCompleted?.started_at || null;
    const hoursAgo = lastScrapeAt ? Math.floor((Date.now() - new Date(lastScrapeAt).getTime()) / 3600000) : null;
    const isStale = hoursAgo === null || hoursAgo > 24;
    return { total, unique, hoursAgo, isStale };
  }, [data]);

  return (
    <div className="d-flex flex-col gap-4">

      {/* ─── Data freshness ─── */}
      {dataFreshness && (
        <div style={{ padding: '8px 14px', borderRadius: 8, background: dataFreshness.isStale ? 'rgba(245, 158, 11, 0.1)' : 'rgba(0, 214, 143, 0.08)', border: `1px solid ${dataFreshness.isStale ? 'rgba(245, 158, 11, 0.3)' : 'rgba(0, 214, 143, 0.2)'}` }}>
          <div className="d-flex items-center gap-2">
            <div>
              <span className="text-sm fw-600" style={{ color: dataFreshness.isStale ? '#f59e0b' : '#00d68f' }}>
                {dataFreshness.isStale ? 'Data may be stale' : 'Data is fresh'}
              </span>
              <span className="text-xs text-muted" style={{ marginLeft: 8 }}>
                {dataFreshness.total.toLocaleString()} listings · {dataFreshness.unique} pets
                {dataFreshness.hoursAgo !== null ? ` · ${dataFreshness.hoursAgo}h ago` : ''}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ─── Strategy picker ─── */}
      <div>
        <div className="section-header">1. Pick a Strategy</div>
        <div className="grid-strategies stagger-in">
          {Object.entries(STRATEGIES).map(([id, s]) => {
            const isActive = activeStrategy === id;
            return (
              <div key={id} onClick={() => switchStrategy(id)} role="button" tabIndex={0} aria-pressed={isActive}
                onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), switchStrategy(id))}
                className={`strategy-card ${isActive ? 'active' : ''}`}
                style={{ background: isActive ? s.gradient : undefined, borderColor: isActive ? s.color : undefined }}>
                <div className="d-flex items-center gap-2">
                  <span className="text-2xl">{s.icon}</span>
                  <div>
                    <div className="fw-700 text-md text-display" style={{ color: isActive ? s.color : 'var(--text)' }}>{s.label}</div>
                    <div className="text-xs text-muted leading-snug">{s.desc}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Filters (collapsed) ─── */}
      <div className="filter-panel">
        <div className="filter-panel-header" onClick={() => setShowFilters(!showFilters)} role="button" tabIndex={0} aria-expanded={showFilters}
          onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setShowFilters(!showFilters))}>
          <div className="d-flex items-center gap-2">
            <span className="text-md fw-600 text-sub">Filters</span>
            <span className="text-sm text-muted">{filtered.length} pets match</span>
            {config.blacklisted.length > 0 && <span className="pill pill-warn">{config.blacklisted.length} blacklisted</span>}
          </div>
          <span className={`text-md text-muted animate-chevron${showFilters ? ' open' : ''}`}>{'\u25BC'}</span>
        </div>
        {showFilters && (
          <div className="filter-panel-body flex-col gap-3">
            <div className="grid-filters">
              <div>
                <label className="config-label">Filter By</label>
                <select className="select w-full" value={filterPriceField} onChange={e => setFilterPriceField(e.target.value as 'min' | 'med' | 'max')}>
                  <option value="min">Min Price</option>
                  <option value="med">Median Price</option>
                  <option value="max">Max Price</option>
                </select>
              </div>
              <div>
                <label className="config-label">Min $ ({filterPriceField === 'min' ? 'Min' : filterPriceField === 'med' ? 'Med' : 'Max'})</label>
                <input className="input" type="number" value={filterMinPrice} onChange={e => setFilterMinPrice(Math.max(0, parseFloat(e.target.value) || 0).toString())} min="0" />
              </div>
              <div>
                <label className="config-label">Max $ ({filterPriceField === 'min' ? 'Min' : filterPriceField === 'med' ? 'Med' : 'Max'})</label>
                <input className="input" type="number" value={filterMaxPrice} onChange={e => setFilterMaxPrice(Math.max(0, parseFloat(e.target.value) || 99999).toString())} min="0" />
              </div>
              <div>
                <label className="config-label">Min Listings</label>
                <input className="input" type="number" value={minListings} onChange={e => setMinListings(Math.max(1, parseInt(e.target.value) || 1).toString())} min="1" />
              </div>
              <div>
                <label className="config-label">Max Items</label>
                <input className="input" type="number" value={maxItems} onChange={e => setMaxItems(Math.max(1, parseInt(e.target.value) || 50).toString())} min="1" />
              </div>
              <div>
                <label className="config-label">Rarity</label>
                <select className="select w-full" value={rarity} onChange={e => setRarity(e.target.value)}>
                  <option value="all">All Rarities</option>
                  {allRarities.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>

            {/* Exclude Rarities */}
            {allRarities.length > 0 && (
              <div>
                <div className="d-flex justify-between items-center mb-2">
                  <span className="text-sm fw-600 text-sub">Exclude Rarities</span>
                  {excludedRarities.size > 0 && <button type="button" className="btn btn-sm" onClick={() => setExcludedRarities(new Set())}>Clear</button>}
                </div>
                <div className="d-flex flex-wrap gap-1">
                  {allRarities.map(r => (
                    <button key={r} type="button" className={`btn btn-sm ${excludedRarities.has(r) ? 'btn-danger' : ''}`}
                      onClick={() => setExcludedRarities(prev => { const next = new Set(prev); if (next.has(r)) next.delete(r); else next.add(r); return next; })}
                      aria-pressed={excludedRarities.has(r)}>
                      {excludedRarities.has(r) ? '\u2715 ' : ''}{r}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Blacklist */}
            <div>
              <div className="d-flex justify-between items-center mb-2">
                <span className="text-sm fw-600 text-red">Blacklist</span>
                {config.blacklisted.length > 0 && <button type="button" className="btn btn-sm" onClick={() => setConfig((c: Config) => ({ ...c, blacklisted: [] }))}>Clear</button>}
              </div>
              <div className="d-flex gap-2 mb-2">
                <input className="input max-w-200" placeholder="Add name..." value={blInput} onChange={e => setBlInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { addToBlacklist(blInput); setBlInput(''); } }} />
                <button type="button" className="btn btn-sm" onClick={() => { addToBlacklist(blInput); setBlInput(''); }}>Add</button>
              </div>
              {config.blacklisted.length > 0 && (
                <div className="d-flex flex-wrap gap-1">
                  {config.blacklisted.map((name: string) => (
                    <div key={name} className="blacklist-chip">
                      <span className="text-red">{name}</span>
                      <button type="button" onClick={() => setConfig((c: Config) => ({ ...c, blacklisted: c.blacklisted.filter((n: string) => n !== name) }))} aria-label={`Remove ${name}`}>{'\u2715'}</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="d-flex gap-2">
              <button type="button" className="btn btn-sm" onClick={importConfig}>Import JSON</button>
            </div>
          </div>
        )}
      </div>

      {/* ─── Results table + download ─── */}
      <div className="preview-container">
        <div className="preview-header" style={{ background: strat?.gradient || undefined }}>
          <div className="d-flex items-center gap-2 flex-wrap">
            <span className="text-xl">{strat?.icon}</span>
            <span className="fw-700 text-lg" style={{ color: strat?.color || 'var(--text)' }}>{strat?.label}</span>
            <span className="text-md text-sub">{displayResults.length} items</span>
          </div>
          <div className="d-flex gap-2 flex-wrap">
            <button type="button" className="btn-cta" onClick={generateAndDownload} disabled={displayResults.length === 0}>
              Download Config
            </button>
            <button type="button" className="btn btn-sm" onClick={saveConfig} disabled={isSaving}>{isSaving ? 'Saving...' : 'Save to DB'}</button>
          </div>
        </div>

        {displayResults.length === 0 ? (
          <div className="empty-state">No items match your filters.</div>
        ) : (
          <div className="preview-body">
            {removedItems.size > 0 && (
              <div className="d-flex justify-between items-center" style={{ padding: '6px 12px', background: 'rgba(245, 158, 11, 0.08)', borderRadius: 6, marginBottom: 8 }}>
                <span className="text-xs text-muted">{removedItems.size} removed</span>
                <button type="button" className="btn btn-sm" onClick={() => setRemovedItems(new Set())} style={{ fontSize: '0.7rem' }}>Undo All</button>
              </div>
            )}
            <div className="table-wrap">
              <table className="dash-table" role="table">
                <thead><tr role="row">
                  <th className="w-30" role="columnheader">#</th>
                  <th className="w-28"></th>
                  <th>Name</th><th>Rarity</th>
                  <th>Min $</th><th>Med $</th><th>Max $</th><th>Sold</th><th>Gems</th><th></th>
                </tr></thead>
                <tbody role="rowgroup">
                  {displayResults.map((r: Recommendation, i: number) => {
                    if (!r?.name) return null;
                    return (
                      <tr key={`config-${r.name}`} role="row">
                        <td className="text-muted text-mono">{i + 1}</td>
                        <td><ImageThumb src={r.imageUrl || ''} size={22} /></td>
                        <td className="fw-600">{r.name}</td>
                        <td><RarityBadge rarity={r.rarity || ''} /></td>
                        <td className="text-green text-mono">{fmtPrice(r.min ?? 0)}</td>
                        <td className="text-mono">{fmtPrice(r.med ?? 0)}</td>
                        <td className="text-red text-mono">{fmtPrice(r.max ?? 0)}</td>
                        <td className="text-muted">{r.soldCount ?? 0}</td>
                        <td>
                          <select className="select text-mono text-accent fw-600" style={{ fontSize: '0.75rem', padding: '2px 4px', minWidth: 80 }}
                            value={getMinValue(r)} aria-label={`Gem budget for ${r.name}`}
                            onChange={e => setMinValueOverrides(prev => ({ ...prev, [r.name]: parseInt(e.target.value) }))}>
                            <option value={1000000}>1M</option>
                            <option value={50000000}>50M</option>
                            <option value={100000000}>100M</option>
                            <option value={300000000}>300M</option>
                            <option value={500000000}>500M</option>
                            <option value={1000000000}>1B</option>
                            <option value={1500000000}>1.5B</option>
                            <option value={2000000000}>2B</option>
                          </select>
                        </td>
                        <td>
                          <button type="button" className="btn btn-sm" onClick={() => setRemovedItems(prev => new Set([...prev, r.name]))}
                            style={{ fontSize: '0.65rem', padding: '2px 6px', color: '#ff4757' }} title={`Remove ${r.name}`} aria-label={`Remove ${r.name} from config`}>{'\u2715'}</button>
                        </td>
                      </tr>
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
