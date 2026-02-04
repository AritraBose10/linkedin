/**
 * LinkedIn Comment Copilot - Smart Caching Service
 * Semantic hashing and variation-aware caching
 */

const CacheService = {
    // ========================================================================
    // Configuration
    // ========================================================================

    config: {
        maxEntries: 100,
        ttlMs: 24 * 60 * 60 * 1000, // 24 hours
        variationChance: 0.3 // 30% chance to apply variation
    },

    // ========================================================================
    // Semantic Hashing
    // ========================================================================

    generateSemanticHash(postData) {
        // Extract key semantic elements
        const elements = [
            postData.author.name.toLowerCase().slice(0, 20),
            this.extractKeywords(postData.content).slice(0, 5).join('|'),
            postData.content.length > 200 ? 'long' : postData.content.length > 100 ? 'medium' : 'short'
        ];

        // Simple hash function
        const str = elements.join('::');
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }

        return Math.abs(hash).toString(36);
    },

    extractKeywords(text) {
        const stopWords = new Set([
            'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
            'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
            'should', 'may', 'might', 'must', 'and', 'or', 'but', 'if', 'then',
            'else', 'when', 'at', 'by', 'for', 'with', 'about', 'to', 'from',
            'in', 'on', 'of', 'that', 'this', 'it', 'its', 'i', 'you', 'we', 'they'
        ]);

        return text
            .toLowerCase()
            .replace(/[^\w\s]/g, '')
            .split(/\s+/)
            .filter(word => word.length > 3 && !stopWords.has(word))
            .sort()
            .filter((word, i, arr) => arr.indexOf(word) === i);
    },

    // ========================================================================
    // Cache Operations
    // ========================================================================

    async get(postData) {
        const hash = this.generateSemanticHash(postData);
        const cache = await this.getCache();
        const entry = cache[hash];

        if (!entry) return null;

        // Check TTL
        if (Date.now() - entry.timestamp > this.config.ttlMs) {
            delete cache[hash];
            await this.saveCache(cache);
            return null;
        }

        // Never return verbatim - always apply variation
        let response = entry.responses[Math.floor(Math.random() * entry.responses.length)];

        if (Math.random() < this.config.variationChance) {
            response = this.applyVariation(response);
        }

        return {
            comment: response,
            fromCache: true,
            hash
        };
    },

    async set(postData, response) {
        const hash = this.generateSemanticHash(postData);
        const cache = await this.getCache();

        if (cache[hash]) {
            // Add to existing responses (max 5 variations)
            if (cache[hash].responses.length < 5) {
                cache[hash].responses.push(response);
            }
            cache[hash].timestamp = Date.now();
        } else {
            cache[hash] = {
                responses: [response],
                timestamp: Date.now()
            };
        }

        // Cleanup old entries
        await this.cleanup(cache);
        await this.saveCache(cache);
    },

    // ========================================================================
    // Variation Application
    // ========================================================================

    applyVariation(text) {
        const variations = [
            // Rephrase opening
            (t) => {
                const sentences = t.split(/(?<=[.!?])\s+/);
                if (sentences.length < 2) return t;

                const openings = [
                    'Interesting point - ',
                    'This resonates - ',
                    'I\'ve been thinking about this - ',
                    'You know, ',
                    ''
                ];

                const newOpening = openings[Math.floor(Math.random() * openings.length)];
                sentences[0] = newOpening + sentences[0].charAt(0).toLowerCase() + sentences[0].slice(1);
                return sentences.join(' ');
            },

            // Add/remove trailing thought
            (t) => {
                const additions = [
                    ' Curious to hear more.',
                    ' Would love to discuss further.',
                    ' Thanks for sharing this perspective.',
                    ''
                ];
                return t.replace(/[.!]$/, '') + additions[Math.floor(Math.random() * additions.length)];
            },

            // Slight word substitutions
            (t) => {
                const subs = {
                    'really': ['genuinely', 'truly', 'particularly'],
                    'think': ['believe', 'feel', 'sense'],
                    'important': ['crucial', 'vital', 'key'],
                    'interesting': ['fascinating', 'compelling', 'intriguing'],
                    'great': ['excellent', 'solid', 'strong']
                };

                let result = t;
                for (const [word, alternatives] of Object.entries(subs)) {
                    const regex = new RegExp(`\\b${word}\\b`, 'gi');
                    if (regex.test(result)) {
                        const alt = alternatives[Math.floor(Math.random() * alternatives.length)];
                        result = result.replace(regex, alt);
                        break; // Only one substitution
                    }
                }
                return result;
            }
        ];

        // Apply one random variation
        const variation = variations[Math.floor(Math.random() * variations.length)];
        return variation(text);
    },

    // ========================================================================
    // Storage Operations
    // ========================================================================

    async getCache() {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            const result = await chrome.storage.local.get('responseCache');
            return result.responseCache || {};
        }
        return {};
    },

    async saveCache(cache) {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            await chrome.storage.local.set({ responseCache: cache });
        }
    },

    async cleanup(cache) {
        const entries = Object.entries(cache);

        if (entries.length > this.config.maxEntries) {
            // Sort by timestamp, remove oldest
            entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
            const toKeep = entries.slice(0, this.config.maxEntries);

            // Clear and repopulate
            for (const key of Object.keys(cache)) {
                delete cache[key];
            }
            for (const [key, value] of toKeep) {
                cache[key] = value;
            }
        }

        // Remove expired entries
        const now = Date.now();
        for (const [key, value] of Object.entries(cache)) {
            if (now - value.timestamp > this.config.ttlMs) {
                delete cache[key];
            }
        }
    },

    async clear() {
        await this.saveCache({});
    }
};

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CacheService;
}
