'use client';

import useSWR from 'swr';
import type { DashData } from './types';

const fetcher = (url: string) => fetch(url).then(r => {
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}).then((d: DashData) => {
  if ((d as any).error) throw new Error((d as any).error);
  return d;
}).catch(err => {
  throw new Error(err instanceof Error ? err.message : 'Failed to fetch data');
});

export function useData() {
  const { data, error, isLoading, mutate } = useSWR<DashData>('/api/data', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    dedupingInterval: 60000,     // Don't re-fetch within 60s
    refreshInterval: 5 * 60000,  // Auto-refresh every 5 min
    errorRetryCount: 3,
    errorRetryInterval: 5000,
  });

  return {
    data: data ?? null,
    error: error?.message ?? null,
    isLoading,
    refresh: mutate,
  };
}
