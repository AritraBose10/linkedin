/**
 * LinkedIn Comment Copilot - Style Engine
 * Analyzes authentic user comments to build a "Style Fingerprint"
 */

class StyleEngine {
    constructor() {
        this.STOP_WORDS = new Set(['the', 'and', 'to', 'of', 'a', 'in', 'is', 'it', 'you', 'that', 'for']);
    }

    /**
     * Analyze a corpus of comments to generate a profile
     * @param {string} corpus - Raw text containing multiple comments (newline separated)
     * @returns {Object} StyleProfile
     */
    analyze(corpus) {
        const comments = corpus.split('\n').filter(c => c.trim().length > 5);
        if (comments.length === 0) return this.getDefaultProfile();

        return {
            avgLength: this.calculateAvgLength(comments),
            emojiFrequency: this.calculateEmojiFrequency(comments),
            casing: this.detectCasing(comments),
            punctuation: this.detectPunctuation(comments),
            commonPhrases: this.extractCommonPhrases(comments),
            structure: this.detectStructure(comments),
            lastUpdated: Date.now()
        };
    }

    calculateAvgLength(comments) {
        const totalWords = comments.reduce((sum, c) => sum + c.trim().split(/\s+/).length, 0);
        const avg = Math.round(totalWords / comments.length);

        if (avg < 10) return 'very_short';
        if (avg < 25) return 'short';
        if (avg < 50) return 'medium';
        return 'long';
    }

    calculateEmojiFrequency(comments) {
        const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;
        const totalComments = comments.length;
        const commentsWithEmojis = comments.filter(c => emojiRegex.test(c)).length;
        const ratio = commentsWithEmojis / totalComments;

        if (ratio === 0) return 'never';
        if (ratio < 0.3) return 'rare';
        if (ratio < 0.7) return 'often';
        return 'heavy';
    }

    detectCasing(comments) {
        const lowercaseCount = comments.filter(c => c[0] === c[0].toLowerCase() && /[a-z]/.test(c[0])).length;
        const ratio = lowercaseCount / comments.length;

        return ratio > 0.5 ? 'lowercase' : 'standard';
    }

    detectPunctuation(comments) {
        // Check for exclamation usage
        const aggressiveExclamation = comments.filter(c => c.includes('!!')).length / comments.length;
        const noPunctuation = comments.filter(c => !/[.!?]$/.test(c.trim())).length / comments.length;

        if (aggressiveExclamation > 0.2) return 'excited';
        if (noPunctuation > 0.5) return 'relaxed'; // e.g. "thanks for this" (no dot)
        return 'standard';
    }

    detectStructure(comments) {
        const bulletPoints = comments.filter(c => c.includes('\n-') || c.includes('\n*') || c.includes('•')).length;
        const lineBreaks = comments.filter(c => c.includes('\n\n')).length;

        if (bulletPoints / comments.length > 0.3) return 'list_heavy';
        if (lineBreaks / comments.length > 0.5) return 'spaced';
        return 'paragraph';
    }

    extractCommonPhrases(comments) {
        // Simple bigram extrator
        const bigrams = {};

        comments.forEach(comment => {
            const words = comment.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);
            for (let i = 0; i < words.length - 1; i++) {
                const w1 = words[i];
                const w2 = words[i + 1];
                if (this.STOP_WORDS.has(w1) || this.STOP_WORDS.has(w2)) continue;

                const phrase = `${w1} ${w2}`;
                bigrams[phrase] = (bigrams[phrase] || 0) + 1;
            }
        });

        // Return top 5 phrases that appear more than once
        return Object.entries(bigrams)
            .filter(([_, count]) => count > 1)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([phrase]) => phrase);
    }

    getDefaultProfile() {
        return {
            avgLength: 'medium',
            emojiFrequency: 'rare',
            casing: 'standard',
            punctuation: 'standard',
            commonPhrases: [],
            structure: 'paragraph'
        };
    }
}

// Export for use in options page
if (typeof module !== 'undefined') module.exports = StyleEngine;
else window.StyleEngine = StyleEngine;
