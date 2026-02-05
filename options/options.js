/**
 * LinkedIn Comment Copilot - Options Page Script
 */

// Model options by provider
const MODELS = {
    openai: [
        { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Recommended)' },
        { value: 'gpt-4o', label: 'GPT-4o' },
        { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
        { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo (Faster)' }
    ],
    gemini: [
        { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (Latest)' },
        { value: 'gemini-2.0-flash-lite-001', label: 'Gemini 2.0 Flash Lite (Fastest)' },
        { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash (Recommended)' },
        { value: 'gemini-1.5-flash-002', label: 'Gemini 1.5 Flash v2 (Stable)' },
        { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' }
    ],
    anthropic: [
        { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet (Recommended)' },
        { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku (Faster)' },
        { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus' }
    ],
    groq: [
        { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B (Recommended)' },
        { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B (Fastest)' },
        { value: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B' },
        { value: 'gemma2-9b-it', label: 'Gemma 2 9B' }
    ],
    nano: [
        { value: 'default', label: 'On-Device Model (Offline)' }
    ],
    puter: [
        { value: 'default', label: 'Puter.js (Free)' }
    ]
};

// DOM Elements
const elements = {
    provider: document.getElementById('provider'),
    apiKey: document.getElementById('apiKey'),
    model: document.getElementById('model'),
    temperature: document.getElementById('temperature'),
    tempValue: document.getElementById('tempValue'),
    maxTokens: document.getElementById('maxTokens'),
    saveBtn: document.getElementById('saveBtn'),
    resetBtn: document.getElementById('resetBtn'),
    toast: document.getElementById('toast'),
    totalGenerated: document.getElementById('totalGenerated'),
    todayRemaining: document.getElementById('todayRemaining'),
    avgRating: document.getElementById('avgRating')
};

// Update model dropdown based on provider
function updateModels() {
    const provider = elements.provider.value;
    const models = MODELS[provider] || [];

    elements.model.innerHTML = models
        .map(m => `<option value="${m.value}">${m.label}</option>`)
        .join('');
    
    // Toggle API Key visibility
    const apiKeyGroup = document.getElementById('apiKeyGroup');
    if (provider === 'nano' || provider === 'puter') {
        apiKeyGroup.style.display = 'none';
    } else {
        apiKeyGroup.style.display = 'block';
    }
}

// Load settings from storage
async function loadSettings() {
    try {
        const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });

        if (response) {
            elements.provider.value = response.llmProvider || 'openai';
            updateModels();
            elements.model.value = response.model || MODELS[response.llmProvider]?.[0]?.value;
            elements.apiKey.value = response.apiKey || '';
            elements.temperature.value = response.temperature || 0.8;
            elements.tempValue.textContent = response.temperature || 0.8;
            elements.maxTokens.value = response.maxTokens || 500;
        }

        // Load rate limit stats
        const rateLimit = await chrome.runtime.sendMessage({ type: 'CHECK_RATE_LIMIT' });
        if (rateLimit) {
            elements.todayRemaining.textContent = rateLimit.remaining;
        }

        // Load usage stats
        const stats = await chrome.storage.local.get('usageStats');
        if (stats.usageStats) {
            elements.totalGenerated.textContent = stats.usageStats.totalGenerated || 0;
        }

    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

// Save settings
async function saveSettings() {
    const settings = {
        llmProvider: elements.provider.value,
        model: elements.model.value,
        apiKey: elements.apiKey.value,
        temperature: parseFloat(elements.temperature.value),
        maxTokens: parseInt(elements.maxTokens.value)
    };

    try {
        const response = await chrome.runtime.sendMessage({
            type: 'SAVE_SETTINGS',
            settings
        });

        if (response.success) {
            showToast('Settings saved successfully!', 'success');
        } else {
            showToast('Error saving settings: ' + response.error, 'error');
        }
    } catch (error) {
        showToast('Error saving settings', 'error');
    }
}

// Reset to defaults
async function resetSettings() {
    elements.provider.value = 'openai';
    updateModels();
    elements.model.value = 'gpt-4o-mini';
    elements.apiKey.value = '';
    elements.temperature.value = 0.8;
    elements.tempValue.textContent = '0.8';
    elements.maxTokens.value = 500;

    await saveSettings();
    showToast('Settings reset to defaults', 'success');
}

// Show toast notification
function showToast(message, type = 'success') {
    elements.toast.textContent = message;
    elements.toast.className = `toast show ${type}`;

    setTimeout(() => {
        elements.toast.className = 'toast';
    }, 3000);
}

// Style Engine Integration
let styleEngine;
try {
    styleEngine = new StyleEngine();
} catch (e) {
    console.error('StyleEngine not loaded', e);
}

// Elements for Style Training
Object.assign(elements, {
    trainBtn: document.getElementById('trainBtn'),
    trainingData: document.getElementById('trainingData'),
    styleStats: document.getElementById('styleStats'),
    styleLength: document.getElementById('styleLength'),
    styleEmoji: document.getElementById('styleEmoji'),
    styleTone: document.getElementById('styleTone'),
    styleCasing: document.getElementById('styleCasing')
});

async function analyzeAndSaveStyle() {
    const text = elements.trainingData.value;
    if (text.length < 50) {
        showToast('Please provide at least 50 characters of text', 'error');
        return;
    }

    if (!styleEngine) {
        showToast('Style Engine not ready', 'error');
        return;
    }

    elements.trainBtn.innerHTML = '<span>⏳</span> Analyzing...';

    // Simulate thinking delay feels better
    setTimeout(async () => {
        const profile = styleEngine.analyze(text);

        // Save to storage
        await chrome.storage.local.set({ userStyle: profile });

        // Update UI
        displayStyleStats(profile);
        elements.trainBtn.innerHTML = '<span>✅</span> Identity Saved';
        showToast('Style profile updated!', 'success');

        setTimeout(() => {
            elements.trainBtn.innerHTML = '<span>🧬</span> Analyze & Save Identity';
        }, 2000);
    }, 800);
}

function displayStyleStats(profile) {
    if (!profile) return;

    elements.styleStats.style.display = 'block';

    // Format for display
    elements.styleLength.textContent = profile.avgLength === 'short' ? 'Short & Punchy' :
        profile.avgLength === 'long' ? 'Detailed' : 'Balanced';

    elements.styleEmoji.textContent = profile.emojiFrequency === 'never' ? 'Minimal/None' :
        profile.emojiFrequency === 'heavy' ? 'Expressive' : 'Balanced';

    elements.styleTone.textContent = profile.punctuation === 'excited' ? 'High Energy' :
        profile.punctuation === 'relaxed' ? 'Casual' : 'Professional';

    elements.styleCasing.textContent = profile.casing === 'lowercase' ? 'modern lowercase' : 'Standard Case';
}

// Load existing style
async function loadStyle() {
    const data = await chrome.storage.local.get('userStyle');
    if (data.userStyle) {
        displayStyleStats(data.userStyle);
    }
}

// Event listeners
elements.provider.addEventListener('change', () => {
    updateModels();
});

elements.temperature.addEventListener('input', () => {
    elements.tempValue.textContent = elements.temperature.value;
});

elements.saveBtn.addEventListener('click', saveSettings);
elements.resetBtn.addEventListener('click', resetSettings);
elements.trainBtn?.addEventListener('click', analyzeAndSaveStyle);

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    loadStyle();
});
