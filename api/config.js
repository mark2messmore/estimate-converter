// Try to use Vercel KV if available, otherwise fall back to in-memory
let kv = null;
try {
  const kvModule = await import('@vercel/kv');
  kv = kvModule.kv;
} catch (e) {
  console.log('Vercel KV not available, using in-memory storage');
}

const CONFIG_KEY = 'model_config';

// Default config
const DEFAULT_CONFIG = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514'
};

// In-memory fallback
let memoryConfig = { ...DEFAULT_CONFIG };

// Available providers and their models
export const PROVIDERS = {
  anthropic: {
    name: 'Anthropic',
    models: [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
      { id: 'claude-opus-4-20250514', name: 'Claude Opus 4' },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' }
    ],
    envKey: 'ANTHROPIC_API_KEY'
  },
  google: {
    name: 'Google',
    models: [
      { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' }
    ],
    envKey: 'GOOGLE_API_KEY'
  },
  openai: {
    name: 'OpenAI',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' }
    ],
    envKey: 'OPENAI_API_KEY'
  }
};

export async function getConfig() {
  // Try KV first
  if (kv) {
    try {
      const config = await kv.get(CONFIG_KEY);
      if (config) return config;
    } catch (error) {
      console.error('KV read error:', error);
    }
  }
  // Fall back to memory
  return memoryConfig;
}

export async function setConfig(provider, model) {
  if (!PROVIDERS[provider]) {
    throw new Error(`Unknown provider: ${provider}`);
  }
  const validModel = PROVIDERS[provider].models.find(m => m.id === model);
  if (!validModel) {
    throw new Error(`Unknown model: ${model} for provider ${provider}`);
  }

  const config = { provider, model };

  // Try to save to KV
  if (kv) {
    try {
      await kv.set(CONFIG_KEY, config);
    } catch (error) {
      console.error('KV write error:', error);
    }
  }

  // Always update memory
  memoryConfig = config;
  return config;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET - return current config and available providers
  if (req.method === 'GET') {
    const current = await getConfig();
    return res.status(200).json({
      current,
      providers: PROVIDERS,
      storage: kv ? 'kv' : 'memory'
    });
  }

  // POST - update config (requires admin password)
  if (req.method === 'POST') {
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
      return res.status(500).json({ error: 'Admin password not configured. Set ADMIN_PASSWORD env var.' });
    }

    const { password, provider, model } = req.body;

    if (password !== adminPassword) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    try {
      const newConfig = await setConfig(provider, model);
      return res.status(200).json({ success: true, config: newConfig });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
