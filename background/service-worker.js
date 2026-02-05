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
// Offscreen Document Helper
// ============================================================================

let creatingOffscreen;
async function setupOffscreenDocument(path) {
  // Check if offscreen document exists
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(path)]
  });

  if (existingContexts.length > 0) {
    return;
  }

  // Create offscreen document
  if (creatingOffscreen) {
    await creatingOffscreen;
  } else {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: path,
      reasons: ['WORKERS'], // Use WORKERS reason for background processing
      justification: 'Run Gemini Nano AI model'
    });
    await creatingOffscreen;
    creatingOffscreen = null;
  }
}

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
// Cache Helpers
// ============================================================================
async function getCache() {
  const r = await chrome.storage.local.get('responseCache');
  return r.responseCache || {};
}

async function setCache(key, value) {
  const cache = await getCache();
  cache[key] = { value, timestamp: Date.now() };
  await chrome.storage.local.set({ responseCache: cache });
}

// ============================================================================
// LLM API Integration
// ============================================================================

async function callLLM(messages, settings, retryCount = 0) {
  const { llmProvider, apiKey, model, maxTokens, temperature } = settings;
  const MAX_RETRIES = 3;

  if (!apiKey && llmProvider !== 'nano' && llmProvider !== 'puter') {
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
          role: m.role === 'assistant' ? 'model' : (m.role === 'system' ? 'user' : m.role),
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

    case 'nano':
      // Route to Offscreen Document
      try {
        await setupOffscreenDocument('offscreen/offscreen.html');

        // Construct prompt
        const systemMsg = messages.find(m => m.role === 'system')?.content || '';
        const userMsg = messages.find(m => m.role === 'user')?.content || '';
        const fullPrompt = `${systemMsg}\n\n${userMsg}`;

        // Send to offscreen
        const offscreenResp = await chrome.runtime.sendMessage({
          type: 'EXECUTE_NANO',
          prompt: fullPrompt,
          settings: { temperature: settings.temperature }
        });

        if (!offscreenResp.success) {
          throw new Error(offscreenResp.error);
        }
        return offscreenResp.result;
      } catch (e) {
        throw new Error(`Offscreen AI Error: ${e.message}`);
      }
    
    // Puter is handled in content script via bridge, but if called here we should error or handle
    case 'puter':
        throw new Error('Puter.js must be executed from content script via Main World Bridge');

    default:
      throw new Error(`Unsupported LLM provider: ${llmProvider}`);
  }

  // Fetch Logic (for remote providers)
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errorText = await response.text();

        // Handle Rate Limiting (429)
        if (response.status === 429 && retryCount < MAX_RETRIES) {
          let waitTime = 5; // Default 5s
  
          const retryAfter = response.headers.get('Retry-After');
          if (retryAfter) waitTime = parseInt(retryAfter, 10) || 5;
          else {
            const match = errorText.match(/retry in (\d+(\.\d+)?)s/);
            if (match) waitTime = parseFloat(match[1]);
          }
  
          console.log(`Rate limit hit (429). Waiting ${waitTime}s to retry...`);
          await new Promise(r => setTimeout(r, waitTime * 1000 + 1000));
          return callLLM(messages, settings, retryCount + 1);
        }
  
        throw new Error(`LLM API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    // Extract response based on provider
    switch (llmProvider) {
      case 'openai':
      case 'groq': 
        return data.choices[0].message.content;
      case 'gemini':
        return data.candidates[0].content.parts[0].text;
      case 'anthropic':
        return data.content[0].text;
      default:
        throw new Error('Unknown provider response format');
    }
  } catch (err) {
    if (retryCount < MAX_RETRIES && !err.message.includes('401') && !err.message.includes('403') && llmProvider !== 'nano') {
        // Exponential backoff for non-auth errors
        const backoff = 1000 * Math.pow(2, retryCount);
        await new Promise(r => setTimeout(r, backoff));
        return callLLM(messages, settings, retryCount + 1);
      }
      throw err;
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

  // 1. Check rate limit
  const rateLimit = await checkRateLimit();
  if (!rateLimit.allowed) {
    return {
      success: false,
      error: `Rate limit reached. ${rateLimit.remaining} comments remaining. Resets in ${rateLimit.resetIn} minutes.`
    };
  }

  // 2. Check Cache
  // Simple hash of content + author
  const cacheKey = `c_${authorName}_${postContent.slice(0, 50).replace(/\W/g, '')}`;
  const cache = await getCache();
  const cachedFn = cache[cacheKey];

  if (cachedFn && (Date.now() - cachedFn.timestamp < 24 * 60 * 60 * 1000)) {
     // If cached, we might need to verify if vibe matches, but simpler to just return
     // if the cache key is simple. But if vibe changed, we might want new comment.
     // For now, let's assume cache is robust enough or we accept cache hits.
     // Actually, if Vibe is set, specific generation is requested, so maybe skip cache if vibe is present?
     // Let's skip cache if Vibe is active.
     if (!vibe) {
         console.log('Returning cached comment');
         return cachedFn.value;
     }
  }

  try {
    // Stage 1: Analyze post
    const analysisPrompt = buildAnalysisPrompt(postContent, { name: authorName, headline: 'LinkedIn Member' });
    let analysis;
    
    // Nano might struggle with complex analysis or return non-JSON.
    // If Nano, we might skip analysis or simplify.
    // But let's try calling it.
    try {
        const analysisResponse = await callLLM([
        analysisPrompt,
        { role: 'user', content: 'Analyze this post.' }
        ], settings);
    
        try {
            const cleanJson = analysisResponse.replace(/```json|```/g, '').trim();
            analysis = JSON.parse(cleanJson);
        } catch {
            analysis = { focalPoint: postContent.slice(0, 100), recommendedTone: 'professional' };
        }
    } catch (e) {
        // Fallback if analysis fails (e.g. Nano error)
         console.warn("Analysis failed, using fallback", e);
         analysis = { focalPoint: postContent.slice(0, 100), recommendedTone: 'professional' };
    }

    // Stage 2: Generate comment
    const userStyle = await chrome.storage.local.get('userStyle');

    // Derive word limit
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

    const finalResponse = {
        success: true,
        comment: comment.trim(),
        analysis: analysis,
        rateLimit: await checkRateLimit()
    };

    // 4. Save to Cache and History
    await setCache(cacheKey, finalResponse);
    await recordCommentGeneration();

    return finalResponse;

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
  
  // Forwarding executing nano if needed by other parts? 
  // But generateComment handles it internally now.
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
