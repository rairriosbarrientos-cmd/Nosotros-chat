import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        // El service worker nunca debe quedar cacheado por el navegador
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default config;
