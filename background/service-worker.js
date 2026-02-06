/**
 * LinkedIn Comment Copilot - Background Service Worker
 * Handles LLM API communication, rate limiting, and storage management
 */
importScripts('../core/style-engine.js');

// ============================================================================
// Constants & Configuration
// ============================================================================

const RATE_LIMIT = {
  maxCommentsPerHour: 10,
  windowMs: 60 * 60 * 1000 // 1 hour
};

// Auto-Learning Configuration
const LEARNING_CONFIG = {
  batchSize: 5,        // Re-analyze every 5 new comments
  maxCorpusSize: 50    // Keep last 50 comments for training
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

// Offscreen helper removed (Feature deprecated)

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

async function checkRateLimit() {
  const data = await getRateLimitData();
  const now = Date.now();

  // Filter out timestamps older than the window
  const validTimestamps = data.timestamps.filter(t => now - t < RATE_LIMIT.windowMs);

  if (validTimestamps.length >= RATE_LIMIT.maxCommentsPerHour) {
    return {
      allowed: false,
      resetTime: validTimestamps[0] + RATE_LIMIT.windowMs,
      remaining: 0
    };
  }

  // Save cleaned up timestamps
  if (validTimestamps.length !== data.timestamps.length) {
    await saveRateLimitData({ ...data, timestamps: validTimestamps });
  }

  return {
    allowed: true,
    remaining: RATE_LIMIT.maxCommentsPerHour - validTimestamps.length
  };
}

async function recordCommentGeneration() {
  const data = await getRateLimitData();
  const now = Date.now();
  // Filter old AND add new
  const validTimestamps = data.timestamps.filter(t => now - t < RATE_LIMIT.windowMs);
  validTimestamps.push(now);

  const totalGenerated = (data.totalGenerated || 0) + 1;

  await saveRateLimitData({
    timestamps: validTimestamps,
    totalGenerated
  });
}

// Caching Helpers
async function getCache(key) {
  const result = await chrome.storage.local.get(key);
  const entry = result[key];
  if (!entry) return null;

  // Expire cache after 24 hours
  if (Date.now() - entry.timestamp > 24 * 60 * 60 * 1000) {
    await chrome.storage.local.remove(key);
    return null;
  }
  return entry.data;
}

async function setCache(key, data) {
  await chrome.storage.local.set({
    [key]: {
      data,
      timestamp: Date.now()
    }
  });
}

// ============================================================================
// AI Bridge & Prompt Logic
// ============================================================================

function buildAnalysisPrompt(postContent, author) {
  return [
    {
      role: 'system', content: `You are an expert social media analyst. Analyze the following LinkedIn post to determine the best commenting strategy.
        
        Output JSON only:
        {
            "focalPoint": "The main topic or insight to react to",
            "recommendedTone": "professional | empathetic | enthusiastic | contrarian",
            "authorIntent": "educational | promotional | thought-leadership | personal-story"
        }` },
    { role: 'user', content: `Author: ${author.name}\nHeadline: ${author.headline}\n\nPost:\n${postContent}` }
  ];
}

async function buildGenerationPrompt(postContent, author, analysis, settings) {
  // Inject User Style if available
  let styleInstruction = "";
  if (settings.userStyle) {
    const s = settings.userStyle;
    styleInstruction = `
        Your Unique Voice Profile:
        - Sentence Length: ${s.avgLength}
        - Emoji Usage: ${s.emojiFrequency}
        - Casing: ${s.casing}
        - Punctuation: ${s.punctuation}
        - Common Phrases: ${s.commonPhrases.join(', ')}
        - Structure: ${s.structure}
        
        Mimic this style exactly. Do not sound like a generic bot.`;
  }

  // Map maxTokens to explicit instructions
  // 50: Short (~10 words), 100: Medium (~25 words), 150: Long (~40 words), 300: Detailed (~80 words)
  let lengthInstruction = "Keep it concise.";
  const tokens = parseInt(settings.maxTokens);
  if (tokens <= 50) lengthInstruction = "Extremely short. Max 10 words. One punchy sentence.";
  else if (tokens <= 100) lengthInstruction = "Short and concise. Around 25 words. 1-2 sentences.";
  else if (tokens <= 150) lengthInstruction = "Moderate length. Around 40 words. Add some depth.";
  else if (tokens >= 300) lengthInstruction = "Detailed and thoughtful. Around 80 words. Expand on the topic.";

  return [
    {
      role: 'system', content: `You are a professional LinkedIn user. Write a comment on this post.
        
        Context:
        - Focal Point: ${analysis.focalPoint}
        - Tone: ${analysis.recommendedTone} (but adapted to your Voice Profile)
        - Intent: Engage meaningfully with the author.
        - Length Limit: ${lengthInstruction}
        ${styleInstruction}
        
        Rules:
        - No hashtags.
        - Keep it authentic.
        - If the user style is 'lowercase', use all lowercase.
        - If the user style is 'no_punctuation', do not use period at the end.
        ` },
    { role: 'user', content: postContent }
  ];
}

async function callLLM(messages, settings, retryCount = 0) {
  const { llmProvider, apiKey, model, maxTokens, temperature } = settings;
  const MAX_RETRIES = 2;

  // 1. Handle Local Providers
  if (llmProvider === 'nano') {
    // For Nano in service worker, we use Offscreen if available, OR reject if this logic is handled in Main World bridge.
    // Since this function is called by 'generateComment', which is called by message handler...
    // The content script should actually handle Nano via Bridge for Main World access.
    // BUT if we are here, it means we might want to fallback or use Offscreen.
    // For now, let's assume Content Script handles Nano via Bridge, but if it calls us, 
    // we try to use Offscreen (though window.ai is often main-world only).
    // Let's return error so Content Script uses Bridge.
    throw new Error("Use AI Bridge for Nano");
  }

  // 2. Validate API Key for Cloud
  if (!apiKey) {
    throw new Error(`Missing API key for ${llmProvider}. Please check settings.`);
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
        model: model || 'gpt-4o-mini',
        messages: messages,
        max_tokens: maxTokens,
        temperature: temperature
      };
      break;
    case 'gemini':
      endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-1.5-flash'}:generateContent?key=${apiKey}`;
      headers = { 'Content-Type': 'application/json' };
      body = {
        contents: messages.map(m => ({
          role: m.role === 'system' ? 'user' : 'user', // Gemini hack (system mostly unsupported in v1beta simple)
          parts: [{ text: m.content }]
        })),
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature: temperature
        }
      };
      if (messages[0].role === 'system') {
        // Better Gemini system instruction handling
        body.systemInstruction = { parts: [{ text: messages[0].content }] };
        body.contents.shift();
      }
      break;

    case 'groq':
      endpoint = 'https://api.groq.com/openai/v1/chat/completions';
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      };
      body = {
        model: model || 'llama3-70b-8192',
        messages: messages,
        max_tokens: maxTokens,
        temperature: temperature
      };
      break;

    case 'anthropic':
      endpoint = 'https://api.anthropic.com/v1/messages';
      headers = {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      };
      body = {
        model: model || 'claude-3-haiku-20240307',
        messages: messages.filter(m => m.role !== 'system'),
        system: messages.find(m => m.role === 'system')?.content,
        max_tokens: maxTokens,
        temperature: temperature
      };
      break;

    default:
      throw new Error(`Unsupported provider: ${llmProvider}`);
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API Error (${response.status}): ${errText}`);
    }

    const data = await response.json();

    // Parse Response
    if (llmProvider === 'openai' || llmProvider === 'groq') {
      return data.choices[0].message.content;
    } else if (llmProvider === 'gemini') {
      return data.candidates[0].content.parts[0].text;
    } else if (llmProvider === 'anthropic') {
      return data.content[0].text;
    }

  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      console.warn(`Retrying ${llmProvider} call... (${retryCount + 1})`);
      await new Promise(r => setTimeout(r, 1000 * (retryCount + 1))); // Exponential backoff
      return callLLM(messages, settings, retryCount + 1);
    }
    throw error;
  }
}

async function generateComment(postContent, authorName, vibe) {
  const settings = await getSettings();

  // Rate Limit Check
  const rateLimit = await checkRateLimit();
  if (!rateLimit.allowed) {
    return { success: false, error: "Rate limit exceeded. Try again in an hour." };
  }

  // Cache Check
  const cacheKey = `comment_${postContent.slice(0, 50)}_${settings.llmProvider}`;
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  try {
    // Stage 1: Analyze
    // Use smaller model or just first call
    let analysis = { focalPoint: "General Topic", recommendedTone: vibe || "professional" }; // Default
    try {
      if (settings.llmProvider !== 'nano') {
        const analysisPrompt = buildAnalysisPrompt(postContent, { name: authorName, headline: 'Member' });
        const analysisRaw = await callLLM(analysisPrompt, { ...settings, maxTokens: 150 });
        const jsonMatch = analysisRaw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysis = JSON.parse(jsonMatch[0]);
        }
      }
    } catch (e) {
      console.warn("Analysis stage failed, using default", e);
    }

    // Stage 2: Generate
    const promptContent = `Write a ${vibe || analysis.recommendedTone} comment about: ${analysis.focalPoint || postContent.slice(0, 200)}...`;

    // For cloud providers, we use the sophisticated prompt builder
    const messages = await buildGenerationPrompt(postContent, { name: authorName }, analysis, settings);

    const comment = await callLLM(messages, settings);

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
// Silent Learning Logic
// ============================================================================

async function handleLearningInteraction(interaction) {
  try {
    // 1. Validate Interaction
    if (!interaction.finalText || interaction.finalText.length < 5) return;

    // 2. Get Learning Corpus
    const storage = await chrome.storage.local.get(['learningCorpus']);
    let corpus = storage.learningCorpus || [];

    // 3. Add to Corpus (FIFO if full)
    corpus.push(interaction.finalText);
    if (corpus.length > LEARNING_CONFIG.maxCorpusSize) {
      corpus.shift(); // Remove oldest
    }

    // 4. Check Trigger Condition (Batch Size)
    // We track 'new comments since last analysis' in a separate counter ideally, 
    // or just re-analyze if (length % batchSize === 0)
    let needsAnalysis = (corpus.length % LEARNING_CONFIG.batchSize) === 0;

    await chrome.storage.local.set({ learningCorpus: corpus });

    if (needsAnalysis) {
      console.log("Silent Learning: Triggering Style Analysis...");
      await analyzeUserStyle(corpus);
    }

  } catch (e) {
    console.error("Silent Learning Error:", e);
  }
}

async function analyzeUserStyle(corpusArray) {
  try {
    const fullText = corpusArray.join('\n');

    // Use the imported StyleEngine
    const engine = new self.StyleEngine();
    const newProfile = engine.analyze(fullText);

    // Merge with existing setting (Update userStyle)
    const settings = await getSettings();
    settings.userStyle = newProfile;

    await saveSettings(settings);
    console.log("Silent Learning: Style Profile Updated!", newProfile);

  } catch (e) {
    console.error("Style Analysis Failed:", e);
  }
}

// ============================================================================
// Message Handler
// ============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GENERATE_COMMENT') {
    // Handle both legacy (flat) and new (nested postData) message formats
    const content = message.postData?.content || message.postContent;
    const author = message.postData?.authorName || message.authorName;

    generateComment(content, author, message.vibe)
      .then(sendResponse)
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
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

  // NEW: Learning Signal
  if (message.type === 'LEARN_FROM_INTERACTION') {
    handleLearningInteraction(message.payload);
    // No response needed, fire and forget
    return false;
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
