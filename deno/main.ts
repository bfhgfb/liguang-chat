/**
 * 小杜 · Deno Deploy 中转线路
 * 作用：把 https://xxx.deno.dev 的请求转发到 Supabase，让域名被运营商拦截的手机也能登录。
 *
 * 部署（手机浏览器即可）：
 *  1. 打开 https://dash.deno.com 用 GitHub 登录
 *  2. 新建 Playground（或 New Project → Playground）
 *  3. 把本文件全部内容粘进去，点 Deploy
 *  4. 得到一个 https://xxxx.deno.dev 地址，把它发我
 */

const UPSTREAM = "https://dxibubacwhdsibiggqgg.supabase.co";
const PATHS = ["/auth", "/rest", "/storage", "/realtime", "/functions"];

function cors(req: Request): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": req.headers.get("origin") || "*",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD",
    "Access-Control-Allow-Headers": req.headers.get("access-control-request-headers") || "*",
    "Access-Control-Expose-Headers": "*",
    "Access-Control-Max-Age": "86400",
  };
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const hit = PATHS.some((p) => url.pathname === p || url.pathname.startsWith(p + "/"));

  /* 直接打开首页会看到这句话，方便确认部署成功 */
  if (!hit) {
    return new Response("小杜线路正常", {
      headers: { "content-type": "text/plain; charset=utf-8", ...cors(req) },
    });
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors(req) });
  }

  const target = UPSTREAM + url.pathname + url.search;

  /* 实时消息（WebSocket）需要双向转发 */
  if ((req.headers.get("upgrade") || "").toLowerCase() === "websocket") {
    const { socket, response } = Deno.upgradeWebSocket(req);
    const ws = new WebSocket(target.replace(/^http/, "ws"));
    socket.onmessage = (e) => {
      try { ws.send(e.data); } catch { /* 对端已关 */ }
    };
    ws.onmessage = (e) => {
      try { socket.send(e.data); } catch { /* 对端已关 */ }
    };
    socket.onclose = (e) => {
      try { ws.close(e.code, e.reason); } catch { /* ignore */ }
    };
    ws.onclose = (e) => {
      try { socket.close(e.code, e.reason); } catch { /* ignore */ }
    };
    socket.onerror = () => {
      try { ws.close(); } catch { /* ignore */ }
    };
    ws.onerror = () => {
      try { socket.close(); } catch { /* ignore */ }
    };
    return response;
  }

  const headers = new Headers();
  for (const [k, v] of req.headers) {
    const lk = k.toLowerCase();
    if (lk === "host" || lk === "connection" || lk === "content-length") continue;
    headers.set(k, v);
  }

  const init: RequestInit = { method: req.method, headers, redirect: "follow" };
  if (req.method !== "GET" && req.method !== "HEAD") init.body = req.body;

  const res = await fetch(target, init);
  const outHeaders = new Headers(res.headers);
  outHeaders.delete("content-encoding");
  outHeaders.delete("content-length");
  outHeaders.delete("transfer-encoding");
  for (const [k, v] of Object.entries(cors(req))) outHeaders.set(k, v);

  return new Response(res.body, { status: res.status, headers: outHeaders });
});
