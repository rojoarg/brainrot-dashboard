'use client';

import React, { useState, useMemo } from 'react';
import type { DashData, RawListing } from '../../lib/types';
import { fmtPrice } from '../../lib/utils';
import { SearchInput, ImageThumb, RarityBadge } from '../ui';

interface RawTabProps {
  data: DashData;
}

function RawTab({ data }: RawTabProps) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    if (!data?.rawListings) return [];
    if (!search) return data.rawListings.slice(0, 500);
    const s = search.toLowerCase();
    return data.rawListings.filter((l: RawListing) => l?.name?.toLowerCase?.().includes(s) || l?.seller?.toLowerCase?.().includes(s)).slice(0, 500);
  }, [data, search]);

  return (
    <div>
      <div className="d-flex gap-2 mb-3 items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by name or seller..." maxWidth={260} />
        <span className="text-md text-sub">{(data.rawListings?.length ?? 0).toLocaleString()} total · showing {filtered.length}</span>
      </div>
      <div className="glass-card table-wrap" style={{ maxHeight: '70vh' }}>
        <table className="dash-table" role="table">
          <thead><tr role="row">
            <th style={{ width: 24 }}></th><th>Name</th><th>Rarity</th><th>Mutation</th><th>M/s</th><th>Exact</th>
            <th>Price</th><th>Qty</th><th>Seller</th><th>Rating</th><th>🔥</th><th>Delivery</th>
          </tr></thead>
          <tbody role="rowgroup">
            {filtered.map((l: RawListing, i: number) => (
              <tr key={`${l.offer_id}-${l.name}`} role="row">
                <td><ImageThumb src={l.image_url} size={20} /></td>
                <td className="fw-600">{l.name}</td>
                <td><RarityBadge rarity={l.rarity} /></td>
                <td style={{ color: l.mutation !== 'None' ? 'var(--cyan)' : 'var(--text3)' }}>{l.mutation}</td>
                <td>{l.ms}</td>
                <td className="text-mono text-accent text-sm">-</td>
                <td className="text-mono fw-600">{fmtPrice(l.price)}</td>
                <td>{l.quantity}</td>
                <td>{l.verified ? <span className="text-green">✓ </span> : ''}{l.seller}</td>
                <td className="text-xs">-</td>
                <td>{l.is_trending ? '🔥' : ''}</td>
                <td className="text-xs text-muted">-</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default React.memo(RawTab);
