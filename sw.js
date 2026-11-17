/* 小杜 Service Worker · 离线缓存 + 消息通知 */
const CACHE = 'xiaodu-v55'
const SHELL = ['./', './index.html', './manifest.webmanifest', './agora.js', './icons/icon-192.png', './icons/icon-512.png']

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

/* ---------- 消息 / 来电通知 ---------- */
self.addEventListener('push', event => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (e) {
    data = {}
  }
  const title = data.title || '新消息'
  const body = data.body || ''

  event.waitUntil(
    (async () => {
      try {
        const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        const visible = list.some(c => c.visibilityState === 'visible')
        if (visible) return
      } catch (e) {}

      const isCall = !!data.requireInteraction
      await self.registration.showNotification(title, {
        body,
        icon: './icons/icon-192.png',
        badge: './icons/icon-192.png',
        tag: data.tag || 'lg-message',
        renotify: true,
        requireInteraction: isCall,
        vibrate: isCall ? [300, 120, 300, 120, 300] : [120],
        data: { url: data.url || './' }
      })
    })()
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || './'

  event.waitUntil(
    (async () => {
      try {
        const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        if (list.length) {
          const c = list[0]
          try {
            await c.focus()
          } catch (e) {}
          c.postMessage({ type: 'lg-navigate', url: target })
          return
        }
      } catch (e) {}
      try {
        await self.clients.openWindow(target)
      } catch (e) {}
    })()
  )
})
