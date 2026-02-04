/**
 * LinkedIn Comment Copilot - Anti-Detection System
 * Prevents pattern detection and ensures comment variance
 */

const AntiDetect = {
    // ========================================================================
    // Configuration
    // ========================================================================

    config: {
        maxCommentsPerHour: 10,
        minTimeBetweenComments: 30000, // 30 seconds
        similarityThreshold: 0.6, // Max 60% similarity allowed
        maxConsecutiveSameLength: 3,
        varianceFactors: {
            length: 0.2, // ±20% length variance
            emojiPosition: true,
            openingVariation: true
        }
    },

    // ========================================================================
    // Rate Limiting
    // ========================================================================

    async checkRateLimit() {
        const data = await this.getRateLimitData();
        const now = Date.now();
        const hourAgo = now - 60 * 60 * 1000;

        // Filter to last hour
        const recentTimestamps = data.timestamps.filter(ts => ts > hourAgo);

        // Check hourly limit
        if (recentTimestamps.length >= this.config.maxCommentsPerHour) {
            const oldestInWindow = Math.min(...recentTimestamps);
            const resetIn = Math.ceil((oldestInWindow + 60 * 60 * 1000 - now) / 1000 / 60);

            return {
                allowed: false,
                reason: `Hourly limit reached (${this.config.maxCommentsPerHour}/hour)`,
                resetIn,
                remaining: 0
            };
        }

        // Check minimum time between comments
        if (recentTimestamps.length > 0) {
            const lastComment = Math.max(...recentTimestamps);
            const timeSinceLastComment = now - lastComment;

            if (timeSinceLastComment < this.config.minTimeBetweenComments) {
                return {
                    allowed: false,
                    reason: 'Too soon after last comment',
                    waitSeconds: Math.ceil((this.config.minTimeBetweenComments - timeSinceLastComment) / 1000),
                    remaining: this.config.maxCommentsPerHour - recentTimestamps.length
                };
            }
        }

        return {
            allowed: true,
            remaining: this.config.maxCommentsPerHour - recentTimestamps.length
        };
    },

    async getRateLimitData() {
        // Use chrome.storage in extension context
        if (typeof chrome !== 'undefined' && chrome.storage) {
            const result = await chrome.storage.local.get('rateLimit');
            return result.rateLimit || { timestamps: [] };
        }
        return { timestamps: [] };
    },

    // ========================================================================
    // Similarity Detection
    // ========================================================================

    calculateSimilarity(text1, text2) {
        const words1 = new Set(text1.toLowerCase().split(/\s+/));
        const words2 = new Set(text2.toLowerCase().split(/\s+/));

        const intersection = new Set([...words1].filter(x => words2.has(x)));
        const union = new Set([...words1, ...words2]);

        return intersection.size / union.size;
    },

    async checkSimilarityToRecent(newComment) {
        const recentComments = await this.getRecentComments();

        for (const recent of recentComments) {
            const similarity = this.calculateSimilarity(newComment, recent.text);

            if (similarity > this.config.similarityThreshold) {
                return {
                    passed: false,
                    reason: `Comment too similar to recent (${Math.round(similarity * 100)}% match)`,
                    similarity
                };
            }
        }

        return { passed: true };
    },

    async getRecentComments() {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            const result = await chrome.storage.local.get('commentHistory');
            return (result.commentHistory || []).slice(0, 20);
        }
        return [];
    },

    // ========================================================================
    // Pattern Detection
    // ========================================================================

    async detectPatterns(newComment) {
        const recentComments = await this.getRecentComments();
        const issues = [];

        if (recentComments.length < 3) {
            return { hasPatterns: false, issues: [] };
        }

        // Check for repeated openings
        const newOpening = newComment.split(/\s+/).slice(0, 3).join(' ').toLowerCase();
        const recentOpenings = recentComments.map(c =>
            c.text.split(/\s+/).slice(0, 3).join(' ').toLowerCase()
        );

        const sameOpeningCount = recentOpenings.filter(o => o === newOpening).length;
        if (sameOpeningCount >= 2) {
            issues.push({
                type: 'repeated_opening',
                message: `Opening "${newOpening}" used ${sameOpeningCount} times recently`
            });
        }

        // Check for consistent length patterns
        const newLength = newComment.split(/\s+/).length;
        const recentLengths = recentComments.slice(0, 5).map(c => c.text.split(/\s+/).length);
        const avgLength = recentLengths.reduce((a, b) => a + b, 0) / recentLengths.length;
        const lengthVariance = Math.abs(newLength - avgLength) / avgLength;

        if (lengthVariance < 0.1) {
            issues.push({
                type: 'consistent_length',
                message: 'Comment length too consistent with recent comments'
            });
        }

        // Check for emoji position patterns
        const newEmojiPositions = this.getEmojiPositions(newComment);
        const recentEmojiPositions = recentComments.slice(0, 5).map(c =>
            this.getEmojiPositions(c.text)
        );

        if (newEmojiPositions.length > 0) {
            const samePositionCount = recentEmojiPositions.filter(positions =>
                this.arraysEqual(positions, newEmojiPositions)
            ).length;

            if (samePositionCount >= 2) {
                issues.push({
                    type: 'emoji_pattern',
                    message: 'Emoji placement follows a detectable pattern'
                });
            }
        }

        return {
            hasPatterns: issues.length > 0,
            issues
        };
    },

    getEmojiPositions(text) {
        const words = text.split(/\s+/);
        const positions = [];

        words.forEach((word, index) => {
            if (/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]/u.test(word)) {
                // Normalize position to start/middle/end
                const position = index / words.length;
                if (position < 0.25) positions.push('start');
                else if (position > 0.75) positions.push('end');
                else positions.push('middle');
            }
        });

        return positions;
    },

    arraysEqual(a, b) {
        return JSON.stringify(a) === JSON.stringify(b);
    },

    // ========================================================================
    // Variance Application
    // ========================================================================

    applyVariance(comment, profile = {}) {
        let varied = comment;

        // Randomly add minor typos (15-30% chance)
        if (Math.random() < 0.15) {
            varied = this.addSubtleTypo(varied);
        }

        // Vary emoji position
        if (this.config.varianceFactors.emojiPosition) {
            varied = this.varyEmojiPosition(varied);
        }

        // Add occasional self-correction (10% chance)
        if (Math.random() < 0.1) {
            varied = this.addSelfCorrection(varied);
        }

        return varied;
    },

    addSubtleTypo(text) {
        const typoTypes = [
            // Double letter
            (word) => {
                const i = Math.floor(Math.random() * (word.length - 1));
                return word.slice(0, i + 1) + word[i] + word.slice(i + 1);
            },
            // Swap adjacent letters
            (word) => {
                const i = Math.floor(Math.random() * (word.length - 1));
                return word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2);
            }
        ];

        const words = text.split(' ');
        // Only apply to words with 5+ letters
        const eligibleIndices = words
            .map((w, i) => w.length >= 5 ? i : -1)
            .filter(i => i >= 0);

        if (eligibleIndices.length === 0) return text;

        const targetIndex = eligibleIndices[Math.floor(Math.random() * eligibleIndices.length)];
        const typoFn = typoTypes[Math.floor(Math.random() * typoTypes.length)];

        words[targetIndex] = typoFn(words[targetIndex]);
        return words.join(' ');
    },

    varyEmojiPosition(text) {
        const emojis = text.match(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]/gu);
        if (!emojis || emojis.length === 0) return text;

        // 30% chance to move emoji
        if (Math.random() > 0.3) return text;

        // Remove emoji and possibly add elsewhere
        let noEmoji = text.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]/gu, '').trim();

        const emoji = emojis[0];
        const position = Math.random();

        if (position < 0.4) {
            return emoji + ' ' + noEmoji;
        } else if (position < 0.7) {
            return noEmoji + ' ' + emoji;
        } else {
            // Insert in middle
            const words = noEmoji.split(' ');
            const midPoint = Math.floor(words.length / 2);
            words.splice(midPoint, 0, emoji);
            return words.join(' ');
        }
    },

    addSelfCorrection(text) {
        const corrections = [
            ' (or maybe I should say',
            ' — well, actually',
            ' though I could be wrong about',
            ' if that makes sense'
        ];

        const sentences = text.split(/(?<=[.!?])\s+/);
        if (sentences.length < 2) return text;

        // Add correction to last sentence
        const correction = corrections[Math.floor(Math.random() * corrections.length)];
        return text + correction + '...';
    },

    // ========================================================================
    // Full Check
    // ========================================================================

    async runFullCheck(comment) {
        const results = {
            passed: true,
            warnings: [],
            blocks: []
        };

        // Check rate limit
        const rateLimit = await this.checkRateLimit();
        if (!rateLimit.allowed) {
            results.passed = false;
            results.blocks.push(rateLimit.reason);
        }

        // Check similarity
        const similarity = await this.checkSimilarityToRecent(comment);
        if (!similarity.passed) {
            results.passed = false;
            results.blocks.push(similarity.reason);
        }

        // Check patterns
        const patterns = await this.detectPatterns(comment);
        if (patterns.hasPatterns) {
            results.warnings = patterns.issues.map(i => i.message);
        }

        return results;
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AntiDetect;
}
