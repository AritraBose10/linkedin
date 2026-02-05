/**
 * LinkedIn Comment Copilot - AI Bridge
 * Runs in the MAIN world to access window.ai and load Puter.js
 */

console.log('LCC: AI Bridge Loaded');

window.addEventListener('message', async (event) => {
    // Only accept messages from our content script
    if (!event.data || event.data.source !== 'LCC_CONTENT_SCRIPT') {
        return;
    }

    if (event.data.type === 'EXECUTE_NANO') {
        const { prompt, settings } = event.data;
        await handleNanoRequest(prompt, settings);
    } else if (event.data.type === 'EXECUTE_PUTER') {
        const { prompt } = event.data;
        await handlePuterRequest(prompt);
    }
});

function sendResponse(data) {
    window.postMessage({
        source: 'LCC_AI_BRIDGE',
        ...data
    }, '*');
}

// ============================================================================
// Nano (Chrome Built-in) Handler
// ============================================================================

async function handleNanoRequest(prompt, settings) {
    try {
        const ai = window.ai || window.model;
        if (!ai) {
            throw new Error('Chrome Built-in AI (window.ai) is not available. Flags might be inactive or not supported on this device.');
        }

        const capabilities = await ai.languageModel.capabilities();

        if (capabilities.available === 'no') {
            throw new Error('Gemini Nano is not available or not downloaded.');
        }

        const session = await ai.languageModel.create({
            temperature: settings?.temperature || 0.8,
            topK: 3
        });

        // Listen for download progress if detected (API varies)
        if (session.addEventListener) {
            session.addEventListener('downloadprogress', (e) => {
                sendResponse({
                    type: 'DOWNLOAD_PROGRESS',
                    loaded: e.loaded,
                    total: e.total
                });
            });
        }

        const stream = session.promptStreaming ? session.promptStreaming(prompt) : null;

        if (stream) {
            let fullText = '';
            for await (const chunk of stream) {
                fullText = chunk;
            }
            sendResponse({ type: 'SUCCESS', result: fullText });
        } else {
            const result = await session.prompt(prompt);
            sendResponse({ type: 'SUCCESS', result });
        }

    } catch (error) {
        sendResponse({ type: 'ERROR', error: error.message });
    }
}

// ============================================================================
// Puter.js Handler
// ============================================================================

let puterLoaded = false;
async function loadPuter() {
    if (puterLoaded) return;
    if (window.puter) { puterLoaded = true; return; }

    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://js.puter.com/v2/';
        script.onload = () => {
            puterLoaded = true;
            resolve();
        };
        script.onerror = () => reject(new Error('Failed to load Puter.js from CDN. Check internet connection.'));
        document.head.appendChild(script);
    });
}

async function handlePuterRequest(prompt) {
    try {
        await loadPuter();

        // Puter AI Chat
        // Uses logged-in user's account if available, or anonymous quota if allowed?
        // Tutorials say "Free Unlimited" but that usually implies some auth or quota.
        // We'll trust the API for now.
        const response = await window.puter.ai.chat(prompt);

        const text = typeof response === 'string' ? response : (response?.message?.content || JSON.stringify(response));
        sendResponse({ type: 'SUCCESS', result: text });

    } catch (error) {
        sendResponse({ type: 'ERROR', error: `Puter Error: ${error.message}` });
    }
}
