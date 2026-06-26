// Models tried in order. The first is the primary; the rest are fallbacks.
// If Anthropic retires the primary (404 not_found_error), the request path
// transparently rides the next one, and the daily cron Telegram-alerts you
// to top this list back up. To change models, edit this line and redeploy.
const MODELS = ['claude-sonnet-4-6', 'claude-opus-4-8'];
const MAX_TOKENS = 4000;

const ANTHROPIC_MESSAGES = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODELS = 'https://api.anthropic.com/v1/models';
const ANTHROPIC_VERSION = '2023-06-01';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

const json = (body, init = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...CORS, ...(init.headers || {}) }
  });

// A 404 with this error type means "that model id no longer exists" — the only
// case we fall through to a fallback. Every other status (200, 401, 429, 5xx)
// is about the request or the API, not the model, so we return it unchanged.
const isModelGone = (status, data) =>
  status === 404 && data?.error?.type === 'not_found_error';

async function handleExtract(request, env) {
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });

  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
  }

  const { content } = await request.json();
  if (!Array.isArray(content)) {
    return json({ error: 'Invalid request: content array required' }, { status: 400 });
  }

  // Try each model in order; only advance to the next when the current one is retired.
  let last;
  for (const model of MODELS) {
    const upstream = await fetch(ANTHROPIC_MESSAGES, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': ANTHROPIC_VERSION
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'user', content }]
      })
    });

    const data = await upstream.json();
    last = json(data, { status: upstream.status });
    if (isModelGone(upstream.status, data)) continue; // retired — try the next model
    return last;
  }

  return last; // every model retired — return the last 404 so the client sees a real error
}

// --- Daily model-health check (cron) ---------------------------------------

// 'alive' (200) | 'retired' (404) | 'unknown' (anything else / network error).
// 'unknown' covers transient API trouble (429/5xx/timeout) and auth issues —
// we deliberately do NOT alert on those, only on a definitive retirement.
async function modelStatus(env, model) {
  try {
    const r = await fetch(`${ANTHROPIC_MODELS}/${model}`, {
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': ANTHROPIC_VERSION }
    });
    if (r.status === 200) return 'alive';
    if (r.status === 404) return 'retired';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

async function notifyTelegram(env, text) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return; // not configured yet — silently skip
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
  });
}

// Uses the free Models API (no tokens billed). Alerts ONLY when the primary
// model is definitively retired — no daily "all good" spam.
async function checkModelHealth(env) {
  if (!env.ANTHROPIC_API_KEY) return;

  const statuses = {};
  for (const m of MODELS) statuses[m] = await modelStatus(env, m);

  const primary = MODELS[0];
  if (statuses[primary] !== 'retired') return; // primary fine (or only a transient blip) — stay quiet

  const aliveFallback = MODELS.find(m => statuses[m] === 'alive');
  const icon = s => (s === 'alive' ? '✅' : s === 'retired' ? '❌' : '❔');
  const detail = MODELS.map(m => `${icon(statuses[m])} <code>${m}</code> — ${statuses[m]}`).join('\n');

  const head = aliveFallback
    ? `⚠️ <b>Purchase Req Helper</b>\nPrimary model <code>${primary}</code> is RETIRED.\n` +
      `Extraction still works on fallback <code>${aliveFallback}</code> — update the MODELS list in ` +
      `worker/index.js and redeploy to restore a fresh primary + fallback.`
    : `🚨 <b>Purchase Req Helper — EXTRACTION DOWN</b>\nEvery configured model is retired. ` +
      `Add a current model to MODELS in worker/index.js and redeploy.`;

  await notifyTelegram(env, `${head}\n\n${detail}`);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/extract') return handleExtract(request, env);
    return env.ASSETS.fetch(request);
  },

  // Fires on the cron schedule in wrangler.toml (daily, UTC).
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(checkModelHealth(env));
  }
};
