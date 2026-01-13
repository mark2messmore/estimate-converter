import { getConfig, PROVIDERS } from './config.js';
import { callProvider } from './providers.js';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { content } = req.body;

    if (!content || !Array.isArray(content)) {
      return res.status(400).json({ error: 'Invalid request: content array required' });
    }

    // Get current provider/model config (from KV store)
    const config = await getConfig();
    const providerConfig = PROVIDERS[config.provider];

    if (!providerConfig) {
      return res.status(500).json({ error: `Unknown provider: ${config.provider}` });
    }

    // Get API key for the selected provider
    const apiKey = process.env[providerConfig.envKey];

    if (!apiKey) {
      return res.status(500).json({
        error: `API key not configured for ${providerConfig.name}. Set ${providerConfig.envKey} in environment.`
      });
    }

    // Call the provider
    const result = await callProvider(config.provider, apiKey, config.model, content);

    // Return response in Anthropic-compatible format for backward compatibility
    return res.status(200).json({
      content: [{ type: 'text', text: result.text }],
      model: result.model,
      usage: result.usage,
      provider: config.provider
    });

  } catch (error) {
    console.error('Proxy error:', error);

    if (error.status && error.data) {
      return res.status(error.status).json(error.data);
    }

    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
