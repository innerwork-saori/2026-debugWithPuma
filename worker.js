// 意見回饋 API：POST /api/feedback，存進 Cloudflare D1。
// 其他網址都由 wrangler.jsonc 的 assets 直接回靜態檔，不會跑到這裡。
//
// 防灌水依序檢查，任何一關沒過就不寫入：
// 陷阱欄位 → 欄位格式 → 每個 IP 每分鐘 5 則 → Turnstile 驗證 → 每日總量上限（DAILY_CAP）
// IP 只拿來限流和送 Turnstile 驗證，不存進資料庫。

const KINDS = ['idea', 'bug', 'other'];
const MESSAGE_MAX = 1000;
const PAGE_MAX = 100;
const UA_MAX = 300;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

// 台灣時間今天 00:00，換成 UTC 的 ISO 字串，和 created_at 直接比大小
function startOfTaipeiDay(now = Date.now()) {
  const offset = 8 * 3600 * 1000;
  const day = Math.floor((now + offset) / 86400000) * 86400000;
  return new Date(day - offset).toISOString();
}

async function verifyTurnstile(token, ip, secret) {
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  const data = await res.json();
  // 沒通過時把原因記下來（Cloudflare 後台 Worker 的 Logs 看得到），例如 invalid-input-secret 代表密鑰設錯
  if (data.success !== true) console.log('Turnstile 沒通過', JSON.stringify(data['error-codes']));
  return data.success === true;
}

async function handleFeedback(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'bad_request' }, 400);
  }

  // 真人看不到這個欄位，有填就是機器人。假裝成功，不讓它知道被擋
  if (body.website) return json({ ok: true });

  const kind = String(body.kind ?? '');
  const message = String(body.message ?? '').trim();
  const page = String(body.page ?? '').slice(0, PAGE_MAX);
  const token = String(body.token ?? '');
  if (!KINDS.includes(kind) || !message || message.length > MESSAGE_MAX || !token) {
    return json({ ok: false, error: 'bad_request' }, 400);
  }

  const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
  const { success: underLimit } = await env.FEEDBACK_LIMIT.limit({ key: ip });
  if (!underLimit) return json({ ok: false, error: 'too_fast' }, 429);

  // 忘了用 wrangler secret put 或後台設定密鑰時，跟「驗證沒通過」分開，比較好查
  if (!env.TURNSTILE_SECRET) {
    console.error('沒有設定 TURNSTILE_SECRET');
    return json({ ok: false, error: 'not_configured' }, 500);
  }
  if (!(await verifyTurnstile(token, ip, env.TURNSTILE_SECRET))) {
    return json({ ok: false, error: 'not_verified' }, 403);
  }

  const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM feedback WHERE created_at >= ?')
    .bind(startOfTaipeiDay()).first();
  if (n >= Number(env.DAILY_CAP)) return json({ ok: false, error: 'full' }, 503);

  const ua = (request.headers.get('User-Agent') ?? '').slice(0, UA_MAX);
  await env.DB.prepare('INSERT INTO feedback (created_at, kind, message, page, ua) VALUES (?, ?, ?, ?, ?)')
    .bind(new Date().toISOString(), kind, message, page, ua).run();
  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/feedback') {
      if (request.method !== 'POST') return json({ ok: false, error: 'method' }, 405);
      return handleFeedback(request, env);
    }
    return json({ ok: false, error: 'not_found' }, 404);
  },
};
