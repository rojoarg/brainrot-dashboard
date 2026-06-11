/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone server output so the Electron shell can run the app
  // without node_modules; better-sqlite3 is native and must stay external.
  output: 'standalone',
  serverExternalPackages: ['better-sqlite3'],
  // Desktop app: no image-optimization backend; thumbnails come pre-sized
  // from Eldorado's CDN.
  images: { unoptimized: true },
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
      // /api/data sets its own Cache-Control + ETag in the route handler
      // (no-cache → store-and-revalidate, enabling 304s). No override here.
    ];
  },
};

module.exports = nextConfig;
