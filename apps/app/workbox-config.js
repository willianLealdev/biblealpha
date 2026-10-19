// Gera dist/sw.js depois do `expo export`. Guarda o app em cache para abrir offline.
// A API (/api) nunca é guardada em cache: dados de conta sempre vêm do servidor.
module.exports = {
  globDirectory: 'dist/',
  globPatterns: ['**/*.{js,html,css,ttf,otf,woff2,ico,png,json}'],
  globIgnores: ['sw.js', 'workbox-*.js'],
  swDest: 'dist/sw.js',
  maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
  navigateFallback: '/index.html',
  navigateFallbackDenylist: [/^\/api\//],
  cleanupOutdatedCaches: true,
  clientsClaim: true,
  skipWaiting: true,
};
