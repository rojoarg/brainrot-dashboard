'use client';

import React from 'react';
import { RARITY_COLORS, TIER_CLS } from '../lib/constants';

/* ─── Stat Card — Animated value with gradient depth ─── */
export const StatCard = React.memo(function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={color ? { color } : undefined}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
});

/* ─── Stat Card Skeleton ─── */
export const StatCardSkeleton = React.memo(function StatCardSkeleton() {
  return (
    <div className="stat-card" style={{ pointerEvents: 'none' }}>
      <div className="skeleton skeleton-text-sm" style={{ width: '50%' }} />
      <div className="skeleton" style={{ height: 28, width: '70%', marginTop: 6, borderRadius: 4 }} />
      <div className="skeleton skeleton-text-sm" style={{ width: '40%', marginTop: 4 }} />
    </div>
  );
});

/* ─── Tier Badge ─── */
export const TierBadge = React.memo(function TierBadge({ tier }: { tier: string }) {
  return <span className={`badge tier-badge ${TIER_CLS[tier] || 'tier-D'}`}>{tier}</span>;
});

/* ─── Rarity Badge ─── */
export const RarityBadge = React.memo(function RarityBadge({ rarity }: { rarity: string }) {
  const c = RARITY_COLORS[rarity] || '#666';
  return <span className="badge badge-rarity" style={{ color: c, borderLeft: `2px solid ${c}` }}>{rarity}</span>;
});

/* ─── Watchlist Button ─── */
export const WLButton = React.memo(function WLButton({ name, isOnWL, onAdd, onRemove }: { name: string; isOnWL: boolean; onAdd: (n: string) => void; onRemove: (n: string) => void }) {
  return isOnWL
    ? <button type="button" className="btn btn-success btn-sm" onClick={(e) => { e.stopPropagation(); onRemove(name); }} aria-label={`Remove ${name} from watchlist`}>★ WL</button>
    : <button type="button" className="btn btn-sm btn-ghost" onClick={(e) => { e.stopPropagation(); onAdd(name); }} aria-label={`Add ${name} to watchlist`}>+ WL</button>;
});

/* ─── Image Thumbnail ─── */
const ALLOWED_IMAGE_HOSTS = ['eldorado.gg', 'cdn.eldorado.gg', 'assets.eldorado.gg', 'img.eldorado.gg'];
function isValidImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && ALLOWED_IMAGE_HOSTS.some(h => u.hostname === h || u.hostname.endsWith('.' + h));
  } catch { return false; }
}
export const ImageThumb = React.memo(function ImageThumb({ src, size = 28, alt = '' }: { src?: string; size?: number; alt?: string }) {
  if (!src || !isValidImageUrl(src)) return <div className="img-placeholder" style={{ width: size, height: size }} role="img" aria-label={alt || 'No image'} />;
  return <img src={src} width={size} height={size} className="img-thumb" alt={alt} loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />;
});

/* ─── Trust Badge ─── */
export const TrustBadge = React.memo(function TrustBadge({ score }: { score: number }) {
  const s = isFinite(score) ? score : 0;
  const c = s >= 85 ? 'var(--green)' : s >= 60 ? 'var(--gold)' : 'var(--red)';
  return <span className="trust-score" style={{ color: c }}>{s}%</span>;
});

/* ─── Search Input ─── */
export const SearchInput = React.memo(function SearchInput({ value, onChange, placeholder = 'Search...', maxWidth = 240 }: { value: string; onChange: (v: string) => void; placeholder?: string; maxWidth?: number }) {
  return (
    <div className="search-input-wrap" style={{ maxWidth }}>
      <span className="search-icon">{'\uD83D\uDD0D'}</span>
      <input type="text" className="input search-input" placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} aria-label={placeholder} autoComplete="off" />
      {value && <button type="button" className="search-clear" onClick={() => onChange('')} aria-label="Clear search">{'\u2715'}</button>}
    </div>
  );
});

/* ─── Filter Bar ─── */
export function FilterBar({ children }: { children: React.ReactNode }) {
  return <div className="filter-bar">{children}</div>;
}

/* ─── Sparkline ─── */
export const Sparkline = React.memo(function Sparkline({ data: d, color = 'var(--accent)', width = 60, height = 20 }: { data: number[]; color?: string; width?: number; height?: number }) {
  if (!d || d.length < 2) return null;
  const min = Math.min(...d);
  const max = Math.max(...d);
  const range = max - min || 1;
  const points = d.map((v, i) => `${(i / (d.length - 1)) * width},${height - ((v - min) / range) * height}`).join(' ');
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <defs>
        <linearGradient id={`spark-${color.replace(/[^a-z0-9]/gi, '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polyline fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
});

/* ─── Empty State ─── */
export const EmptyState = React.memo(function EmptyState({ message, sub }: { message: string; sub?: string }) {
  return (
    <div className="empty-state">
      <div className="empty-state-title">{message}</div>
      {sub && <div className="empty-state-sub">{sub}</div>}
    </div>
  );
});

/* ─── Dashboard Skeleton — Full loading state ─── */
export function DashboardSkeleton() {
  return (
    <div className="dashboard-wrap" style={{ pointerEvents: 'none' }}>
      {/* Header skeleton */}
      <div className="dash-header">
        <div className="d-flex items-center gap-2 mb-2">
          <div className="skeleton" style={{ height: 32, width: 280, borderRadius: 6 }} />
          <div className="skeleton" style={{ height: 20, width: 50, borderRadius: 4 }} />
        </div>
        <div className="d-flex gap-3">
          {[100, 80, 70, 90].map((w, i) => (
            <div key={i} className="skeleton" style={{ height: 14, width: w, borderRadius: 3 }} />
          ))}
        </div>
      </div>

      {/* Tab nav skeleton */}
      <div className="skeleton" style={{ height: 48, width: '100%', borderRadius: 14, marginBottom: 24 }} />

      {/* Stat cards skeleton */}
      <div className="skeleton-grid-stats" style={{ marginBottom: 24 }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="skeleton skeleton-stat" style={{ animationDelay: `${i * 60}ms` }} />
        ))}
      </div>

      {/* Charts skeleton */}
      <div className="skeleton-grid-charts" style={{ marginBottom: 24 }}>
        <div className="skeleton skeleton-chart" style={{ animationDelay: '100ms' }} />
        <div className="skeleton skeleton-chart" style={{ animationDelay: '160ms' }} />
      </div>

      {/* Table skeleton */}
      <div className="skeleton" style={{ height: 300, width: '100%', borderRadius: 20 }} />
    </div>
  );
}
