'use client';

import React, { useMemo } from 'react';
import {
  BarChart, Bar, PieChart, Pie, AreaChart, Area, Cell,
  CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { DashData, Recommendation, PriceHistoryPoint, SoldItem } from '../../lib/types';
import { RARITY_COLORS } from '../../lib/constants';
import { fmt, fmtPrice, timeAgo } from '../../lib/utils';
import { StatCard, TierBadge, RarityBadge, ImageThumb, Sparkline } from '../ui';

/* Shared Recharts constants — single source of truth */
const TOOLTIP_STYLE = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'var(--shadow-lg)' } as const;
const CHART_COLORS = { accent: '#ef4444', gold: '#ffd740', cyan: '#00e5ff' } as const;

interface OverviewTabProps {
  data: DashData;
  openDetail: (name: string) => void;
}

function OverviewTab({ data, openDetail }: OverviewTabProps) {
  const { meta, rarityDist, priceBuckets, recommendations, soldArchive, trending, mutationDist, priceHistory } = data;

  const topS = recommendations.filter((r: Recommendation) => r.tier === 'S').slice(0, 8);
  const topA = recommendations.filter((r: Recommendation) => r.tier === 'A').slice(0, 8);

  // Tier distribution for pie chart
  const tierDist = useMemo(() => {
    const counts: Record<string, number> = { S: 0, A: 0, B: 0, C: 0, D: 0 };
    recommendations.forEach((r: Recommendation) => { counts[r.tier] = (counts[r.tier] || 0) + 1; });
    return Object.entries(counts).map(([tier, count]) => ({ tier, count }));
  }, [recommendations]);

  const tierColors: Record<string, string> = { S: '#ffd740', A: '#ef4444', B: '#42a5f5', C: '#555577', D: '#333355' };

  // Price history chart data (aggregate by date)
  const historyChart = useMemo(() => {
    const byDate: Record<string, { date: string; avg: number; count: number; total: number }> = {};
    (priceHistory || []).forEach((p: PriceHistoryPoint) => {
      const d = p.snapshot_date;
      if (!byDate[d]) byDate[d] = { date: d, avg: 0, count: 0, total: 0 };
      byDate[d].count += p.listing_count || 0;
      byDate[d].total += (p.avg_price || 0) * (p.listing_count || 1);
    });
    return Object.values(byDate).map(d => ({
      ...d, avg: d.count > 0 ? Math.round(d.total / d.count * 100) / 100 : 0,
    })).sort((a, b) => a.date.localeCompare(b.date));
  }, [priceHistory]);

  // Market value by rarity — compute actual avg prices from brainrots data
  const rarityValue = useMemo(() => {
    const byRarity: Record<string, { name: string; totalPrice: number; count: number }> = {};
    for (const [, b] of Object.entries(data.brainrots || {})) {
      const r = (b as any).rarity as string;
      if (!r) continue;
      if (!byRarity[r]) byRarity[r] = { name: r, totalPrice: 0, count: 0 };
      byRarity[r].totalPrice += (b as any).medianPrice || 0;
      byRarity[r].count++;
    }
    return Object.values(byRarity)
      .map(r => ({ name: r.name, avgPrice: r.count > 0 ? Math.round(r.totalPrice / r.count * 100) / 100 : 0, totalValue: Math.round(r.totalPrice * 100) / 100 }))
      .filter(r => r.totalValue > 0)
      .sort((a, b) => b.avgPrice - a.avgPrice);
  }, [data]);

  // Score vs Price scatter data
  const scatterData = useMemo(() => {
    return recommendations.slice(0, 100).map((r: Recommendation) => ({
      name: r.name, score: r.score, med: r.med, tier: r.tier, rarity: r.rarity, listings: r.listings,
    }));
  }, [recommendations]);

  return (
    <div className="d-flex flex-col gap-6 animate-fade-in">
      {/* Hero stats */}
      <div className="grid-stats stagger-in">
        <StatCard label="Total Listings" value={meta.totalListings.toLocaleString()} sub={(meta.recordCount ?? 0) > meta.totalListings ? `${meta.recordCount!.toLocaleString()} in API` : ''} />
        <StatCard label="Unique Brainrots" value={meta.uniqueBrainrots} />
        <StatCard label="Total Sellers" value={meta.totalSellers.toLocaleString()} />
        <StatCard label="Total Quantity" value={fmt(meta.totalQty)} />
        <StatCard label="Sold (30d)" value={meta.totalSoldLast30d || soldArchive.recent.length} color="var(--red)" sub={`${soldArchive.totalAllTime.toLocaleString()} all time`} />
        <StatCard label="Trending" value={meta.trendingCount || 0} color="var(--orange)" />
        <StatCard label="Unique Combos" value={meta.uniqueCombos?.toLocaleString() ?? 0} />
        <StatCard label="Watchlist" value={data.config.whitelisted.length} color="var(--gold)" />
      </div>

      {/* Charts row 1: Rarity bar + Tier pie */}
      <div className="grid-charts stagger-in">
        <div className="glass-card p-4">
          <h3 className="chart-title">Listings by Rarity</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={rarityDist}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text3)' }} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text3)' }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>{rarityDist.map((r: { name: string; count: number; color: string }, i: number) => <Cell key={`${r.name}-${i}`} fill={RARITY_COLORS[r.name] || '#666'} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="glass-card p-4">
          <h3 className="chart-title">Tier Distribution</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={tierDist} dataKey="count" nameKey="tier" cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={3} label={({ payload }: { payload?: { tier?: string; count?: number } }) => `${payload?.tier ?? ''}: ${payload?.count ?? 0}`}>
                {tierDist.map((t, i) => <Cell key={`tier-${t.tier}-${i}`} fill={tierColors[t.tier] || '#666'} />)}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts row 2: Price distribution + Market history */}
      <div className="grid-charts">
        <div className="glass-card p-4">
          <h3 className="chart-title">Price Distribution</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={priceBuckets}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--text3)' }} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text3)' }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="count" fill={CHART_COLORS.accent} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {historyChart.length > 1 ? (
          <div className="glass-card p-4">
            <h3 className="chart-title">Market Avg Price (30d)</h3>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={historyChart}>
                <defs>
                  <linearGradient id="avgGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS.accent} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={CHART_COLORS.accent} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text3)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text3)' }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Area type="monotone" dataKey="avg" stroke={CHART_COLORS.accent} fill="url(#avgGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="glass-card p-4">
            <h3 className="chart-title">Rarity Avg Price</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={rarityValue.slice(0, 10)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text3)' }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: 'var(--text3)' }} width={80} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="avgPrice" radius={[0, 4, 4, 0]}>{rarityValue.slice(0, 10).map((r: { name: string; avgPrice: number; totalValue: number }, i: number) => <Cell key={`${r.name}-avg-${i}`} fill={RARITY_COLORS[r.name] || '#666'} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Score vs Price scatter */}
      <div className="glass-card p-4">
        <h3 className="chart-title">Score vs Median Price (Top 100)</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={[...scatterData].sort((a: { name: string; score: number; med: number; tier: string; rarity: string; listings: number }, b: { name: string; score: number; med: number; tier: string; rarity: string; listings: number }) => b.score - a.score).slice(0, 30)}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" tick={{ fontSize: 8, fill: 'var(--text3)' }} interval={0} angle={-45} textAnchor="end" height={60} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--text3)' }} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(val) => [typeof val === 'number' ? val.toFixed(1) : String(val ?? '')]} />
            <Bar dataKey="score" fill={CHART_COLORS.gold} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Mutations chart */}
      <div className="glass-card p-4">
        <h3 className="chart-title">Mutations Distribution</h3>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={(mutationDist || []).filter((m: { name: string; count: number; color: string }) => m.name !== 'None').slice(0, 15)}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text3)' }} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--text3)' }} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Bar dataKey="count" fill={CHART_COLORS.cyan} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Top S and A tier with enriched data */}
      <div className="grid-2col">
        <div className="glass-card p-4">
          <h3 className="d-flex items-center gap-2 mb-3 text-md color-gold">
            <TierBadge tier="S" /> Top S-Tier Brainrots
          </h3>
          {topS.length === 0 && <div className="text-sm text-muted p-2">No S-tier items yet</div>}
          {topS.map((r: Recommendation) => (
            <div key={r.name} role="button" tabIndex={0} onClick={() => openDetail(r.name)} onKeyDown={e => e.key === 'Enter' && openDetail(r.name)} className="config-item cursor-pointer mb-1">
              <ImageThumb src={r.imageUrl} />
              <div className="flex-1">
                <div className="text-lg fw-600">{r.name}</div>
                <div className="text-sm text-sub">
                  <RarityBadge rarity={r.rarity} /> {fmtPrice(r.med)} med &middot; {r.listings ?? 0} listings
                  {(r.soldCount ?? 0) > 0 && <span className="text-red ml-1">{r.soldCount} sold</span>}
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg fw-700 color-gold">{r.score}</div>
                {(r.roiPct ?? 0) > 0 && <div className="text-xs text-green">{r.roiPct}% ROI</div>}
              </div>
            </div>
          ))}
        </div>
        <div className="glass-card p-4">
          <h3 className="d-flex items-center gap-2 mb-3 text-md color-accent">
            <TierBadge tier="A" /> Top A-Tier Brainrots
          </h3>
          {topA.length === 0 && <div className="text-sm text-muted p-2">No A-tier items yet</div>}
          {topA.map((r: Recommendation) => (
            <div key={r.name} role="button" tabIndex={0} onClick={() => openDetail(r.name)} onKeyDown={e => e.key === 'Enter' && openDetail(r.name)} className="config-item cursor-pointer mb-1">
              <ImageThumb src={r.imageUrl} />
              <div className="flex-1">
                <div className="text-lg fw-600">{r.name}</div>
                <div className="text-sm text-sub">
                  <RarityBadge rarity={r.rarity} /> {fmtPrice(r.med)} med &middot; {r.listings ?? 0} listings
                  {(r.soldCount ?? 0) > 0 && <span className="text-red ml-1">{r.soldCount} sold</span>}
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg fw-700 color-accent">{r.score}</div>
                {(r.roiPct ?? 0) > 0 && <div className="text-xs text-green">{r.roiPct}% ROI</div>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent sold/delisted */}
      {(soldArchive?.recent?.length ?? 0) > 0 && (
        <div className="glass-card p-4">
          <h3 className="section-heading text-red">Recently Sold / Delisted</h3>
          <div className="grid-strategies">
            {soldArchive.recent.slice(0, 12).map((s: SoldItem, i: number) => (
              <div key={`sold-${s.name}-${i}`} role="button" tabIndex={0} onClick={() => openDetail(s.name)} onKeyDown={e => e.key === 'Enter' && openDetail(s.name)} className="config-item cursor-pointer">
                <ImageThumb src={s.imageUrl} size={24} />
                <div className="flex-1 min-w-0">
                  <div className="text-md fw-600 truncate">{s.name}</div>
                  <div className="text-sm text-sub">{fmtPrice(s.price)} &middot; {s.mutation !== 'None' ? s.mutation : ''} {timeAgo(s.soldAt || s.sold_at)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scrape history */}
      <div className="glass-card p-4">
        <h3 className="section-heading">Scrape History</h3>
        <div className="table-wrap">
          <table className="dash-table" role="table">
            <thead><tr role="row">
              <th>Time</th><th>Status</th><th>Listings</th><th>Brainrots</th><th>Sellers</th><th>Pages</th><th>Failed</th>
              <th>Delisted</th><th>New</th><th>Trending</th><th>Avg Price</th>
            </tr></thead>
            <tbody role="rowgroup">
              {(meta.scrapeRuns || []).map((r: { status: string; totalListings?: number; completed_at?: string; started_at?: string; pages_scraped?: number }, i: number) => (
                <tr key={`scrape-${r.completed_at}-${i}`} role="row">
                  <td>{r.completed_at ? timeAgo(r.completed_at) : '...'}</td>
                  <td><span className={`scrape-status scrape-status--${r.status}`}>{r.status}</span></td>
                  <td>{r.totalListings?.toLocaleString() || '-'}</td>
                  <td>{'-'}</td>
                  <td>{'-'}</td>
                  <td>{r.pages_scraped || '-'}</td>
                  <td className="text-muted">0</td>
                  <td>{'-'}</td>
                  <td>{'-'}</td>
                  <td>{'-'}</td>
                  <td>{'-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default React.memo(OverviewTab);
