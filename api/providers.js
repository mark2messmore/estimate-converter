// Provider adapters - each converts the common request format to provider-specific API calls

export async function callAnthropic(apiKey, model, content) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: model,
      max_tokens: 4000,
      messages: [{ role: 'user', content: content }]
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw { status: response.status, data };
  }

  // Normalize response format
  return {
    text: data.content?.[0]?.text || '',
    usage: data.usage,
    model: data.model,
    raw: data
  };
}

export async function callGoogle(apiKey, model, content) {
  // Convert content array to Gemini format
  const parts = content.map(item => {
    if (item.type === 'text') {
      return { text: item.text };
    } else if (item.type === 'image') {
      return {
        inline_data: {
          mime_type: item.source.media_type,
          data: item.source.data
        }
      };
    } else if (item.type === 'document' && item.source.media_type === 'application/pdf') {
      return {
        inline_data: {
          mime_type: 'application/pdf',
          data: item.source.data
        }
      };
    }
    return { text: JSON.stringify(item) };
  });

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { maxOutputTokens: 4000 }
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw { status: response.status, data };
  }

  // Normalize response format
  return {
    text: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
    usage: data.usageMetadata,
    model: model,
    raw: data
  };
}

export async function callOpenAI(apiKey, model, content) {
  // Convert content array to OpenAI format
  const openaiContent = content.map(item => {
    if (item.type === 'text') {
      return { type: 'text', text: item.text };
    } else if (item.type === 'image') {
      return {
        type: 'image_url',
        image_url: {
          url: `data:${item.source.media_type};base64,${item.source.data}`
        }
      };
    } else if (item.type === 'document') {
      // OpenAI doesn't support PDF directly in vision, send as text note
      return {
        type: 'text',
        text: '[PDF document attached - content extracted]'
      };
    }
    return { type: 'text', text: JSON.stringify(item) };
  });

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      max_tokens: 4000,
      messages: [{ role: 'user', content: openaiContent }]
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw { status: response.status, data };
  }

  // Normalize response format
  return {
    text: data.choices?.[0]?.message?.content || '',
    usage: data.usage,
    model: data.model,
    raw: data
  };
}

// Main dispatcher
export async function callProvider(provider, apiKey, model, content) {
  switch (provider) {
    case 'anthropic':
      return callAnthropic(apiKey, model, content);
    case 'google':
      return callGoogle(apiKey, model, content);
    case 'openai':
      return callOpenAI(apiKey, model, content);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
