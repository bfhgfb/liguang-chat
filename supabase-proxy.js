/**
 * 小杜 · Supabase 反向代理（Cloudflare Worker）
 * 作用：让被运营商拦截的 supabase.co 通过 workers.dev 域名访问。
 * 部署：Cloudflare 后台 → Workers & Pages → 新建 Worker → 粘贴本文件 → 部署
 * 只需要改下面这一行（如果以后换 Supabase 项目）：
 */
const UPSTREAM = 'https://dxibubacwhdsibiggqgg.supabase.co';

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

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
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
  }
};
