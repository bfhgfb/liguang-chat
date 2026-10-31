/* 小杜 Service Worker · 离线缓存 */
const CACHE = 'xiaodu-v6'
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png']

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(cache => cache.addAll(SHELL))
      .catch(() => {})
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/socket.io') || url.pathname.startsWith('/uploads')) return

  // 视频/图片等媒体直接走浏览器原生请求，避免缓存住旧视频导致“视频不更新”
  if (/\.(mp4|webm|mov|m4v)$/i.test(url.pathname) || req.headers.has('range')) return

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req, { cache: 'reload' })
        .then(res => {
          const copy = res.clone()
          caches.open(CACHE).then(cache => cache.put('./index.html', copy)).catch(() => {})
          return res
        })
        .catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    )
    return
  }

  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached
      return fetch(req)
        .then(res => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone()
            caches.open(CACHE).then(cache => cache.put(req, copy)).catch(() => {})
          }
          return res
        })
        .catch(() => cached)
    })
  )
})
