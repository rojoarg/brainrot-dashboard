/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone server output so the Electron shell can run the app
  // without node_modules; better-sqlite3 is native and must stay external.
  output: 'standalone',
  serverExternalPackages: ['better-sqlite3'],
  // File tracing sees the process.cwd()/data/brainrot.db reference in lib/db.ts
  // and would bundle the local dev DB (~80MB) into the installer. Never ship it.
  outputFileTracingExcludes: { '*': ['./data/**'] },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      {
        source: '/api/data',
        headers: [
          { key: 'Cache-Control', value: 's-maxage=30, stale-while-revalidate=60' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
