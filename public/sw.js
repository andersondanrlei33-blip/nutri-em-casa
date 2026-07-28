/**
 * Service Worker do Nutri em Casa.
 * Estratégia: "network first, fallback to cache" para navegação e dados,
 * e "cache first" para assets estáticos — garante que o usuário sempre
 * veja dados atualizados quando online, mas o app continua abrindo
 * (com a última versão em cache) quando offline.
 */
const CACHE_VERSAO = "nutri-em-casa-v1";
const ASSETS_ESSENCIAIS = ["/", "/dashboard", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSAO).then((cache) => cache.addAll(ASSETS_ESSENCIAIS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((chaves) =>
      Promise.all(chaves.filter((chave) => chave !== CACHE_VERSAO).map((chave) => caches.delete(chave)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Nunca cacheia chamadas de API/autenticação — sempre precisam ser frescas.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  event.respondWith(
    fetch(request)
      .then((resposta) => {
        const copia = resposta.clone();
        caches.open(CACHE_VERSAO).then((cache) => cache.put(request, copia)).catch(() => {});
        return resposta;
      })
      .catch(() => caches.match(request).then((cacheado) => cacheado || caches.match("/")))
  );
});
