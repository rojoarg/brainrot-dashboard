'use client';

import React, { useState, useMemo } from 'react';
import type { DashData, SoldItem, MarketChange } from '../../lib/types';
import { fmtPrice, timeAgo } from '../../lib/utils';
import { RarityBadge, ImageThumb, SearchInput, FilterBar } from '../ui';

interface SoldTabProps {
  data: DashData;
  openDetail: (name: string) => void;
}

export default React.memo(function SoldTab({ data, openDetail }: SoldTabProps) {
  const { soldArchive, marketChanges } = data;
  const [view, setView] = useState<'sold' | 'delisted' | 'new'>('sold');
  const [search, setSearch] = useState('');

  const soldByNameArr = useMemo(() => {
    const arr = Object.entries(soldArchive?.byName || {})
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.count - a.count);
    if (!search) return arr;
    const q = search.toLowerCase();
    return arr.filter(s => s.name.toLowerCase().includes(q));
  }, [soldArchive, search]);

  const filteredRecent = useMemo(() => {
    if (!search) return soldArchive?.recent || [];
    const q = search.toLowerCase();
    return soldArchive.recent.filter((s: SoldItem) => s.name.toLowerCase().includes(q) || s.seller?.toLowerCase().includes(q));
  }, [soldArchive, search]);

  const filteredDelisted = useMemo(() => {
    const items = marketChanges?.delisted || [];
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter((c: MarketChange) => c.name.toLowerCase().includes(q));
  }, [marketChanges, search]);

  const filteredNew = useMemo(() => {
    const items = marketChanges?.newItems || [];
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter((c: MarketChange) => c.name.toLowerCase().includes(q));
  }, [marketChanges, search]);

  return (
    <div className="animate-fade-in">
      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search sold/delisted..." maxWidth={220} />
        <div className="tab-nav d-flex">
          <button type="button" className={`tab-btn ${view === 'sold' ? 'active' : ''}`} onClick={() => setView('sold')}>Sold ({soldArchive?.totalAllTime ?? 0})</button>
          <button type="button" className={`tab-btn ${view === 'delisted' ? 'active' : ''}`} onClick={() => setView('delisted')}>Delisted ({marketChanges?.delisted?.length ?? 0})</button>
          <button type="button" className={`tab-btn ${view === 'new' ? 'active' : ''}`} onClick={() => setView('new')}>New ({marketChanges?.newItems?.length ?? 0})</button>
        </div>
      </FilterBar>

      {view === 'sold' && (
        <div>
          <div className="mb-3 text-md text-sub">
            {soldArchive?.totalAllTime ?? 0} total sold/delisted all time · {soldArchive?.recent?.length ?? 0} in last 30 days
          </div>

          {/* Summary by name */}
          <div className="glass-card p-4 mb-4">
            <h3 className="section-heading">Most Sold Brainrots (30d)</h3>
            <div className="grid-strategies">
              {soldByNameArr.slice(0, 24).map(s => (
                <div key={s.name} onClick={() => openDetail(s.name)} className="config-item cursor-pointer">
                  <div className="flex-1">
                    <div className="text-md fw-600">{s.name}</div>
                    <div className="text-sm text-sub">{s.count} sold · avg {fmtPrice(s.avgPrice)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent sold table */}
          <div className="glass-card table-wrap max-h-50">

            <table className="dash-table" role="table">
              <thead><tr role="row">
                <th className="w-28"></th><th>Name</th><th>Rarity</th><th>Mutation</th><th>M/s</th><th>Price</th><th>Qty</th><th>Seller</th><th>Sold</th>
              </tr></thead>
              <tbody role="rowgroup">
                {filteredRecent.slice(0, 300).map((s: SoldItem, i: number) => (
                  <tr key={`${s.offer_id}-${i}`} onClick={() => openDetail(s.name)} className="clickable" role="row">
                    <td><ImageThumb src={s.imageUrl} size={24} /></td>
                    <td className="fw-600">{s.name}</td>
                    <td><RarityBadge rarity={s.rarity} /></td>
                    <td className={s.mutation !== 'None' ? 'color-cyan' : 'color-muted'}>{s.mutation}</td>
                    <td>{s.ms}</td>
                    <td className="text-mono">{fmtPrice(s.price)}</td>
                    <td>{s.quantity}</td>
                    <td>{s.seller}</td>
                    <td className="text-sm text-sub">{s.soldAt ? timeAgo(s.soldAt) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(view === 'delisted' || view === 'new') && (
        <div className="glass-card table-wrap max-h-70">
          <table className="dash-table" role="table">
            <thead><tr role="row">
              <th>Name</th><th>Rarity</th><th>Mutation</th><th>M/s</th><th>Price</th><th>Qty</th><th>Seller</th><th>Detected</th>
            </tr></thead>
            <tbody role="rowgroup">
              {(view === 'delisted' ? filteredDelisted : filteredNew).slice(0, 500).map((c: MarketChange, i: number) => (
                <tr key={`${c.name}-${c.detected_at}-${i}`} onClick={() => openDetail(c.name)} className="clickable" role="row">
                  <td className="fw-600">{c.name}</td>
                  <td>{c.rarity && <RarityBadge rarity={c.rarity} />}</td>
                  <td className={c.mutation && c.mutation !== 'None' ? 'color-cyan' : 'color-muted'}>{c.mutation}</td>
                  <td>{c.ms}</td>
                  <td className="text-mono">{fmtPrice(c.price ?? 0)}</td>
                  <td>{c.quantity ?? '-'}</td>
                  <td>{c.seller}</td>
                  <td className="text-sm text-sub">{c.detected_at ? timeAgo(c.detected_at) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
});
