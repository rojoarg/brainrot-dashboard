'use client';

import React, { useState, useMemo } from 'react';
import type { DashData, Brainrot } from '../../lib/types';
import { raritySort, fmt, fmtPrice, getRarityWeight } from '../../lib/utils';
import { SearchInput, FilterBar, RarityBadge, ImageThumb, WLButton } from '../ui';

interface BrainrotsTabProps {
  data: DashData;
  search: string;
  setSearch: (value: string) => void;
  sortCol: string;
  sortDir: 'asc' | 'desc';
  handleSort: (col: string) => void;
  openDetail: (name: string) => void;
  isOnWL: (name: string) => boolean;
  addToWL: (name: string) => void;
  removeFromWL: (name: string) => void;
}

function BrainrotsTab({
  data,
  search,
  setSearch,
  sortCol,
  sortDir,
  handleSort,
  openDetail,
  isOnWL,
  addToWL,
  removeFromWL,
}: BrainrotsTabProps) {
  const [rarityFilter, setRarityFilter] = useState('all');
  const [showCount, setShowCount] = useState(100);

  const entries = useMemo(() => {
    if (!data?.brainrots) return [];
    let arr = Object.entries(data.brainrots).map(([name, b]: [string, Brainrot]) => ({ name, ...b }));
    if (search) arr = arr.filter(b => b?.name?.toLowerCase?.().includes(search.toLowerCase()));
    if (rarityFilter !== 'all') arr = arr.filter(b => b?.rarity === rarityFilter);
    const col = sortCol;
    arr.sort((a, b) => {
      // Primary sort: rarity weight (OG first, Common last) — always applied
      const ra = getRarityWeight(a.rarity);
      const rb = getRarityWeight(b.rarity);
      if (ra !== rb) return ra - rb;

      // Secondary sort: user-selected column
      const va = col === 'name' ? a.name : (a[col as keyof Brainrot] ?? 0);
      const vb = col === 'name' ? b.name : (b[col as keyof Brainrot] ?? 0);
      if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
      return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
    return arr;
  }, [data, search, rarityFilter, sortCol, sortDir]);

  const rarities = useMemo(
    () => data?.brainrots ? ([...new Set(Object.values(data.brainrots).map((b: Brainrot) => b?.rarity).filter(Boolean))] as string[]).sort(raritySort) : [],
    [data],
  );

  const sortTh = (col: string, children: React.ReactNode) => (
    <th onClick={() => handleSort(col)} className="cursor-pointer" aria-sort={sortCol === col ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'} role="columnheader">
      {children} <span className={`sort-arrow${sortCol === col ? ' active' : ''}`} aria-hidden="true">{sortCol === col ? (sortDir === 'asc' ? '\u25B2' : '\u25BC') : ''}</span>
    </th>
  );

  return (
    <div className="animate-fade-in">
      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search brainrots..." maxWidth={260} />
        <select className="select" value={rarityFilter} onChange={e => setRarityFilter(e.target.value)}>
          <option value="all">All Rarities</option>
          {rarities.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <span className="text-md text-sub">{entries.length} results</span>
      </FilterBar>
      <div className="glass-card table-wrap max-h-70">
        <table className="dash-table" role="table">
          <thead>
            <tr role="row">
              <th className="w-30"></th>
              {sortTh('name', 'Name')}
              <th>Rarity</th>
              {sortTh('medianPrice', 'Median')}
              {sortTh('minPrice', 'Min')}
              {sortTh('maxPrice', 'Max')}
              {sortTh('listingCount', 'Listings')}
              {sortTh('totalQty', 'Qty')}
              {sortTh('sellerCount', 'Sellers')}
              {sortTh('mutationCount', 'Mutations')}
              <th>WL</th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            {entries.length === 0 && (
              <tr><td colSpan={11} className="text-center text-muted p-4">No brainrots{search ? ' match your search' : rarityFilter !== 'all' ? ` with rarity "${rarityFilter}"` : ' found'}</td></tr>
            )}
            {entries.slice(0, showCount).map(b => (
              <tr key={`brainrot-${b.name}`} onClick={() => openDetail(b.name)} className="clickable" role="row">
                <td>
                  <ImageThumb src={b.imageUrl} size={24} />
                </td>
                <td className="fw-600">
                  {b.name} {b.trendingListings > 0 && <span className="text-orange text-xs">🔥</span>}
                </td>
                <td>
                  <RarityBadge rarity={b.rarity} />
                </td>
                <td className="text-mono fw-600">{fmtPrice(b.medianPrice)}</td>
                <td className="text-mono text-green">{fmtPrice(b.minPrice)}</td>
                <td className="text-mono text-red">{fmtPrice(b.maxPrice)}</td>
                <td>{b.listingCount}</td>
                <td>{fmt(b.totalQty)}</td>
                <td>{b.sellerCount}</td>
                <td>{b.mutationCount}</td>
                <td>
                  <WLButton name={b.name} isOnWL={isOnWL(b.name)} onAdd={addToWL} onRemove={removeFromWL} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {entries.length > showCount && (
        <div className="text-center mt-3">
          <button type="button" className="btn" onClick={() => setShowCount(c => Math.min(c + 100, entries.length))}>
            Show more ({entries.length - showCount} remaining)
          </button>
        </div>
      )}
    </div>
  );
}

export default React.memo(BrainrotsTab);
