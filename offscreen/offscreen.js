/**
 * Offscreen logic for Gemini Nano (window.ai)
 * Runs in a DOM context where window.ai is available.
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'EXECUTE_NANO') {
        runNano(message.prompt, message.settings)
            .then(result => sendResponse({ success: true, result }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Keep channel open
    }
});

async function runNano(promptText, settings) {
    if (!window.ai || !window.ai.languageModel) {
        throw new Error('Chrome Built-in AI not found in offscreen document. Flags might not be effective here?');
    }

    const capabilities = await window.ai.languageModel.capabilities();
    if (capabilities.available === 'no') {
        throw new Error('Gemini Nano model not downloaded/available.');
    }

    const session = await window.ai.languageModel.create({
        temperature: settings?.temperature || 0.8,
        topK: 3
    });

    // Monitor download if "after-download" (optional, for now we assume it works or fails)
    // If capabilities.available === 'after-download', create() triggers download.
    // We can just await it.

    const result = await session.prompt(promptText);
    return result;
}
