'use client';

import React, { useState, useMemo } from 'react';
import type { DashData, Recommendation } from '../../lib/types';
import { fmtPrice, raritySort } from '../../lib/utils';
import { RARITY_WEIGHT } from '../../lib/constants';
import { StatCard, TierBadge, RarityBadge, WLButton, ImageThumb, SearchInput, FilterBar } from '../ui';

// Rarity-first tiebreaker: within similar primary sort values, rarer items come first
const rarityTiebreak = (a: Recommendation, b: Recommendation) =>
  (RARITY_WEIGHT[a.rarity] ?? 7) - (RARITY_WEIGHT[b.rarity] ?? 7);

interface RecsTabProps {
  data: DashData;
  search: string;
  setSearch: (value: string) => void;
  openDetail: (name: string) => void;
  isOnWL: (name: string) => boolean;
  addToWL: (name: string) => void;
  removeFromWL: (name: string) => void;
}

export default React.memo(function RecsTab({ data, search, setSearch, openDetail, isOnWL, addToWL, removeFromWL }: RecsTabProps) {
  const [tierFilter, setTierFilter] = useState('all');
  const [rarityFilter, setRarityFilter] = useState('all');
  const [sortBy, setSortBy] = useState('score');
  const [showCount, setShowCount] = useState(80);
  const recs = useMemo(() => {
    if (!data?.recommendations) return [];
    let arr = [...data.recommendations];
    if (search) arr = arr.filter((r: Recommendation) => r?.name?.toLowerCase?.().includes(search.toLowerCase()));
    if (tierFilter !== 'all') arr = arr.filter((r: Recommendation) => r.tier === tierFilter);
    if (rarityFilter !== 'all') arr = arr.filter((r: Recommendation) => r.rarity === rarityFilter);
    // All sort modes use rarity as tiebreaker — rarer items always float up within same value
    if (sortBy === 'score') arr.sort((a: Recommendation, b: Recommendation) => (b.score - a.score) || rarityTiebreak(a, b));
    else if (sortBy === 'roi') arr.sort((a: Recommendation, b: Recommendation) => (b.roiPct - a.roiPct) || rarityTiebreak(a, b));
    else if (sortBy === 'sold') arr.sort((a: Recommendation, b: Recommendation) => (b.soldCount - a.soldCount) || rarityTiebreak(a, b));
    else if (sortBy === 'farm') arr.sort((a, b) => ((b.farmScore ?? 0) - (a.farmScore ?? 0)) || rarityTiebreak(a, b));
    else if (sortBy === 'flip') arr.sort((a, b) => ((b.flipScore ?? 0) - (a.flipScore ?? 0)) || rarityTiebreak(a, b));
    else if (sortBy === 'price') arr.sort((a, b) => (b.med - a.med) || rarityTiebreak(a, b));
    else if (sortBy === 'scarcity') arr.sort((a, b) => ((b.scarcityScore ?? 0) - (a.scarcityScore ?? 0)) || rarityTiebreak(a, b));
    else if (sortBy === 'rarity') arr.sort((a, b) => rarityTiebreak(a, b) || (b.score - a.score));
    return arr;
  }, [data, search, tierFilter, rarityFilter, sortBy]);

  const rarities = useMemo(() => ([...new Set((data?.recommendations ?? []).map((r: Recommendation) => r.rarity))] as string[]).sort(raritySort), [data]);

  // Summary stats
  const summary = useMemo(() => {
    const s = { total: recs.length, avgScore: 0, avgMed: 0, tiers: { S: 0, A: 0, B: 0, C: 0, D: 0 } as Record<string, number> };
    recs.forEach((r: Recommendation) => { s.avgScore += r.score; s.avgMed += r.med; s.tiers[r.tier] = (s.tiers[r.tier] || 0) + 1; });
    if (s.total > 0) { s.avgScore = Math.round(s.avgScore / s.total * 10) / 10; s.avgMed = Math.round(s.avgMed / s.total * 100) / 100; }
    return s;
  }, [recs]);

  const addAllTier = (tier: string) => {
    recs.filter((r: Recommendation) => r.tier === tier && !isOnWL(r.name)).forEach((r: Recommendation) => addToWL(r.name));
  };

  return (
    <div className="d-flex flex-col gap-4">
      {/* Summary bar */}
      <div className="grid-stats stagger-in">
        <StatCard label="Results" value={summary.total} />
        <StatCard label="Avg Score" value={summary.avgScore} color="var(--gold)" />
        <StatCard label="Avg Median" value={fmtPrice(summary.avgMed)} />
        {Object.entries(summary.tiers).filter(([, v]) => v > 0).map(([t, v]) => (
          <StatCard key={t} label={`${t}-Tier`} value={v} color={t === 'S' ? 'var(--gold)' : t === 'A' ? 'var(--accent2)' : t === 'B' ? '#42a5f5' : 'var(--text3)'} />
        ))}
      </div>

      {/* Filters */}
      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search..." maxWidth={220} />
        <select className="select" value={tierFilter} onChange={e => setTierFilter(e.target.value)}>
          <option value="all">All Tiers</option>
          {['S', 'A', 'B', 'C', 'D'].map(t => <option key={t} value={t}>{t}-Tier</option>)}
        </select>
        <select className="select" value={rarityFilter} onChange={e => setRarityFilter(e.target.value)}>
          <option value="all">All Rarities</option>
          {rarities.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select className="select" value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="score">Sort: Score</option>
          <option value="roi">Sort: ROI %</option>
          <option value="sold">Sort: Most Sold</option>
          <option value="farm">Sort: Farm Score</option>
          <option value="flip">Sort: Flip Score</option>
          <option value="price">Sort: Price</option>
          <option value="scarcity">Sort: Scarcity</option>
          <option value="rarity">Sort: Rarity First</option>
        </select>
        <button type="button" className="btn btn-success" onClick={() => addAllTier('S')}>+ All S-Tier</button>
        <button type="button" className="btn btn-primary" onClick={() => addAllTier('A')}>+ All A-Tier</button>
      </FilterBar>

      {/* Table */}
      <div className="glass-card table-wrap max-h-70">
        <table className="dash-table" role="table">
          <thead><tr role="row">
            <th className="w-28"></th>
            <th>Tier</th><th>Name</th><th>Rarity</th><th>Score</th><th>Median</th><th>Min</th><th>Max</th>
            <th>ROI%</th><th>Sold</th><th>Listings</th><th>Sellers</th><th>Mutations</th><th>Trend</th><th>WL</th>
          </tr></thead>
          <tbody role="rowgroup">
            {recs.length === 0 && (
              <tr><td colSpan={15} className="text-center text-muted p-4">No recommendations match your filters</td></tr>
            )}
            {recs.slice(0, showCount).map((r: Recommendation) => (
              <tr key={`rec-${r.name}`} onClick={() => openDetail(r.name)} className="clickable" role="row">
                <td><ImageThumb src={r.imageUrl} size={24} /></td>
                <td><TierBadge tier={r.tier} /></td>
                <td className="fw-600">{r.name}</td>
                <td><RarityBadge rarity={r.rarity} /></td>
                <td className={`fw-700 ${r.tier === 'S' ? 'color-gold' : r.tier === 'A' ? 'color-accent' : ''}`}>{r.score}</td>
                <td className="text-mono">{fmtPrice(r.med)}</td>
                <td className="text-mono text-green">{fmtPrice(r.min)}</td>
                <td className="text-mono text-red">{fmtPrice(r.max)}</td>
                <td className={`text-mono ${r.roiPct > 50 ? 'color-green' : r.roiPct > 20 ? 'color-gold' : 'text-sub'}`}>{r.roiPct > 0 ? `${r.roiPct}%` : '-'}</td>
                <td className={r.soldCount > 0 ? 'color-red' : 'color-muted'}>{r.soldCount > 0 ? r.soldCount : '-'}</td>
                <td>{r.listings}</td>
                <td>{r.sellerCount}</td>
                <td>{r.mutationCount}</td>
                <td>{r.trendingListings > 0 ? <span className="text-orange">{r.trendingListings}</span> : '-'}</td>
                <td><WLButton name={r.name} isOnWL={isOnWL(r.name)} onAdd={addToWL} onRemove={removeFromWL} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {recs.length > showCount && (
        <div className="text-center mt-3">
          <button type="button" className="btn" onClick={() => setShowCount(c => Math.min(c + 80, recs.length))}>
            Show more ({recs.length - showCount} remaining)
          </button>
        </div>
      )}
    </div>
  );
});
