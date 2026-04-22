'use client';

import React, { useState, useMemo } from 'react';
import type { Config, DashData, MutationAdvisory, Recommendation, BrainrotCombo, WLItem } from '../../lib/types';
import { fmtPrice, fmtMinValue, smartMinValue, downloadConfigJSON, getMutationAdvisory, getRarityWeight, masterSort, computePriority } from '../../lib/utils';
import { StatCard, TierBadge, RarityBadge, ImageThumb } from '../ui';

interface ConfigTabProps {
  data: DashData;
  config: Config;
  setConfig: (config: Config | ((c: Config) => Config)) => void;
  showToast: (msg: string) => void;
}

/* ─── Profit Score — combines ACTUAL VALUE, flip potential, and demand ─── */
/* Price is the dominant signal — a $500 item always outscores a $1 item    */
/* regardless of rarity name. Rarity is only a minor tiebreaker.            */
function profitScore(r: Recommendation): number {
  if (!r) return 0;
  // Price is primary signal (0-15): log10 scales well across $1-$10000 range
  const priceSignal = r.med > 0 ? Math.min(15, Math.log10(r.med + 1) * 4) : 0;
  const flip = r.flipScore ?? 0;
  const farm = r.farmScore ?? 0;
  const demand = r.soldCount > 0 ? Math.min(5, Math.log2(r.soldCount + 1)) : 0;
  const baseScore = r.score ?? 0;
  // Rarity is a minor tiebreaker (0-3), NOT the dominant factor
  const rarityTiebreak = Math.max(0, 10 - getRarityWeight(r.rarity)) * 0.3;
  const score = priceSignal * 3 + flip * 1.5 + farm * 1 + demand * 2 + rarityTiebreak + baseScore * 0.3;
  return isFinite(score) ? score : 0;
}

/* ─── Strategy Presets — each optimized for a specific money-making approach ─── */
const STRATEGIES: Record<string, {
  label: string; desc: string; icon: string; color: string; gradient: string;
  sort: (a: Recommendation, b: Recommendation) => number;
  diversified?: boolean;
  /** When true, strategy sort is primary — masterSort (rarity-first) is NOT applied */
  bypassMasterSort?: boolean;
  /** When set, auto-filters items to this max median price */
  autoMaxPrice?: number;
  filterHint?: string;
}> = {
  allstar: {
    label: 'All-Star', desc: 'Maximum profit — rarity + demand + flip potential', icon: '\u2B50', color: '#ffc048', gradient: 'linear-gradient(135deg, #ffc04822, #ff880022)',
    sort: (a: Recommendation, b: Recommendation) => profitScore(b) - profitScore(a),
    filterHint: 'Best overall money-makers',
  },
  farmer: {
    label: 'Farmer', desc: 'High volume, proven demand, easy resell', icon: '\uD83C\uDF3E', color: '#00d68f', gradient: 'linear-gradient(135deg, #00d68f22, #00b37a22)',
    bypassMasterSort: true,
    sort: (a: Recommendation, b: Recommendation) => {
      // Farmers want: proven sold history + enough supply + not too expensive
      // farmScore heavily weighted, price tier bonus, rarity as minor tiebreaker only
      const rarityA = Math.max(0, 10 - getRarityWeight(a.rarity)) * 0.5;
      const rarityB = Math.max(0, 10 - getRarityWeight(b.rarity)) * 0.5;
      const aScore = (a.farmScore || 0) * 3 + (a.soldCount || 0) * 2 + Math.min(a.listings ?? 0, 30) * 0.3 + ((a.med ?? 0) < 20 ? 5 : (a.med ?? 0) < 50 ? 3 : 0) + rarityA;
      const bScore = (b.farmScore || 0) * 3 + (b.soldCount || 0) * 2 + Math.min(b.listings ?? 0, 30) * 0.3 + ((b.med ?? 0) < 20 ? 5 : (b.med ?? 0) < 50 ? 3 : 0) + rarityB;
      return bScore - aScore;
    },
    filterHint: 'Focus on proven sellers with volume',
  },
  flipper: {
    label: 'Flipper', desc: 'Buy low sell high — max spread & ROI', icon: '\uD83D\uDCB0', color: '#45d0ff', gradient: 'linear-gradient(135deg, #45d0ff22, #0099cc22)',
    bypassMasterSort: true,
    sort: (a: Recommendation, b: Recommendation) => {
      // Flippers want: big price spread + proven ability to sell higher + liquidity
      // flipScore & spreadScore primary, rarity as minor tiebreaker only
      const rarityA = Math.max(0, 10 - getRarityWeight(a.rarity)) * 0.3;
      const rarityB = Math.max(0, 10 - getRarityWeight(b.rarity)) * 0.3;
      const aScore = (a.flipScore || 0) * 3 + (a.roiPct ?? 0) * 0.15 + (a.spreadScore || 0) * 2 + ((a.soldCount ?? 0) > 0 ? 5 : 0) + ((a.listings ?? 0) >= 3 ? 3 : 0) + rarityA;
      const bScore = (b.flipScore || 0) * 3 + (b.roiPct ?? 0) * 0.15 + (b.spreadScore || 0) * 2 + ((b.soldCount ?? 0) > 0 ? 5 : 0) + ((b.listings ?? 0) >= 3 ? 3 : 0) + rarityB;
      return bScore - aScore;
    },
    filterHint: 'Look for underpriced listings to flip',
  },
  sniper: {
    label: 'Sniper', desc: 'Scarce high-value items — underpriced gems', icon: '\uD83C\uDFAF', color: '#ff4757', gradient: 'linear-gradient(135deg, #ff475722, #cc000022)',
    sort: (a: Recommendation, b: Recommendation) => {
      // Snipers want: high value + few listings (scarcity) + rarity as bonus
      // Price is primary — a scarce $500 item beats a scarce $1 item
      const aPrice = Math.min(10, Math.log10((a.med ?? 0) + 1) * 3);
      const bPrice = Math.min(10, Math.log10((b.med ?? 0) + 1) * 3);
      const rarityA = Math.max(0, 10 - getRarityWeight(a.rarity)) * 0.3;
      const rarityB = Math.max(0, 10 - getRarityWeight(b.rarity)) * 0.3;
      const aScore = aPrice * 4 + (a.scarcityScore ?? 0) * 3 + (a.valueScore ?? 0) * 2 + ((a.soldCount ?? 0) > 0 ? 3 : 0) + rarityA;
      const bScore = bPrice * 4 + (b.scarcityScore ?? 0) * 3 + (b.valueScore ?? 0) * 2 + ((b.soldCount ?? 0) > 0 ? 3 : 0) + rarityB;
      return bScore - aScore;
    },
    filterHint: 'Auto-targets scarce high-value items',
  },
  whale: {
    label: 'Whale', desc: 'Premium high-value items only — $10+ market', icon: '\uD83D\uDC0B', color: '#a78bfa', gradient: 'linear-gradient(135deg, #a78bfa22, #7c3aed22)',
    autoMaxPrice: undefined,
    sort: (a: Recommendation, b: Recommendation) => {
      // Whales want: highest value items period. Price is THE signal.
      // Rarity is a minor bonus, not the driver.
      const rarityA = Math.max(0, 10 - getRarityWeight(a.rarity)) * 0.3;
      const rarityB = Math.max(0, 10 - getRarityWeight(b.rarity)) * 0.3;
      const aScore = (a.med ?? 0) * 1.0 + ((a.soldCount ?? 0) > 0 ? 10 : 0) + (a.sellerCount ?? 0) * 0.3 + rarityA;
      const bScore = (b.med ?? 0) * 1.0 + ((b.soldCount ?? 0) > 0 ? 10 : 0) + (b.sellerCount ?? 0) * 0.3 + rarityB;
      return bScore - aScore;
    },
    filterHint: 'Focus on $10+ premium items',
  },
  trending: {
    label: 'Trending', desc: 'Hot items trending now — ride the wave', icon: '\uD83D\uDD25', color: '#ff6b35', gradient: 'linear-gradient(135deg, #ff6b3522, #cc440022)',
    bypassMasterSort: true,
    sort: (a: Recommendation, b: Recommendation) => {
      // Trending: trendingListings is primary signal — rarity irrelevant, what's hot is hot
      const aScore = (a.trendingListings || 0) * 5 + (a.soldCount || 0) * 2 + (a.score ?? 0) * 0.3;
      const bScore = (b.trendingListings || 0) * 5 + (b.soldCount || 0) * 2 + (b.score ?? 0) * 0.3;
      return bScore - aScore;
    },
    filterHint: 'Currently trending on marketplace',
  },
  budget: {
    label: 'Budget', desc: 'Max value under $5 — high ROI for small capital', icon: '\uD83C\uDFF7\uFE0F', color: '#f59e0b', gradient: 'linear-gradient(135deg, #f59e0b22, #d9790022)',
    bypassMasterSort: true,
    autoMaxPrice: 5,
    sort: (a: Recommendation, b: Recommendation) => {
      // Budget: value efficiency (score/price) is primary, rarity irrelevant
      // Guard against zero/negative prices
      const aPrice = Math.max(a.med ?? 0, 0.01);
      const bPrice = Math.max(b.med ?? 0, 0.01);
      const aVal = ((a.score ?? 0) / aPrice) * ((a.soldCount ?? 0) > 0 ? 2 : 1);
      const bVal = ((b.score ?? 0) / bPrice) * ((b.soldCount ?? 0) > 0 ? 2 : 1);
      return bVal - aVal;
    },
    filterHint: 'Auto-filters to items under $5',
  },
  diversified: {
    label: 'Diversified', desc: 'Balanced portfolio across all rarities', icon: '\uD83C\uDFB2', color: '#06b6d4', gradient: 'linear-gradient(135deg, #06b6d422, #0891b222)',
    sort: (a: Recommendation, b: Recommendation) => profitScore(b) - profitScore(a),
    diversified: true,
    filterHint: 'Auto-picks best from each rarity tier',
  },
};

function ConfigTab({ data, config, setConfig, showToast }: ConfigTabProps) {
  const [activeStrategy, setActiveStrategy] = useState<string>('allstar');
  const [minPrice, setMinPrice] = useState('2');
  const [maxPrice, setMaxPrice] = useState('99999');
  const [minListings, setMinListings] = useState('1');
  const [maxItems, setMaxItems] = useState('50');
  const [rarity, setRarity] = useState('all');
  const [excludedRarities, setExcludedRarities] = useState<Set<string>>(new Set());
  const [generated, setGenerated] = useState<Recommendation[] | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [blInput, setBlInput] = useState('');

  const allRarities = useMemo(() => {
    if (!data?.recommendations) return [];
    const set = new Set<string>();
    data.recommendations.forEach((r: Recommendation) => { if (r?.rarity) set.add(r.rarity); });
    return Array.from(set).sort();
  }, [data]);

  /* Global filter applied to ALL strategies — also applies autoMaxPrice from strategy */
  const filtered = useMemo(() => {
    if (!data?.recommendations) return [];
    const strat = STRATEGIES[activeStrategy];
    const lo = parseFloat(minPrice) || 0;
    // Strategy autoMaxPrice caps the user's maxPrice (e.g. Budget auto-caps at $5)
    const userHi = parseFloat(maxPrice) || 999999;
    const hi = strat?.autoMaxPrice ? Math.min(userHi, strat.autoMaxPrice) : userHi;
    const ml = parseInt(minListings) || 1;
    const bl = new Set(config.blacklisted.map((n: string) => n.toLowerCase()));
    return data.recommendations.filter((r: Recommendation) =>
      r && r.name &&
      (r.med ?? 0) >= lo && (r.med ?? 0) <= hi && (r.listings ?? 0) >= ml &&
      (rarity === 'all' || r.rarity === rarity) &&
      !excludedRarities.has(r.rarity) &&
      !bl.has(r.name.toLowerCase())
    );
  }, [data, minPrice, maxPrice, minListings, rarity, excludedRarities, config.blacklisted, activeStrategy]);

  /* Apply sorting — masterSort (rarity→sold→strategy) for rarity-first strategies,
     or pure strategy sort for bypassMasterSort strategies */
  const results = useMemo(() => {
    const strat = STRATEGIES[activeStrategy];
    const stratSort = strat?.sort || ((a: Recommendation, b: Recommendation) => b.score - a.score);
    const maxN = parseInt(maxItems) || 50;
    const sortFn = strat?.bypassMasterSort
      ? stratSort
      : (a: Recommendation, b: Recommendation) => masterSort(a, b, stratSort);

    if (strat?.diversified) {
      // Diversified: weighted allocation — rarer tiers get proportionally more slots
      const byRarity: Record<string, Recommendation[]> = {};
      for (const r of filtered) {
        if (!byRarity[r.rarity]) byRarity[r.rarity] = [];
        byRarity[r.rarity].push(r);
      }
      const result: Recommendation[] = [];
      const rarities = Object.keys(byRarity).sort((a, b) => getRarityWeight(a) - getRarityWeight(b));

      // Weight allocation: rarer tiers (lower weight) get more slots
      // OG(w=0)→11pts, BrainrotGod(w=1)→10pts, ..., Common(w=10)→1pt
      const totalWeight = rarities.reduce((sum, r) => sum + (11 - getRarityWeight(r)), 0);
      for (const rar of rarities) {
        const weight = 11 - getRarityWeight(rar);
        const slots = Math.max(2, Math.round((weight / Math.max(totalWeight, 1)) * maxN));
        byRarity[rar].sort((a, b) => masterSort(a, b, stratSort));
        result.push(...byRarity[rar].slice(0, slots));
      }
      // Dedupe (in case of overlap) and final sort
      const seen = new Set<string>();
      const deduped = result.filter(r => {
        if (seen.has(r.name)) return false;
        seen.add(r.name);
        return true;
      });
      return deduped.sort((a, b) => masterSort(a, b, stratSort)).slice(0, maxN);
    }

    return [...filtered].sort(sortFn).slice(0, maxN);
  }, [filtered, activeStrategy, maxItems]);

  /* Build config from results and immediately download */
  const generateAndDownload = () => {
    const wl: WLItem[] = results.map((r: Recommendation) => {
      if (!r?.name) return null as any;
      const item: WLItem = {
        pet_name: r.name,
        priority: computePriority(r),
        min_value: smartMinValue(r),
      };
      // Compute mutation overrides for this pet
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
    const genConfig: Config = {
      whitelisted: wl,
      blacklisted: config.blacklisted,
      version: '1.0',
    };
    setGenerated(results);
    setConfig(genConfig);
    downloadConfigJSON(genConfig, showToast, data.recommendations);
  };

  /* Save to DB */
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
    } catch { showToast('Save failed \u2014 network error'); }
    finally { setIsSaving(false); }
  };

  const importConfig = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e: Event) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        showToast('File too large (max 5MB)');
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const imported = JSON.parse(ev.target?.result as string);
          if (!imported || typeof imported !== 'object') {
            showToast('Invalid config: not a valid JSON object');
            return;
          }
          if (!imported.whitelisted || !Array.isArray(imported.whitelisted)) {
            showToast('Invalid config: missing whitelisted array');
            return;
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
          setConfig({ whitelisted: wl, blacklisted: bl, version: typeof imported.version === 'string' ? imported.version : '1.0' });
          showToast(`Imported ${wl.length} items from config`);
        } catch (e) { showToast('Failed to parse config file: ' + (e instanceof Error ? e.message : 'unknown error')); }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const addToBlacklist = (name: string) => {
    if (!name || typeof name !== 'string') return;
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    if (config.blacklisted.some((b: string) => b.toLowerCase() === trimmed.toLowerCase())) {
      showToast(`"${trimmed}" is already blacklisted`);
      return;
    }
    setConfig((c: Config) => ({ ...c, blacklisted: [...c.blacklisted, trimmed] }));
    showToast(`Blacklisted "${trimmed}"`);
  };

  const strat = STRATEGIES[activeStrategy];

  // Pre-compute advisories for all results (avoids recalculating per-row in render)
  const advisoryMap = useMemo(() => {
    const map = new Map<string, MutationAdvisory[]>();
    for (const r of results) {
      map.set(r.name, getMutationAdvisory(r));
    }
    return map;
  }, [results]);

  const totalOverrides = useMemo(() => {
    let count = 0;
    for (const advisories of advisoryMap.values()) {
      count += advisories.filter(a => a.needsOverride).length;
    }
    return count;
  }, [advisoryMap]);

  // Validation summary — explains what the config generator did and why
  const configSummary = useMemo(() => {
    if (results.length === 0) return null;
    const rarityGroups: Record<string, number> = {};
    let noSoldData = 0;
    let noListings = 0;
    let premiumAutoIncluded = 0;
    const premiumRarities = new Set(['OG', 'Admin', 'Brainrot God']);

    for (const r of results) {
      const rar = r.rarity || 'Unknown';
      rarityGroups[rar] = (rarityGroups[rar] || 0) + 1;
      if ((r.soldCount ?? 0) === 0) noSoldData++;
      if ((r.listings ?? 0) === 0) noListings++;
      if (premiumRarities.has(rar)) premiumAutoIncluded++;
    }

    const sortedRarities = Object.entries(rarityGroups)
      .sort(([a], [b]) => getRarityWeight(a) - getRarityWeight(b));

    const hints: string[] = [];
    if (premiumAutoIncluded > 0) hints.push(`${premiumAutoIncluded} premium rarity items (always worth sniping)`);
    if (noSoldData > 0) hints.push(`${noSoldData} items with no sold history (priority based on rarity + listings)`);
    if (noListings > 0) hints.push(`${noListings} items with no active listings (may be delisted)`);
    if (strat?.autoMaxPrice) hints.push(`Auto-filtered to items under $${strat.autoMaxPrice}`);
    if (strat?.bypassMasterSort) hints.push('Sorted by strategy score (rarity is a minor factor)');
    else hints.push('Sorted by rarity first, then strategy score within each tier');

    return { sortedRarities, hints };
  }, [results, strat]);

  // Data quality check — warn if dataset looks incomplete
  const dataQuality = useMemo(() => {
    if (!data?.meta) return null;
    const total = data.meta.totalListings || 0;
    const unique = data.meta.uniqueBrainrots || 0;
    const combos = data.meta.uniqueCombos || 0;
    // Use real marketplace total from latest completed scrape run, fallback to 65k estimate
    const runs = data.meta.scrapeRuns || [];
    const lastCompleted = runs.find((r: any) => r.status === 'completed' && r.marketplaceTotal > 0);
    const marketSize = lastCompleted?.marketplaceTotal || 65000;
    const coverage = total > 0 && marketSize > 0 ? Math.round((total / marketSize) * 100) : 0;
    const isLow = coverage < 80;
    return { total, unique, combos, coverage, isLow, marketSize };
  }, [data]);

  return (
    <div className="d-flex flex-col gap-4">

      {/* ──── Data quality warning ──── */}
      {dataQuality?.isLow && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
          <div className="d-flex items-center gap-2">
            <span className="text-lg">{'\u26A0\uFE0F'}</span>
            <div>
              <div className="text-sm fw-600" style={{ color: '#f59e0b' }}>Limited Data Coverage ({dataQuality.coverage}%)</div>
              <div className="text-xs text-muted">
                {dataQuality.total.toLocaleString()} of ~{(dataQuality.marketSize / 1000).toFixed(0)}k listings scraped ({dataQuality.unique} unique pets, {dataQuality.combos} combos).
                Min prices and recommendations may be inaccurate. Run a fresh scrape for complete data.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ──── Step 1: Pick Strategy (primary action) ──── */}
      <div>
        <div className="section-header">1. Pick a Strategy</div>
        <div className="grid-strategies stagger-in">
          {Object.entries(STRATEGIES).map(([id, s]) => {
            const isActive = activeStrategy === id;
            return (
              <div key={id} onClick={() => setActiveStrategy(id)} role="button" tabIndex={0} aria-pressed={isActive} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setActiveStrategy(id))}
                className={`strategy-card ${isActive ? 'active' : ''}`}
                style={{
                  background: isActive ? s.gradient : undefined,
                  borderColor: isActive ? s.color : undefined,
                }}>
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

      {/* ──── Filters (collapsed by default) ──── */}
      <div className="filter-panel">
        <div className="filter-panel-header" onClick={() => setShowFilters(!showFilters)}>
          <div className="d-flex items-center gap-2">
            <span className="text-md fw-600 text-sub">Filters & Options</span>
            <span className="text-sm text-muted">{filtered.length} pets match</span>
            {excludedRarities.size > 0 && <span className="pill pill-warn">{excludedRarities.size} rarity excluded</span>}
            {config.blacklisted.length > 0 && <span className="pill pill-warn">{config.blacklisted.length} blacklisted</span>}
          </div>
          <span className={`text-md text-muted animate-chevron${showFilters ? ' open' : ''}`}>{'\u25BC'}</span>
        </div>
        {showFilters && (
          <div className="filter-panel-body flex-col gap-3">
            <div className="grid-filters">
              <div>
                <label className="config-label">Min Median ($)</label>
                <input className="input" type="number" value={minPrice} onChange={e => setMinPrice(Math.max(0, parseFloat(e.target.value) || 0).toString())} placeholder="0" min="0" />
              </div>
              <div>
                <label className="config-label">Max Median ($)</label>
                <input className="input" type="number" value={maxPrice} onChange={e => setMaxPrice(Math.max(0, parseFloat(e.target.value) || 99999).toString())} placeholder="99999" min="0" />
              </div>
              <div>
                <label className="config-label">Min Listings</label>
                <input className="input" type="number" value={minListings} onChange={e => setMinListings(Math.max(1, parseInt(e.target.value) || 1).toString())} placeholder="1" min="1" />
              </div>
              <div>
                <label className="config-label">Rarity</label>
                <select className="select w-full" value={rarity} onChange={e => setRarity(e.target.value)}>
                  <option value="all">All Rarities</option>
                  {allRarities.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="config-label">Max Items</label>
                <input className="input" type="number" value={maxItems} onChange={e => setMaxItems(Math.max(1, parseInt(e.target.value) || 50).toString())} placeholder="50" min="1" />
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
                  {allRarities.map(r => {
                    const isExcluded = excludedRarities.has(r);
                    return (
                      <button key={r} type="button"
                        className={`btn btn-sm ${isExcluded ? 'btn-danger' : ''}`}
                        onClick={() => {
                          setExcludedRarities(prev => {
                            const next = new Set(prev);
                            if (next.has(r)) next.delete(r); else next.add(r);
                            return next;
                          });
                        }}
                        aria-pressed={isExcluded}
                      >
                        {isExcluded ? '\u2715 ' : ''}{r}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Blacklist inline */}
            <div>
              <div className="d-flex justify-between items-center mb-2">
                <span className="text-sm fw-600 text-red">Blacklist</span>
                {config.blacklisted.length > 0 && <button type="button" className="btn btn-sm" onClick={() => setConfig((c: Config) => ({ ...c, blacklisted: [] }))}>Clear</button>}
              </div>
              <div className="d-flex gap-2 mb-2">
                <input className="input max-w-200" placeholder="Add name..." value={blInput} onChange={e => setBlInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { addToBlacklist(blInput.trim()); setBlInput(''); } }} />
                <button type="button" className="btn btn-sm" onClick={() => { addToBlacklist(blInput.trim()); setBlInput(''); }}>Add</button>
              </div>
              {config.blacklisted.length > 0 && (
                <div className="d-flex flex-wrap gap-1">
                  {config.blacklisted.map((name: string) => (
                    <div key={name} className="blacklist-chip">
                      <span className="text-red">{name}</span>
                      <button type="button" onClick={() => setConfig((c: Config) => ({ ...c, blacklisted: c.blacklisted.filter((n: string) => n !== name) }))} aria-label={`Remove ${name} from blacklist`}>{'\u2715'}</button>
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

      {/* ──── Preview + Download ──── */}
      <div className="preview-container">
        <div className="preview-header" style={{ background: strat?.gradient || undefined }}>
          <div className="d-flex items-center gap-2 flex-wrap">
            <span className="text-xl">{strat?.icon}</span>
            <span className="fw-700 text-lg" style={{ color: strat?.color || 'var(--text)' }}>{strat?.label}</span>
            <span className="text-md text-sub">{results.length} items</span>
            {totalOverrides > 0 && (
              <span className="pill tag-warn">
                {totalOverrides} override{totalOverrides > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="d-flex gap-2 flex-wrap">
            <button type="button" className="btn-cta" onClick={generateAndDownload} disabled={results.length === 0}>
              Download Config
            </button>
            <button type="button" className="btn btn-sm" onClick={saveConfig} disabled={isSaving}>{isSaving ? 'Saving...' : 'Save to DB'}</button>
          </div>
        </div>
        {results.length === 0 ? (
          <div className="empty-state">
            No items match your filters. Try widening the price range or lowering min listings.
          </div>
        ) : (
          <div className="preview-body">
            <div className="table-wrap">
              <table className="dash-table" role="table">
                <thead><tr role="row">
                  <th className="w-30" role="columnheader">#</th>
                  <th className="w-28"></th>
                  <th>Tier</th><th>Name</th><th>Rarity</th>
                  <th>Min</th><th>Median</th><th>Listings</th><th>Min Value</th><th>Overrides</th>
                </tr></thead>
                <tbody role="rowgroup">
                  {results.map((r: Recommendation, i: number) => {
                    if (!r?.name) return null;
                    const overrides = (advisoryMap.get(r.name) || []).filter((a: MutationAdvisory) => a.needsOverride);
                    return (
                      <tr key={`config-${r.name}`} role="row">
                        <td className="text-muted text-mono">{i + 1}</td>
                        <td><ImageThumb src={r.imageUrl || ''} size={22} /></td>
                        <td><TierBadge tier={r.tier || ''} /></td>
                        <td className="fw-600">{r.name || '—'}</td>
                        <td><RarityBadge rarity={r.rarity || ''} /></td>
                        <td className="text-green text-mono">{fmtPrice(r.min ?? 0)}</td>
                        <td className="text-mono">{fmtPrice(r.med ?? 0)}</td>
                        <td>{r.listings ?? 0}</td>
                        <td className="text-accent text-mono fw-600">{fmtMinValue(smartMinValue(r))}</td>
                        <td>
                          {overrides.length > 0 ? (
                            <div className="d-flex flex-wrap gap-1">
                              {overrides.map((a: MutationAdvisory) => (
                                <span key={a.mutation} className="mut-override-chip">
                                  {a.mutation} {'\u2192'} {fmtMinValue(a.recommendedOverride ?? 1000000)}
                                </span>
                              ))}
                            </div>
                          ) : <span className="text-muted text-xs">{'\u2014'}</span>}
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

      {/* ──── Config Summary — why these items were picked ──── */}
      {configSummary && results.length > 0 && (
        <div className="config-summary" style={{ padding: '12px 16px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <div className="text-sm fw-600 text-sub mb-2">Config Breakdown</div>
          <div className="d-flex flex-wrap gap-2 mb-2">
            {configSummary.sortedRarities.map(([rar, count]) => (
              <span key={rar} className="pill" style={{ fontSize: '0.75rem' }}>
                {rar}: {count}
              </span>
            ))}
          </div>
          <div className="d-flex flex-col gap-1">
            {configSummary.hints.map((hint, i) => (
              <div key={i} className="text-xs text-muted">{'\u2022'} {hint}</div>
            ))}
          </div>
        </div>
      )}

      {/* ──── Generated config info ──── */}
      {generated && (
        <div className="config-success">
          <div className="d-flex justify-between items-center flex-wrap gap-2">
            <div>
              <div className="text-lg fw-700 text-green mb-1">Config Generated</div>
              <div className="text-sm text-muted">
                {config.whitelisted.length} items · {config.blacklisted.length} blacklisted ·
                Format: {'{'}blacklisted, whitelisted: [{'{'}pet_name, priority, min_value, mutations{'}'}], version{'}'}
              </div>
            </div>
            <div className="d-flex gap-2">
              <button type="button" className="btn btn-sm" onClick={() => downloadConfigJSON(config, showToast, data.recommendations)}>Download Again</button>
              <button type="button" className="btn-cta btn-sm" onClick={generateAndDownload}>Re-Generate</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default React.memo(ConfigTab);
