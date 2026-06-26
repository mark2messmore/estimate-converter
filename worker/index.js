// Models tried in order. The first is the primary; the rest are fallbacks.
// If Anthropic retires the primary (404 not_found_error), the request path
// transparently rides the next one, and the daily cron Telegram-alerts you
// to top this list back up. To change models, edit this line and redeploy.
const MODELS = ['claude-sonnet-4-6', 'claude-opus-4-8'];
const MAX_TOKENS = 4000;

const ANTHROPIC_MESSAGES = 'https://api.anthropic.com/v1/messages';
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

// Runs a tiny REAL extraction against one model — the true end-to-end test of
// the pipeline (key valid & funded, Anthropic reachable, model serving, shape ok).
// Costs ~a dozen tokens. Classifies the outcome:
//   'working'      200 — pipeline healthy on this model
//   'retired'      404 not_found — model id no longer exists
//   'auth'         401/403 — API key invalid, expired, or revoked
//   'rate_limited' 429 — over rate limit or, often, out of credits/quota
//   'error'        5xx / network — transient, don't over-react
async function probeModel(env, model) {
  try {
    const r = await fetch(ANTHROPIC_MESSAGES, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': ANTHROPIC_VERSION
      },
      body: JSON.stringify({
        model,
        max_tokens: 16,
        messages: [{ role: 'user', content: 'Reply with the single word: OK' }]
      })
    });
    if (r.status === 200) return 'working';
    if (r.status === 401 || r.status === 403) return 'auth';
    if (r.status === 429) return 'rate_limited';
    const data = await r.json().catch(() => ({}));
    if (r.status === 404 && data?.error?.type === 'not_found_error') return 'retired';
    return 'error';
  } catch {
    return 'error';
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

// Builds and sends the daily 6am status report. Probes each model with a real
// extraction (see probeModel). Always sends one message; tone escalates with
// severity so a routine ✅ never looks like an outage.
async function sendDailyStatus(env) {
  if (!env.ANTHROPIC_API_KEY) return;

  const results = {};
  for (const m of MODELS) results[m] = await probeModel(env, m);

  const primary = MODELS[0];
  const working = MODELS.find(m => results[m] === 'working');
  const any = s => MODELS.some(m => results[m] === s);

  const icon = { working: '✅', retired: '❌', auth: '🔑', rate_limited: '⏳', error: '❔' };
  const label = { working: 'working', retired: 'retired', auth: 'key rejected', rate_limited: 'rate-limited', error: 'unverified' };
  const detail = MODELS.map(m => `${icon[results[m]]} <code>${m}</code> — ${label[results[m]]}`).join('\n');

  let head;
  if (results[primary] === 'working') {
    head = `✅ <b>Purchase Req Helper — all systems normal</b>\nLive end-to-end extraction on <code>${primary}</code> passed.`;
  } else if (working) {
    head = `⚠️ <b>Purchase Req Helper</b>\nPrimary <code>${primary}</code> isn't serving (${label[results[primary]]}), ` +
      `but extraction works on <code>${working}</code>. Refresh the MODELS list and redeploy.`;
  } else if (any('auth')) {
    head = `🚨 <b>Purchase Req Helper — EXTRACTION DOWN</b>\nThe Anthropic API key is being rejected ` +
      `(invalid, expired, or revoked). Rotate ANTHROPIC_API_KEY and redeploy.`;
  } else if (any('rate_limited')) {
    head = `🚨 <b>Purchase Req Helper — extraction failing</b>\nEvery model hit rate-limit/quota errors ` +
      `— likely out of credits or over the limit. Check the Anthropic billing/usage dashboard.`;
  } else if (MODELS.every(m => results[m] === 'retired')) {
    head = `🚨 <b>Purchase Req Helper — EXTRACTION DOWN</b>\nEvery configured model is retired. ` +
      `Add a current model to MODELS in worker/index.js and redeploy.`;
  } else {
    head = `❔ <b>Purchase Req Helper — status unverified</b>\nThe Anthropic API returned transient errors ` +
      `during the check. Extraction may be fine; will recheck tomorrow.`;
  }

  await notifyTelegram(env, `${head}\n\n${detail}`);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/extract') return handleExtract(request, env);
    return env.ASSETS.fetch(request);
  },

  // Two UTC crons (11:00 + 12:00, in wrangler.toml) bracket 6am US Central
  // across DST; this guard makes exactly one of them fire at 6:00am
  // America/Chicago year-round, then sends the daily status report.
  async scheduled(controller, env, ctx) {
    const hour = Number(new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago', hour: 'numeric', hour12: false
    }).format(new Date(controller.scheduledTime)));
    if (hour !== 6) return;
    ctx.waitUntil(sendDailyStatus(env));
  }
};
