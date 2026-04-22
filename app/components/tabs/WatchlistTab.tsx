'use client';

import React, { useState, useMemo } from 'react';
import type { DashData, Config, WLItem, MutationAdvisory, Recommendation, Brainrot } from '../../lib/types';
import { fmtPrice, fmtMinValue, getMutationAdvisory, downloadConfigJSON } from '../../lib/utils';
import { MUTATION_COLORS } from '../../lib/constants';
import { TierBadge, RarityBadge, ImageThumb, SearchInput } from '../ui';

// fmtPrice is used in the render below

interface WatchlistTabProps {
  data: DashData;
  config: Config;
  openDetail: (name: string) => void;
  removeFromWL: (name: string) => void;
}

export default React.memo(function WatchlistTab({ data, config, openDetail, removeFromWL }: WatchlistTabProps) {
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  type WLItemEnriched = WLItem & {
    rec: Recommendation | undefined;
    brainrot: Brainrot | null;
    brainrotName: string;
    sold: { count: number; lastSold: string; avgPrice: number; totalValue: number } | undefined;
    advisory: MutationAdvisory[];
  };

  const items = useMemo((): WLItemEnriched[] => {
    return config.whitelisted.map((w: WLItem) => {
      const rec = data.recommendations.find((r: Recommendation) => r.name.toLowerCase() === w.pet_name.toLowerCase());
      const b = Object.entries(data.brainrots).find(([k]) => k.toLowerCase() === w.pet_name.toLowerCase());
      const sold = data.soldArchive?.byName?.[w.pet_name];
      const advisory = rec ? getMutationAdvisory(rec) : [];
      return { ...w, rec, brainrot: b ? b[1] : null, brainrotName: b ? b[0] : w.pet_name, sold, advisory };
    }).sort((a, b) => a.priority - b.priority);
  }, [config, data]);

  const filtered = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter(i => i.brainrotName.toLowerCase().includes(q) || i.pet_name.toLowerCase().includes(q));
  }, [items, search]);

  const totalOverrides = useMemo(() => items.reduce((s, i) => s + i.advisory.filter(a => a.needsOverride).length, 0), [items]);

  return (
    <div>
      <div className="d-flex justify-between items-center mb-3 flex-wrap gap-2">
        <div className="d-flex items-center gap-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Search watchlist..." maxWidth={200} />
          <span className="text-md text-sub">{filtered.length}{search ? ` / ${items.length}` : ''} items on watchlist</span>
          {totalOverrides > 0 && (
            <span className="text-sm fw-600 tag-warn">
              {totalOverrides} mutation override{totalOverrides > 1 ? 's' : ''} recommended
            </span>
          )}
        </div>
        <button type="button" className="btn btn-primary fw-700 text-md" onClick={() => downloadConfigJSON(config, undefined, data.recommendations)}>Export Config JSON</button>
      </div>
      <div className="glass-card table-wrap max-h-75">

        <table className="dash-table">
          <thead><tr>
            <th className="w-28"></th>
            <th>Pri</th><th>Name</th><th>Tier</th><th>Rarity</th><th>Min Value</th><th>Median</th><th>Min</th><th>Max</th>
            <th>Listings</th><th>Score</th><th>Sold</th><th>Mutations</th><th></th>
          </tr></thead>
          <tbody role="rowgroup">
            {filtered.map((item: typeof items[0]) => {
              const overrides = item.advisory.filter((a: MutationAdvisory) => a.needsOverride);
              const isExpanded = expandedItem === item.pet_name;
              return (
                <React.Fragment key={item.pet_name}>
                  <tr onClick={() => openDetail(item.brainrotName)} className="clickable">
                    <td><ImageThumb src={item.brainrot?.imageUrl || item.rec?.imageUrl} size={24} /></td>
                    <td className="fw-700 text-gold">#{item.priority}</td>
                    <td className="fw-600">{item.brainrotName}</td>
                    <td>{item.rec ? <TierBadge tier={item.rec.tier} /> : '-'}</td>
                    <td>{item.brainrot ? <RarityBadge rarity={item.brainrot.rarity} /> : '-'}</td>
                    <td className="text-mono text-accent text-sm">{item.min_value ? fmtMinValue(item.min_value) : '-'}</td>
                    <td className="text-mono">{item.brainrot ? fmtPrice(item.brainrot.medianPrice) : '-'}</td>
                    <td className="text-mono text-green">{item.brainrot ? fmtPrice(item.brainrot.minPrice) : '-'}</td>
                    <td className="text-mono text-red">{item.brainrot ? fmtPrice(item.brainrot.maxPrice) : '-'}</td>
                    <td>{item.brainrot?.listingCount || 0}</td>
                    <td className="fw-700">{item.rec?.score || '-'}</td>
                    <td>{item.sold ? <span className="text-red">{item.sold.count}</span> : '-'}</td>
                    <td>
                      {overrides.length > 0 ? (
                        <button type="button" className="btn text-orange text-xs advisory-chip" onClick={(e) => { e.stopPropagation(); setExpandedItem(isExpanded ? null : item.pet_name); }} aria-label={`${overrides.length} mutation override${overrides.length > 1 ? 's' : ''} for ${item.brainrotName}`}>
                          {overrides.length} override{overrides.length > 1 ? 's' : ''} {isExpanded ? '\u25B2' : '\u25BC'}
                        </button>
                      ) : (
                        <span className="text-xs text-muted">{item.advisory.length > 0 ? `${item.advisory.length} mut` : '-'}</span>
                      )}
                    </td>
                    <td><button type="button" className="btn btn-danger btn-sm" onClick={(e) => { e.stopPropagation(); removeFromWL(item.pet_name); }} aria-label={`Remove ${item.brainrotName} from watchlist`}>{'\u2715'}</button></td>
                  </tr>
                  {isExpanded && overrides.length > 0 && (
                    <tr>
                      <td colSpan={14} className="advisory-detail">
                        <div className="text-sm fw-600 text-orange mb-2">
                          Mutation Overrides — set these in your tool for {item.brainrotName}:
                        </div>
                        <div className="d-flex flex-wrap gap-2">
                          {overrides.map((a: MutationAdvisory) => (
                            <div key={a.mutation} className="d-flex items-center gap-2 p-2 advisory-override">
                              <span className="fw-700" style={{ color: MUTATION_COLORS[a.mutation] || 'var(--text)' }}>{a.mutation}</span>
                              {a.multiplier > 0 && <span className="text-xs text-muted">{a.multiplier}x</span>}
                              <span className="text-green text-mono">med {fmtPrice(a.medianPrice)}</span>
                              <span className="text-muted">{a.priceRatio}x base</span>
                              <span className="text-orange fw-700 text-mono text-md">
                                → {fmtMinValue(a.recommendedOverride)}
                              </span>
                              <span className="text-muted text-xs">{a.listings}L</span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
});
