/**
 * LinkedIn Comment Copilot - Storage Service
 * Abstraction layer for chrome.storage and IndexedDB
 */

const StorageService = {
    // ========================================================================
    // Chrome Storage (for small data like settings)
    // ========================================================================

    async get(key) {
        const result = await chrome.storage.local.get(key);
        return result[key];
    },

    async set(key, value) {
        await chrome.storage.local.set({ [key]: value });
    },

    async remove(key) {
        await chrome.storage.local.remove(key);
    },

    async clear() {
        await chrome.storage.local.clear();
    },

    // ========================================================================
    // Settings Management
    // ========================================================================

    async getSettings() {
        const defaults = {
            llmProvider: 'openai',
            apiKey: '',
            model: 'gpt-4o-mini',
            maxTokens: 500,
            temperature: 0.8
        };

        const settings = await this.get('settings');
        return { ...defaults, ...settings };
    },

    async saveSettings(settings) {
        await this.set('settings', settings);
    },

    // ========================================================================
    // User Style Profile
    // ========================================================================

    async getUserStyle() {
        const defaults = {
            avgLength: 'medium',
            avgWords: '20-40',
            emojiRate: 'occasional',
            preferredTone: 'professional yet warm',
            phrases: [],
            lastUpdated: null
        };

        const style = await this.get('userStyle');
        return { ...defaults, ...style };
    },

    async saveUserStyle(style) {
        style.lastUpdated = Date.now();
        await this.set('userStyle', style);
    },

    // ========================================================================
    // Rate Limiting
    // ========================================================================

    async getRateLimitData() {
        const data = await this.get('rateLimit');
        return data || { timestamps: [] };
    },

    async saveRateLimitData(data) {
        await this.set('rateLimit', data);
    },

    // ========================================================================
    // Usage Statistics
    // ========================================================================

    async getUsageStats() {
        const defaults = {
            totalGenerated: 0,
            totalCopied: 0,
            totalRegenerated: 0,
            byDay: {}
        };

        const stats = await this.get('usageStats');
        return { ...defaults, ...stats };
    },

    async incrementStat(statName) {
        const stats = await this.getUsageStats();
        stats[statName] = (stats[statName] || 0) + 1;

        // Track by day
        const today = new Date().toISOString().split('T')[0];
        if (!stats.byDay[today]) {
            stats.byDay[today] = {};
        }
        stats.byDay[today][statName] = (stats.byDay[today][statName] || 0) + 1;

        await this.set('usageStats', stats);
    },

    // ========================================================================
    // Comment History (for anti-pattern detection)
    // ========================================================================

    async getRecentComments(limit = 20) {
        const comments = await this.get('commentHistory') || [];
        return comments.slice(0, limit);
    },

    async addCommentToHistory(comment) {
        const comments = await this.get('commentHistory') || [];
        comments.unshift({
            text: comment,
            timestamp: Date.now()
        });

        // Keep only last 100 comments
        await this.set('commentHistory', comments.slice(0, 100));
    },

    // ========================================================================
    // Cache Management
    // ========================================================================

    async getCachedResponse(hash) {
        const cache = await this.get('responseCache') || {};
        const entry = cache[hash];

        if (entry && Date.now() - entry.timestamp < 24 * 60 * 60 * 1000) {
            return entry.response;
        }

        return null;
    },

    async setCachedResponse(hash, response) {
        const cache = await this.get('responseCache') || {};
        cache[hash] = {
            response,
            timestamp: Date.now()
        };

        // Clean old entries (keep last 50)
        const entries = Object.entries(cache);
        if (entries.length > 50) {
            entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
            const newCache = Object.fromEntries(entries.slice(0, 50));
            await this.set('responseCache', newCache);
        } else {
            await this.set('responseCache', cache);
        }
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StorageService;
}
