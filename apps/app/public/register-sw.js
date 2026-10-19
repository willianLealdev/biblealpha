// Service worker (gerado pelo Workbox no build). Só em produção: em desenvolvimento o cache atrapalha.
// Arquivo separado (não inline) para a política de segurança (CSP) permitir apenas scripts do próprio site.
if ('serviceWorker' in navigator && location.hostname !== 'localhost') {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function (error) {
      console.error('Service worker registration failed:', error);
    });
  });
}
