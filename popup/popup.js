/**
 * LinkedIn Comment Copilot - Popup Script
 */

const elements = {
    statusValue: document.getElementById('statusValue'),
    suggestionsValue: document.getElementById('suggestionsValue'),
    remainingValue: document.getElementById('remainingValue'),
    apiAlert: document.getElementById('apiAlert'),
    goToLinkedIn: document.getElementById('goToLinkedIn'),
    openSettings: document.getElementById('openSettings')
};

async function checkStatus() {
    try {
        // Check settings
        const settings = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });

        if (!settings.apiKey) {
            elements.statusValue.textContent = 'Not configured';
            // Tailwind: Red text, red bg
            elements.statusValue.classList.remove('text-green-500', 'bg-green-50', 'dark:text-green-400', 'dark:bg-green-900/20');
            elements.statusValue.classList.add('text-red-500', 'bg-red-50', 'dark:text-red-400', 'dark:bg-red-900/20');

            elements.apiAlert.classList.remove('hidden');
        } else {
            elements.statusValue.textContent = 'Ready';
            // Tailwind: Green text, green bg
            elements.statusValue.classList.remove('text-red-500', 'bg-red-50', 'dark:text-red-400', 'dark:bg-red-900/20');
            elements.statusValue.classList.add('text-green-500', 'bg-green-50', 'dark:text-green-400', 'dark:bg-green-900/20');

            elements.apiAlert.classList.add('hidden');
        }

        // Check rate limit
        const rateLimit = await chrome.runtime.sendMessage({ type: 'CHECK_RATE_LIMIT' });

        if (rateLimit) {
            const used = 10 - rateLimit.remaining;
            elements.suggestionsValue.textContent = used;
            elements.remainingValue.textContent = rateLimit.remaining;
        }

    } catch (error) {
        console.error('Error checking status:', error);
        elements.statusValue.textContent = 'Error';
        elements.statusValue.classList.remove('text-green-500', 'bg-green-50');
        elements.statusValue.classList.add('text-red-500', 'bg-red-50');
    }
}

// Go to LinkedIn
elements.goToLinkedIn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://www.linkedin.com/feed/' });
});

// Open settings
elements.openSettings.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
});

// Initialize
document.addEventListener('DOMContentLoaded', checkStatus);
