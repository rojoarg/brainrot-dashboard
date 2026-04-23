'use client';

import React, { useState, useMemo } from 'react';
import type { DashData, Seller } from '../../lib/types';
import { fmtPrice } from '../../lib/utils';
import { TrustBadge, SearchInput, FilterBar } from '../ui';

interface SellersTabProps {
  data: DashData;
  openDetail: (name: string) => void;
}

export default React.memo(function SellersTab({ data, openDetail }: SellersTabProps) {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('listings');
  const sellers = useMemo(() => {
    let arr = data.topSellers;
    if (search) arr = arr.filter((s: Seller) => s.name.toLowerCase().includes(search.toLowerCase()));
    arr = [...arr].sort((a: Seller, b: Seller) => (b[sortBy as keyof Seller] as number || 0) - (a[sortBy as keyof Seller] as number || 0));
    return arr;
  }, [data, search, sortBy]);

  return (
    <div className="animate-fade-in">
      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search sellers..." maxWidth={220} />
        <select className="select" value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="listings">By Listings</option>
          <option value="uniquePets">By Unique Pets</option>
          <option value="totalValue">By Total Value</option>
          <option value="rating">By Rating</option>
          <option value="trustScore">By Trust Score</option>
        </select>
        <span className="text-md text-sub">{sellers.length} sellers</span>
      </FilterBar>
      <div className="glass-card table-wrap max-h-70">
        <table className="dash-table" role="table">
          <thead><tr role="row">
            <th>Seller</th><th>Trust</th><th>Rating</th><th>Feedback</th><th>+/-</th>
            <th>Listings</th><th>Pets</th><th>Avg Price</th><th>Total Value</th>
            <th>Dispute %</th><th>Verified</th><th>Warranty</th>
          </tr></thead>
          <tbody role="rowgroup">
            {sellers.length === 0 && (
              <tr><td colSpan={12} className="text-center text-muted p-4">No sellers match your search</td></tr>
            )}
            {sellers.slice(0, 200).map((s: Seller) => (
              <tr key={`seller-${s.name}`} role="row">
                <td className="fw-600">{s.name}</td>
                <td><TrustBadge score={s.trustScore} /></td>
                <td className={s.rating >= 99 ? 'color-green' : s.rating >= 95 ? 'color-gold' : ''}>{s.rating}%</td>
                <td>{s.feedbackCount.toLocaleString()}</td>
                <td>
                  <span className="text-green">{s.positive?.toLocaleString()}</span>
                  {s.negative > 0 && <span className="text-red"> / {s.negative}</span>}
                </td>
                <td>{s.listings}</td>
                <td>{s.uniquePets}</td>
                <td className="text-mono">{fmtPrice(s.avgPrice)}</td>
                <td className="text-mono">{fmtPrice(s.totalValue ?? 0)}</td>
                <td className={s.disputeRatio > 1 ? 'color-red' : 'text-sub'}>{s.disputeRatio}%</td>
                <td>{s.verified ? <span className="text-green">✓</span> : '-'}</td>
                <td>{s.warranty ? <span className="color-cyan">✓</span> : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});
