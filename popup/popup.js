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
            elements.statusValue.className = 'status-value disconnected';
            elements.apiAlert.classList.add('show');
        } else {
            elements.statusValue.textContent = 'Ready';
            elements.statusValue.className = 'status-value connected';
            elements.apiAlert.classList.remove('show');
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
        elements.statusValue.className = 'status-value disconnected';
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
