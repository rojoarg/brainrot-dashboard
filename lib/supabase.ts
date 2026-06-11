import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * True when both Supabase env vars are present. API routes must check this
 * and return a 503 with a clear message instead of touching the client.
 *
 * IMPORTANT: do NOT throw at module load — that crashes every API route at
 * import time with an opaque 500 and takes the whole dashboard down.
 * Locally, copy .env.local.example to .env.local and fill in the values
 * (they live in Vercel → Project → Settings → Environment Variables).
 */
export const supabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

export const SUPABASE_MISSING_MSG =
  'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY ' +
  '(locally: copy .env.local.example to .env.local; in production: Vercel env vars).';

// Lazy-throwing stand-in so accidental use without config fails with a clear
// message at call time instead of crashing the module graph at import time.
export const supabase: SupabaseClient = supabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : (new Proxy({}, {
      get() { throw new Error(SUPABASE_MISSING_MSG); },
    }) as unknown as SupabaseClient);
