/**
 * 小杜 · Supabase 反向代理 + 声网 Token（Cloudflare Worker）
 * 作用：
 *  1) 让被运营商拦截的 supabase.co 通过 workers.dev 域名访问；
 *  2) 给视频通话签发声网 Token（App Certificate 不放进前端，安全）。
 * 部署：Cloudflare 后台 → Workers & Pages → 选你建好的 Worker → 编辑代码 → 粘贴本文件 → 部署
 */
const UPSTREAM = 'https://dxibubacwhdsibiggqgg.supabase.co';

/* ===== 声网 ===== */
const AGORA_APP_ID = '7bec2e5a65b5473aaed7b65abb773cc0';
/* 把 console.agora.io → 项目 → App Certificate 那串 32 位字符粘到下面引号里 */
const AGORA_APP_CERT = '';

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '*';
  const reqHeaders = request.headers.get('Access-Control-Request-Headers') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD',
    'Access-Control-Allow-Headers': reqHeaders,
    'Access-Control-Expose-Headers': '*',
    'Access-Control-Max-Age': '86400'
  };
}

/* ---------- 声网 Token 生成（AccessToken2 / RTC） ---------- */
function b64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function u16(v) {
  return new Uint8Array([v & 255, (v >>> 8) & 255]);
}
function u32(v) {
  v = v >>> 0;
  return new Uint8Array([v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]);
}
function cat(list) {
  let n = 0;
  for (const a of list) n += a.length;
  const out = new Uint8Array(n);
  let p = 0;
  for (const a of list) {
    out.set(a, p);
    p += a.length;
  }
  return out;
}
function strField(s) {
  const b = new TextEncoder().encode(s);
  return cat([u16(b.length), b]);
}
function bytesField(b) {
  return cat([u16(b.length), b]);
}
async function hmac(key, msg) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, msg));
}
async function deflate(bytes) {
  const cs = new CompressionStream('deflate');
  const res = new Response(new Blob([bytes]).stream().pipeThrough(cs));
  return new Uint8Array(await res.arrayBuffer());
}

async function buildAgoraToken(channel, uid, expireSec) {
  if (!AGORA_APP_CERT) return '';
  const issueTs = Math.floor(Date.now() / 1000);
  const salt = Math.floor(Math.random() * 99999999) + 1;
  const priv = issueTs + expireSec;

  const s0 = await hmac(u32(issueTs), new TextEncoder().encode(AGORA_APP_CERT));
  const signing = await hmac(u32(salt), s0);

  const service = cat([
    u16(1), // RTC service
    u16(4), // 4 个权限
    u16(1), u32(priv), // join channel
    u16(2), u32(priv), // publish audio
    u16(3), u32(priv), // publish video
    u16(4), u32(priv), // publish data
    strField(channel),
    strField(uid ? String(uid) : '')
  ]);
  const info = cat([
    strField(AGORA_APP_ID),
    u32(issueTs),
    u32(expireSec),
    u32(salt),
    u16(1), // 服务数量
    service
  ]);
  const signature = await hmac(signing, info);
  const content = cat([bytesField(signature), info]);
  return '007' + b64(await deflate(content));
}

async function handleAgoraToken(request, url) {
  const headers = corsHeaders(request);
  headers['Content-Type'] = 'application/json; charset=utf-8';
  const channel = String(url.searchParams.get('channel') || '').slice(0, 64);
  const uid = parseInt(url.searchParams.get('uid') || '0', 10) || 0;
  if (!channel) {
    return new Response(JSON.stringify({ error: 'channel required' }), { status: 400, headers });
  }
  if (!AGORA_APP_CERT) {
    return new Response(JSON.stringify({ error: 'AGORA_APP_CERT not configured' }), { status: 500, headers });
  }
  try {
    const token = await buildAgoraToken(channel, uid, 3600);
    return new Response(JSON.stringify({ token: token, expire: 3600 }), { status: 200, headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e && e.message) || e) }), { status: 500, headers });
  }
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    // 声网 Token
    if (url.pathname === '/agora-token') {
      return handleAgoraToken(request, url);
    }

    const target = UPSTREAM + url.pathname + url.search;
    const headers = new Headers(request.headers);
    headers.delete('host');

    // WebSocket（Realtime 实时消息、在线状态）
    if ((request.headers.get('Upgrade') || '').toLowerCase() === 'websocket') {
      return fetch(target, { method: 'GET', headers });
    }

    const init = { method: request.method, headers, redirect: 'follow' };
    if (request.method !== 'GET' && request.method !== 'HEAD') init.body = request.body;

    const res = await fetch(target, init);
    const out = new Response(res.body, res);
    const c = corsHeaders(request);
    for (const k in c) out.headers.set(k, c[k]);
    return out;
  },

  /* 保活：Supabase 免费版 7 天无请求会被暂停，这里每 2 天自动访问一次 */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      fetch(UPSTREAM + '/auth/v1/health', { headers: { apikey: 'keepalive' } }).catch(() => {})
    );
  }
};
