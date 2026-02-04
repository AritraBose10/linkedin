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
        system: messages.find(m => m.role === 'system')?.content || ''
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

function buildGenerationPrompt(analysis, userStyle, constraints) {
  return {
    role: 'system',
    content: `You are generating an authentic LinkedIn comment that sounds like the user wrote it.

CONTEXT:
${JSON.stringify(analysis, null, 2)}

USER STYLE PROFILE:
- Typical length: ${userStyle?.avgLength || 'medium'} (${userStyle?.avgWords || '20-40'} words)
- Emoji usage: ${userStyle?.emojiRate || 'occasional'}
- Tone: ${userStyle?.preferredTone || 'professional yet warm'}
- Common phrases: ${userStyle?.phrases?.join(', ') || 'none learned yet'}

HARD CONSTRAINTS:
1. NEVER use these generic phrases:
   - "Great post"
   - "Thanks for sharing"
   - "Love this"
   - "So true"
   - "Couldn't agree more"
   
2. NEVER start with:
   - "Wow"
   - "Amazing"
   - An emoji
   
3. MUST:
   - Add genuine insight or perspective
   - Reference specific content from the post
   - Sound human, not AI-generated
   - Match user's typical style

4. Length: ${constraints?.targetLength || '2-4 sentences'}

Generate ONE comment. Return ONLY the comment text, no quotes or explanation.`
  };
}

// ============================================================================
// Main Comment Generation
// ============================================================================

async function generateComment(postData) {
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
    const analysisPrompt = buildAnalysisPrompt(postData.content, postData.author);
    const analysisResponse = await callLLM([
      analysisPrompt,
      { role: 'user', content: 'Analyze this post.' }
    ], settings);
    
    let analysis;
    try {
      analysis = JSON.parse(analysisResponse);
    } catch {
      analysis = { focalPoint: postData.content.slice(0, 100), recommendedTone: 'professional' };
    }
    
    // Stage 2: Generate comment
    const userStyle = await chrome.storage.local.get('userStyle');
    const generationPrompt = buildGenerationPrompt(analysis, userStyle.userStyle, {});
    
    const comment = await callLLM([
      generationPrompt,
      { role: 'user', content: `Generate a comment for this post about: ${analysis.focalPoint}` }
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
    generateComment(message.postData)
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
