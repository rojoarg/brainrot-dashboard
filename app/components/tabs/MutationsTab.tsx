'use client';

import React, { useState, useMemo } from 'react';
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { DashData } from '../../lib/types';
import { fmtPrice } from '../../lib/utils';
import { SearchInput, FilterBar } from '../ui';

const TOOLTIP_STYLE = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'var(--shadow-lg)' } as const;

interface MutationsTabProps {
  data: DashData;
}

function MutationsTab({ data }: MutationsTabProps) {
  const { mutationStats, msStats, mutationDist } = data;
  const [search, setSearch] = useState('');
  const mutArr = useMemo(() => {
    const arr = Object.entries(mutationStats).map(([name, s]) => ({ name, ...s, uniquePetCount: (s as Record<string, number>).uniquePetCount ?? 0 })).sort((a, b) => b.count - a.count);
    if (!search) return arr;
    const q = search.toLowerCase();
    return arr.filter(m => m.name.toLowerCase().includes(q));
  }, [mutationStats, search]);
  const msArr = useMemo(() => {
    return Object.entries(msStats).map(([name, s]) => ({ name, ...s, uniquePetCount: (s as Record<string, number>).uniquePetCount ?? 0 })).sort((a, b) => b.count - a.count);
  }, [msStats]);

  return (
    <div className="d-flex flex-col gap-6 animate-fade-in">
      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search mutations..." maxWidth={220} />
        <span className="text-md text-sub">{mutArr.length} mutations · {msArr.length} M/s ranges</span>
      </FilterBar>
      <div className="glass-card p-4">
        <h3 className="chart-title">Mutations Overview</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={(mutationDist || mutArr).filter((m: { name?: string; count?: number; color?: string }) => m.name !== 'None')}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text3)' }} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--text3)' }} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Bar dataKey="count" fill="#06b6d4" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid-2col">
        <div className="glass-card table-wrap p-4 max-h-50">
          <h3 className="section-heading">Mutations</h3>
          <table className="dash-table" role="table">
            <thead><tr role="row"><th role="columnheader">Mutation</th><th>Listings</th><th>Pets</th><th>Avg Price</th><th>Min</th><th>Max</th></tr></thead>
            <tbody>
              {mutArr.length === 0 && (
                <tr><td colSpan={6} className="text-center text-muted p-4">No mutations{search ? ' match your search' : ' found'}</td></tr>
              )}
              {mutArr.map((m, idx) => (
                <tr key={`mut-${m.name}-${idx}`}>
                  <td className={`fw-600 ${m.name !== 'None' ? 'color-cyan' : 'color-muted'}`}>{m.name}</td>
                  <td>{m.count}</td>
                  <td>{m.uniquePetCount}</td>
                  <td className="text-mono">{fmtPrice(m.avgPrice)}</td>
                  <td className="text-mono text-green">{fmtPrice(m.minPrice)}</td>
                  <td className="text-mono text-red">{fmtPrice(m.maxPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="glass-card table-wrap p-4 max-h-50">
          <h3 className="section-heading">M/s Ranges</h3>
          <table className="dash-table" role="table">
            <thead><tr role="row"><th role="columnheader">Range</th><th>Listings</th><th>Pets</th><th>Avg Price</th><th>Min</th><th>Max</th></tr></thead>
            <tbody>
              {msArr.map((m, idx) => (
                <tr key={`ms-${m.name}-${idx}`}>
                  <td className="fw-600">{m.name}</td>
                  <td>{m.count}</td>
                  <td>{m.uniquePetCount}</td>
                  <td className="text-mono">{fmtPrice(m.avgPrice)}</td>
                  <td className="text-mono text-green">{fmtPrice(m.minPrice)}</td>
                  <td className="text-mono text-red">{fmtPrice(m.maxPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default React.memo(MutationsTab);
