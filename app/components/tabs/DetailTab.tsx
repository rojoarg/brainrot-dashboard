'use client';

import React, { useState, useMemo, useCallback } from 'react';
import type { DashData, Brainrot, Recommendation, WLItem, MutationAdvisory, BrainrotCombo, ComboSeller } from '../../lib/types';
import { fmt, fmtPrice, fmtMinValue, getMutationAdvisory, smartMinValue } from '../../lib/utils';
import { RARITY_COLORS, MUTATION_COLORS, MUTATION_MULTIPLIERS } from '../../lib/constants';
import { StatCard, TierBadge, RarityBadge, WLButton, ImageThumb, SearchInput, FilterBar } from '../ui';

interface DetailTabProps {
  data: DashData;
  selected: string | null;
  setSelected: (name: string | null) => void;
  isOnWL: (name: string) => boolean;
  addToWL: (name: string) => void;
  removeFromWL: (name: string) => void;
}

// Use the smartMinValue from utils instead of local stub
// This was a duplicate stub that always returned 1000000

export default React.memo(function DetailTab({ data, selected, setSelected, isOnWL, addToWL, removeFromWL }: DetailTabProps) {
  const [buyPrice, setBuyPrice] = useState('');
  const [buyQty, setBuyQty] = useState('1');
  const [detailSearch, setDetailSearch] = useState('');
  const names = useMemo(() => Object.keys(data.brainrots).sort(), [data]);
  const b = selected ? data.brainrots[selected] : null;
  const rec = data.recommendations.find((r: Recommendation) => r.name === selected);
  const soldInfo = selected ? data.soldArchive?.byName?.[selected] : null;

  // Prev/next navigation
  const recNames = useMemo(() => data.recommendations.map((r: Recommendation) => r.name), [data]);
  const currentIdx = selected ? recNames.indexOf(selected) : -1;
  const goPrev = useCallback(() => { if (currentIdx > 0) setSelected(recNames[currentIdx - 1]); }, [currentIdx, recNames]);
  const goNext = useCallback(() => { if (currentIdx < recNames.length - 1) setSelected(recNames[currentIdx + 1]); }, [currentIdx, recNames]);

  if (!selected || !b) return (
    <div className="glass-card p-4 text-center">
      <div className="text-sub mb-4">Select a brainrot to view details</div>
      <SearchInput value={detailSearch} onChange={setDetailSearch} placeholder="Search brainrots..." maxWidth={240} />
      <div className="d-flex flex-wrap gap-2 justify-center mt-3">
        {data.recommendations.filter((r: Recommendation) => !detailSearch || r.name.toLowerCase().includes(detailSearch.toLowerCase())).slice(0, 40).map((r: Recommendation) => (
          <button key={r.name} className="chip cursor-pointer" onClick={() => setSelected(r.name)}>
            <TierBadge tier={r.tier} /> {r.name}
          </button>
        ))}
      </div>
    </div>
  );

  const combos = [...Object.values(b?.combos || {}) as BrainrotCombo[]].sort((a: BrainrotCombo, z: BrainrotCombo) => (z.medianPrice || 0) - (a.medianPrice || 0));
  const bp = parseFloat(buyPrice) || 0;
  const bq = Math.max(1, parseInt(buyQty) || 1);

  return (
    <div className="d-flex flex-col gap-4">
      {/* Nav bar */}
      <FilterBar>
        <button type="button" className="btn btn-sm text-md" onClick={goPrev} disabled={currentIdx <= 0} aria-label="Previous item">{'\u2190'} Prev</button>
        <select className="select min-w-160" value={selected} onChange={e => setSelected(e.target.value)}>
          {names.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <button type="button" className="btn btn-sm text-md" onClick={goNext} disabled={currentIdx >= recNames.length - 1} aria-label="Next item">Next {'\u2192'}</button>
        <span className="text-sm text-muted">{currentIdx >= 0 ? `${currentIdx + 1} / ${recNames.length}` : ''}</span>
        <WLButton name={selected} isOnWL={isOnWL(selected)} onAdd={addToWL} onRemove={removeFromWL} />
      </FilterBar>

      {/* Header */}
      <div className="glass-card p-4">
        <div className="d-flex gap-4 flex-wrap items-center">
          <ImageThumb src={b.imageUrl} size={64} />
          <div className="flex-1 min-w-200">
            <div className="d-flex items-center gap-2 mb-1">
              <h2 className="text-display text-3xl fw-700">{selected}</h2>
              <RarityBadge rarity={b.rarity} />
              {rec && <TierBadge tier={rec.tier} />}
              {b.trendingListings > 0 && <span className="text-md text-orange">🔥 {b.trendingListings} trending</span>}
              <WLButton name={selected} isOnWL={isOnWL(selected)} onAdd={addToWL} onRemove={removeFromWL} />
            </div>
            <div className="d-flex gap-4 flex-wrap text-md text-sub">
              <span>{b.listingCount} listings</span>
              <span>{fmt(b.totalQty)} qty</span>
              <span>{b.sellerCount} sellers</span>
              <span>{b.mutationCount} mutations</span>
              <span>{combos.length} combos</span>
              {b.verifiedListings > 0 && <span className="text-green">✓ {b.verifiedListings} verified</span>}
              {soldInfo && <span className="text-red">💀 {soldInfo.count} sold (30d)</span>}
            </div>
          </div>
          {rec && (
            <div className="text-right">
              <div className="text-display fw-700 text-2xl color-gold">{rec.score}</div>
              <div className="text-sm text-sub">Score</div>
            </div>
          )}
        </div>
      </div>

      {/* Price stats */}
      <div className="grid-stats stagger-in">
        <StatCard label="Min" value={fmtPrice(b.minPrice)} color="var(--green)" />
        <StatCard label="P10" value={fmtPrice(b.p10)} />
        <StatCard label="P25" value={fmtPrice(b.p25)} />
        <StatCard label="Median" value={fmtPrice(b.medianPrice)} color="var(--accent2)" />
        <StatCard label="Avg" value={fmtPrice(b.avgPrice)} />
        <StatCard label="P75" value={fmtPrice(b.p75)} />
        <StatCard label="P90" value={fmtPrice(b.p90)} />
        <StatCard label="Max" value={fmtPrice(b.maxPrice)} color="var(--red)" />
      </div>

      {/* Exact M/s if available */}
      {b.exactMsMin != null && (
        <div className="grid-stats">
          <StatCard label="Exact M/s Min" value={b.exactMsMin.toFixed(1)} color="var(--cyan)" />
          <StatCard label="Exact M/s Median" value={b.exactMsMedian?.toFixed(1) || '-'} color="var(--cyan)" />
          <StatCard label="Exact M/s Max" value={b.exactMsMax ? b.exactMsMax.toFixed(1) : '-'} color="var(--cyan)" />
        </div>
      )}

      {/* Profit Calculator */}
      <div className="glass-card p-3">
        <h3 className="text-md text-sub mb-3">Profit Calculator</h3>
        <div className="d-flex gap-3 items-center flex-wrap">
          <div>
            <label className="text-sm text-muted">Buy Price ($)</label>
            <input className="input w-120" type="number" value={buyPrice} onChange={e => setBuyPrice(e.target.value)} placeholder={b.minPrice.toFixed(2)} />
          </div>
          <div>
            <label className="text-sm text-muted">Quantity</label>
            <input className="input min-w-80" type="number" value={buyQty} onChange={e => setBuyQty(e.target.value)} />
          </div>
          {bp > 0 && (
            <div className="d-flex gap-4 text-md">
              <div><span className="text-muted">Cost:</span> <strong>{fmtPrice(bp * bq)}</strong></div>
              <div><span className="text-muted">Sell at median:</span> <strong>{fmtPrice(b.medianPrice * bq)}</strong></div>
              <div><span className={b.medianPrice > bp ? 'color-green' : 'color-red'}>
                Profit: {fmtPrice((b.medianPrice - bp) * bq)} ({bp > 0 ? ((b.medianPrice - bp) / bp * 100).toFixed(0) : '0'}% ROI)
              </span></div>
              <div><span className="text-muted">Sell at P75:</span> <strong className="text-green">{fmtPrice((b.p75 - bp) * bq)} ({bp > 0 ? ((b.p75 - bp) / bp * 100).toFixed(0) : '0'}%)</strong></div>
            </div>
          )}
        </div>
      </div>

      {/* Score breakdown */}
      {rec && (
        <div className="glass-card p-3">
          <h3 className="text-md text-sub mb-3">Score Breakdown</h3>
          <div className="grid-stats gap-3">
            {[
              { label: 'Demand (25%)', val: rec.demandScore ?? 0, max: 10, color: 'var(--orange)' },
              { label: 'Scarcity (15%)', val: rec.scarcityScore ?? 0, max: 10, color: 'var(--red)' },
              { label: 'Spread (20%)', val: rec.spreadScore ?? 0, max: 10, color: 'var(--cyan)' },
              { label: 'Depth (15%)', val: rec.depthScore ?? 0, max: 10, color: 'var(--accent2)' },
              { label: 'Value (15%)', val: rec.valueScore ?? 0, max: 10, color: 'var(--gold)' },
              { label: 'WL Bonus (10%)', val: rec.wlBonus ?? 0, max: 5, color: 'var(--green)' },
            ].map((s: { label: string; val: number; max: number; color: string }) => (
              <div key={s.label} className="score-breakdown-item">
                <div className="text-sm text-muted mb-1">{s.label}</div>
                <div className="score-breakdown-value" style={{ color: s.color }}>{s.val}/{s.max}</div>
                <div className="progress-bar mt-1">
                  <div className="progress-fill" style={{ width: `${(s.val / s.max) * 100}%`, background: s.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mutation Override Advisory */}
      {rec && (() => {
        const advisory = getMutationAdvisory(rec);
        const overrides = advisory.filter(a => a.needsOverride);
        if (overrides.length === 0) return null;
        return (
          <div className="glass-card p-3 advisory-card">
            <h3 className="text-md text-orange d-flex items-center gap-1 mb-1">
              Mutation Overrides Recommended
            </h3>
            <p className="text-sm text-muted mb-3">
              These mutations are significantly more valuable than the base pet. Set overrides in your tool to avoid underselling mutated versions.
            </p>
            <div className="grid-strategies">
              {overrides.map(a => (
                <div key={a.mutation} className="d-flex items-center gap-2 advisory-override p-2 rounded">
                  <span className="fw-700 text-md min-w-80" style={{ color: MUTATION_COLORS[a.mutation] || 'var(--text)' }}>{a.mutation}</span>
                  <div className="flex-1 text-sm">
                    <div className="d-flex gap-2">
                      {a.multiplier > 0 && <span className="text-muted">{a.multiplier}x game mult</span>}
                      <span className="text-green text-mono">med {fmtPrice(a.medianPrice)}</span>
                    </div>
                    <div className="text-muted text-xs">{a.priceRatio}x base price · {a.listings} listings</div>
                  </div>
                  <div className="text-right">
                    <div className="fw-700 text-mono text-orange text-lg">{fmtMinValue(a.recommendedOverride)}</div>
                    <div className="text-xs text-muted">rec. override</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Combos table */}
      <div className="glass-card table-wrap p-3">
        <h3 className="text-md text-sub mb-3">All Combos ({combos.length})</h3>
        <table className="dash-table" role="table">
          <thead><tr role="row">
            <th>Mutation</th><th>Mult</th><th>M/s Range</th><th>Exact M/s</th><th>Min</th><th>Median</th><th>Avg</th><th>Max</th><th>Listings</th><th>Qty</th><th>Override</th><th>Top Sellers</th>
          </tr></thead>
          <tbody role="rowgroup">
            {combos.map((c: BrainrotCombo, i: number) => {
              const comboKey = `${c.mutation || 'none'}-${c.ms || 'nomass'}-${i}`;
              const mult = MUTATION_MULTIPLIERS[c.mutation || 'None'];
              const baseMed = b.medianPrice;
              const isValuable = c.mutation !== 'None' && (c.medianPrice || 0) > baseMed * 1.5;
              return (
              <tr key={comboKey} role="row" style={isValuable ? { background: 'rgba(255,165,0,0.04)' } : undefined}>
                <td><span style={{ color: MUTATION_COLORS[c.mutation || ''] || (c.mutation !== 'None' ? 'var(--cyan)' : 'var(--text3)'), fontWeight: c.mutation !== 'None' ? 600 : 400 }}>{c.mutation}</span></td>
                <td className="text-sm text-muted">{mult ? `${mult}x` : '-'}</td>
                <td>{c.ms}</td>
                <td className="text-sm text-mono">
                  {c.exactMsMin != null ? `${c.exactMsMin}–${c.exactMsMax}` : '-'}
                </td>
                <td className="text-mono text-green">{fmtPrice(c.minPrice ?? c.min ?? 0)}</td>
                <td className="text-mono fw-600">{fmtPrice(c.medianPrice ?? c.med ?? 0)}</td>
                <td className="text-mono">{fmtPrice(c.avgPrice ?? c.avg ?? 0)}</td>
                <td className="text-mono text-red">{fmtPrice(c.maxPrice ?? c.max ?? 0)}</td>
                <td>{c.count ?? c.n ?? 0}</td>
                <td>{fmt(c.totalQty ?? c.qty ?? 0)}</td>
                <td>
                  {isValuable ? (
                    <span className="text-sm text-mono fw-700 text-orange">
                      {fmtMinValue(smartMinValue({ med: c.medianPrice }))}
                    </span>
                  ) : <span className="text-xs text-muted">—</span>}
                </td>
                <td className="text-sm">
                  {c.sellers?.slice(0, 3).map((s: ComboSeller, j: number) => (
                    <span key={`${s.name}-${s.price}`} className="mr-2">
                      {s.verified && <span className="text-green">✓</span>}
                      {s.name} ({fmtPrice(s.price)})
                      {s.rating && s.rating > 0 && <span className="text-muted ml-1">{Math.round(s.rating)}%</span>}
                    </span>
                  ))}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
});
