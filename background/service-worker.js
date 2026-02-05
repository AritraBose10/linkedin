/**
 * LinkedIn Comment Copilot - Background Service Worker
 * Handles LLM API communication, rate limiting, and storage management
 */

// ============================================================================
// Constants & Configuration
// ============================================================================

const RATE_LIMIT = {
  maxCommentsPerHour: 10,
  windowMs: 60 * 60 * 1000 // 1 hour
};

const DEFAULT_SETTINGS = {
  llmProvider: 'openai',
  apiKey: '',
  model: 'gpt-4o-mini',
  maxTokens: 500,
  temperature: 0.8
};

// ============================================================================
// Storage Helpers
// ============================================================================

async function getSettings() {
  const result = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...result.settings };
}

async function saveSettings(settings) {
  await chrome.storage.local.set({ settings });
}

async function getRateLimitData() {
  const result = await chrome.storage.local.get('rateLimit');
  return result.rateLimit || { timestamps: [] };
}

async function saveRateLimitData(data) {
  await chrome.storage.local.set({ rateLimit: data });
}

// ============================================================================
// Rate Limiting
// ============================================================================

async function checkRateLimit() {
  const data = await getRateLimitData();
  const now = Date.now();
  const windowStart = now - RATE_LIMIT.windowMs;

  // Filter timestamps within the window
  const recentTimestamps = data.timestamps.filter(ts => ts > windowStart);

  return {
    allowed: recentTimestamps.length < RATE_LIMIT.maxCommentsPerHour,
    remaining: RATE_LIMIT.maxCommentsPerHour - recentTimestamps.length,
    resetIn: recentTimestamps.length > 0
      ? Math.ceil((recentTimestamps[0] + RATE_LIMIT.windowMs - now) / 1000 / 60)
      : 0
  };
}

async function recordCommentGeneration() {
  const data = await getRateLimitData();
  const now = Date.now();
  const windowStart = now - RATE_LIMIT.windowMs;

  // Clean old timestamps and add new one
  data.timestamps = data.timestamps.filter(ts => ts > windowStart);
  data.timestamps.push(now);

  await saveRateLimitData(data);
}

// ============================================================================
// LLM API Integration
// ============================================================================

async function callLLM(messages, settings) {
  const { llmProvider, apiKey, model, maxTokens, temperature } = settings;

  if (!apiKey) {
    throw new Error('API key not configured. Please set it in extension options.');
  }

  let endpoint, headers, body;

  switch (llmProvider) {
    case 'openai':
      endpoint = 'https://api.openai.com/v1/chat/completions';
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      };
      body = {
        model,
        messages,
        max_tokens: maxTokens,
        temperature
      };
      break;

    case 'gemini':
      endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      headers = { 'Content-Type': 'application/json' };
      body = {
        contents: messages.map(m => ({
          role: m.role === 'assistant' ? 'model' : m.role,
          parts: [{ text: m.content }]
        })),
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature
        }
      };
      break;

    case 'anthropic':
      endpoint = 'https://api.anthropic.com/v1/messages';
      headers = {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      };
      body = {
        model,
        max_tokens: maxTokens,
        messages: messages.filter(m => m.role !== 'system'),
        system: messages.find(m => m.role === 'system')?.content || '',
        temperature
      };
      break;

    case 'groq':
      endpoint = 'https://api.groq.com/openai/v1/chat/completions';
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      };
      body = {
        model,
        messages,
        max_tokens: maxTokens,
        temperature
      };
      break;

    default:
      throw new Error(`Unsupported LLM provider: ${llmProvider}`);
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`LLM API error: ${response.status} - ${error}`);
  }

  const data = await response.json();

  // Extract response based on provider
  switch (llmProvider) {
    case 'openai':
      return data.choices[0].message.content;
    case 'gemini':
      return data.candidates[0].content.parts[0].text;
    case 'anthropic':
      return data.content[0].text;
    case 'groq':
      return data.choices[0].message.content;
    default:
      throw new Error('Unknown provider response format');
  }
}

// ============================================================================
// Comment Generation Prompts
// ============================================================================

function buildAnalysisPrompt(postContent, authorInfo) {
  return {
    role: 'system',
    content: `You are analyzing a LinkedIn post to understand context for comment generation.

Analyze the following post and return a JSON object with:
- focalPoint: The main topic or argument (1 sentence)
- authorIntent: What the author wants (inform, inspire, sell, vent, celebrate)
- recommendedTone: Best tone for reply (supportive, curious, professional, casual, contrarian)
- keyTopics: Array of 2-3 key themes
- riskLevel: low/medium/high (based on sensitivity of topic)

POST BY ${authorInfo.name} (${authorInfo.headline}):
${postContent}

Respond ONLY with valid JSON, no markdown.`
  };
}

function buildGenerationPrompt(analysis, userStyle, constraints, vibe) {
  const wordLimit = constraints?.wordLimit || 20;

  const vibeInstructions = vibe
    ? `\nGOAL: ${vibe.label} - ${vibe.prompt}\n`
    : '';

  // If vibe is set, override riskiness or tone constraints to match user intent
  const constraintInstructions = vibe
    ? `IGNORE standard tone. ADOPT the goal above.`
    : '';

  return {
    role: 'system',
    content: `You are generating an authentic LinkedIn comment that sounds like the user wrote it.

CONTEXT:
${JSON.stringify(analysis, null, 2)}

USER IDENTITY (CLONE THESE TRAITS):
- Length Preference: ${userStyle?.avgLength || 'medium'}
- Emoji Frequency: ${userStyle?.emojiFrequency || 'rare'}
- Punctuation Style: ${userStyle?.punctuation || 'standard'} (If "relaxed", avoid periods at end of lines. If "excited", use exclamation marks!)
- Casing: ${userStyle?.casing || 'standard'} (If "lowercase", DO NOT capitalize sentences)
- Directness: ${userStyle?.structure === 'list_heavy' ? 'Prefers bullet points' : 'Prefers sentences'}
- Common Phrases (Use casually if fits): ${userStyle?.commonPhrases?.join(', ') || 'N/A'}

HARD CONSTRAINTS:
1. NEVER use generic bot comments ("Great post", "Thanks for sharing", "Love this", "So true").
2. NEVER start with "Wow" or "Amazing".
3. MATCH THE CASING AND PUNCTUATION STYLE EXACTLY.
4. Length: MAX ${wordLimit} WORDS

Generate ONE comment. Return ONLY the comment text. Keep it under ${wordLimit} words. No quotes.

${constraintInstructions}

${vibeInstructions}`
  };
}

// ============================================================================
// Main Comment Generation
// ============================================================================

async function generateComment(postContent, authorName, vibe) {
  const settings = await getSettings();

  // Check rate limit
  const rateLimit = await checkRateLimit();
  if (!rateLimit.allowed) {
    return {
      success: false,
      error: `Rate limit reached. ${rateLimit.remaining} comments remaining. Resets in ${rateLimit.resetIn} minutes.`
    };
  }

  try {
    // Stage 1: Analyze post
    const analysisPrompt = buildAnalysisPrompt(postContent, { name: authorName, headline: 'LinkedIn Member' });
    const analysisResponse = await callLLM([
      analysisPrompt,
      { role: 'user', content: 'Analyze this post.' }
    ], settings);

    let analysis;
    try {
      analysis = JSON.parse(analysisResponse);
    } catch {
      analysis = { focalPoint: postContent.slice(0, 100), recommendedTone: 'professional' };
    }

    // Stage 2: Generate comment
    const userStyle = await chrome.storage.local.get('userStyle');

    // Derive word limit from maxTokens (approx 5 tokens per word in this specific options mapping)
    // Options: 50 -> 10 words, 100 -> 20 words, 150 -> 30 words, 200 -> 40 words
    // If settings.maxTokens is custom or large, default to 20 to be safe.
    let wordLimit = 20;
    if (settings.maxTokens && settings.maxTokens <= 200) {
      wordLimit = Math.floor(settings.maxTokens / 5);
    }

    const generationPrompt = buildGenerationPrompt(analysis, userStyle.userStyle, { wordLimit }, vibe);

    const promptContent = vibe
      ? `Generate a comment for this post about: ${analysis.focalPoint} with VIBE: ${vibe.label}`
      : `Generate a comment for this post about: ${analysis.focalPoint}`;

    const comment = await callLLM([
      generationPrompt,
      { role: 'user', content: promptContent }
    ], settings);

    // Record for rate limiting
    await recordCommentGeneration();

    return {
      success: true,
      comment: comment.trim(),
      analysis,
      rateLimit: await checkRateLimit()
    };

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// ============================================================================
// Message Handler
// ============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GENERATE_COMMENT') {
    generateComment(message.postContent, message.authorName, message.vibe)
      .then(sendResponse)
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open for async response
  }

  if (message.type === 'GET_SETTINGS') {
    getSettings().then(sendResponse);
    return true;
  }

  if (message.type === 'SAVE_SETTINGS') {
    saveSettings(message.settings)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'CHECK_RATE_LIMIT') {
    checkRateLimit().then(sendResponse);
    return true;
  }
});

// ============================================================================
// Extension Lifecycle
// ============================================================================

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // Initialize default settings
    await saveSettings(DEFAULT_SETTINGS);
    console.log('LinkedIn Comment Copilot installed successfully!');
  }
});

console.log('LinkedIn Comment Copilot service worker initialized');
