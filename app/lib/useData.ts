'use client';

import useSWR from 'swr';
import type { DashData } from './types';

const fetcher = async (url: string): Promise<DashData> => {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    console.error('Data fetch error:', err);
    throw new Error('Network error loading market data. Check your connection and refresh.');
  }
  // Read the body even on errors — the API returns clear messages
  // (e.g. 503 "Supabase is not configured...") that we want to show.
  let body: any = null;
  try { body = await res.json(); } catch { /* non-JSON error body */ }
  if (!res.ok || body?.error) {
    const msg = body?.error || `HTTP ${res.status} loading market data. Please refresh.`;
    console.error('Data fetch error:', msg);
    throw new Error(msg);
  }
  return body as DashData;
};

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
