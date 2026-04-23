'use client';

import React, { useState, useMemo } from 'react';
import type { DashData, TrendingItem } from '../../lib/types';
import { fmtPrice } from '../../lib/utils';
import { SearchInput, FilterBar, ImageThumb, RarityBadge } from '../ui';

interface TrendingTabProps {
  data: DashData;
  openDetail: (name: string) => void;
}

function TrendingTab({ data, openDetail }: TrendingTabProps) {
  const trending = data?.trending || [];
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    if (!search) return trending;
    const q = search.toLowerCase();
    return trending.filter((t: TrendingItem) => t.name.toLowerCase().includes(q) || t.seller?.toLowerCase().includes(q));
  }, [trending, search]);
  return (
    <div className="animate-fade-in">
      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search trending..." maxWidth={220} />
        <span className="text-md text-sub">{filtered.length}{search ? ` / ${trending.length}` : ''} trending listings</span>
      </FilterBar>
      <div className="glass-card table-wrap max-h-70">
        <table className="dash-table" role="table">
          <thead><tr role="row">
            <th className="w-28"></th><th>Name</th><th>Rarity</th><th>Mutation</th><th>M/s</th><th>Exact M/s</th><th>Price</th><th>Seller</th><th>Verified</th>
          </tr></thead>
          <tbody role="rowgroup">
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="text-center text-muted p-4">No trending listings{search ? ' match your search' : ' right now'}</td></tr>
            )}
            {filtered.map((t: TrendingItem) => (
              <tr key={`${t.name}-${t.offer_id}`} onClick={() => openDetail(t.name)} className="clickable" role="row">
                <td><ImageThumb src={t.image_url} size={24} /></td>
                <td className="fw-600">{t.name}</td>
                <td><RarityBadge rarity={t.rarity} /></td>
                <td className={t.mutation !== 'None' ? 'color-cyan' : 'color-muted'}>{t.mutation}</td>
                <td>{t.ms}</td>
                <td className="text-mono text-sub">{'-'}</td>
                <td className="text-mono fw-600">{fmtPrice(t.price)}</td>
                <td>{t.seller}</td>
                <td>{t.verified ? <span className="text-green">✓</span> : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default React.memo(TrendingTab);
