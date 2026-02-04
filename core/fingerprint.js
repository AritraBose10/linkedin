/**
 * LinkedIn Comment Copilot - User Style Fingerprinting
 * Learns from user's historical commenting patterns
 */

const StyleFingerprint = {
    // ========================================================================
    // Analyze Comment Patterns
    // ========================================================================

    analyzeComments(comments) {
        if (!comments || comments.length === 0) {
            return this.getDefaultProfile();
        }

        const analysis = {
            lengths: [],
            emojiCounts: [],
            questionCounts: [],
            sentenceStructures: [],
            openingPatterns: [],
            commonPhrases: {},
            punctuationStyles: {
                exclamation: 0,
                ellipsis: 0,
                dash: 0
            }
        };

        for (const comment of comments) {
            const text = typeof comment === 'string' ? comment : comment.text;

            // Length analysis
            const words = text.split(/\s+/).length;
            analysis.lengths.push(words);

            // Emoji analysis
            const emojis = text.match(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]/gu) || [];
            analysis.emojiCounts.push(emojis.length);

            // Question analysis
            const questions = (text.match(/\?/g) || []).length;
            analysis.questionCounts.push(questions);

            // Opening pattern
            const firstWord = text.split(/\s+/)[0]?.toLowerCase();
            if (firstWord) {
                analysis.openingPatterns.push(firstWord);
            }

            // Punctuation styles
            if (text.includes('!')) analysis.punctuationStyles.exclamation++;
            if (text.includes('...')) analysis.punctuationStyles.ellipsis++;
            if (text.includes(' - ') || text.includes('—')) analysis.punctuationStyles.dash++;

            // Common phrases (2-3 word combinations)
            this.extractPhrases(text, analysis.commonPhrases);
        }

        return this.buildProfile(analysis, comments.length);
    },

    // ========================================================================
    // Extract Common Phrases
    // ========================================================================

    extractPhrases(text, phraseMap) {
        const words = text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);

        for (let i = 0; i < words.length - 1; i++) {
            const bigram = `${words[i]} ${words[i + 1]}`;
            phraseMap[bigram] = (phraseMap[bigram] || 0) + 1;

            if (i < words.length - 2) {
                const trigram = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
                phraseMap[trigram] = (phraseMap[trigram] || 0) + 1;
            }
        }
    },

    // ========================================================================
    // Build Style Profile
    // ========================================================================

    buildProfile(analysis, totalComments) {
        const avgLength = this.average(analysis.lengths);
        const avgEmojis = this.average(analysis.emojiCounts);
        const avgQuestions = this.average(analysis.questionCounts);

        // Find most common opening patterns
        const openingCounts = {};
        for (const opening of analysis.openingPatterns) {
            openingCounts[opening] = (openingCounts[opening] || 0) + 1;
        }
        const topOpenings = Object.entries(openingCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([word]) => word);

        // Find most common phrases (appearing in >20% of comments)
        const minOccurrences = Math.max(2, Math.floor(totalComments * 0.2));
        const topPhrases = Object.entries(analysis.commonPhrases)
            .filter(([_, count]) => count >= minOccurrences)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([phrase]) => phrase);

        return {
            // Length preferences
            avgLength: this.categorizeLength(avgLength),
            avgWords: `${Math.round(avgLength * 0.8)}-${Math.round(avgLength * 1.2)}`,
            lengthVariance: this.calculateVariance(analysis.lengths),

            // Emoji usage
            emojiRate: this.categorizeEmojiRate(avgEmojis),
            avgEmojisPerComment: avgEmojis.toFixed(1),

            // Question usage
            questionRate: avgQuestions > 0.5 ? 'frequent' : avgQuestions > 0.2 ? 'occasional' : 'rare',

            // Style markers
            usesExclamation: analysis.punctuationStyles.exclamation / totalComments > 0.3,
            usesEllipsis: analysis.punctuationStyles.ellipsis / totalComments > 0.1,
            usesDashes: analysis.punctuationStyles.dash / totalComments > 0.1,

            // Patterns
            preferredOpenings: topOpenings,
            commonPhrases: topPhrases,

            // Metadata
            sampleSize: totalComments,
            lastUpdated: Date.now()
        };
    },

    // ========================================================================
    // Helper Methods
    // ========================================================================

    average(arr) {
        if (!arr.length) return 0;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    },

    calculateVariance(arr) {
        const avg = this.average(arr);
        const squareDiffs = arr.map(value => Math.pow(value - avg, 2));
        return Math.sqrt(this.average(squareDiffs));
    },

    categorizeLength(avgWords) {
        if (avgWords < 15) return 'short';
        if (avgWords < 35) return 'medium';
        if (avgWords < 60) return 'long';
        return 'very-long';
    },

    categorizeEmojiRate(avgEmojis) {
        if (avgEmojis < 0.1) return 'never';
        if (avgEmojis < 0.5) return 'rarely';
        if (avgEmojis < 1.5) return 'occasional';
        if (avgEmojis < 3) return 'frequent';
        return 'heavy';
    },

    // ========================================================================
    // Default Profile
    // ========================================================================

    getDefaultProfile() {
        return {
            avgLength: 'medium',
            avgWords: '20-40',
            lengthVariance: 10,
            emojiRate: 'occasional',
            avgEmojisPerComment: '0.5',
            questionRate: 'occasional',
            usesExclamation: true,
            usesEllipsis: false,
            usesDashes: false,
            preferredOpenings: [],
            commonPhrases: [],
            sampleSize: 0,
            lastUpdated: null
        };
    },

    // ========================================================================
    // Apply Style to Generated Comment
    // ========================================================================

    applyStyle(comment, profile) {
        let styled = comment;

        // Adjust emoji usage
        if (profile.emojiRate === 'never') {
            styled = styled.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]/gu, '');
        } else if (profile.emojiRate === 'rarely') {
            // Remove all but one emoji
            const emojis = styled.match(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]/gu) || [];
            if (emojis.length > 1) {
                for (let i = 1; i < emojis.length; i++) {
                    styled = styled.replace(emojis[i], '');
                }
            }
        }

        // Adjust exclamation usage
        if (!profile.usesExclamation) {
            styled = styled.replace(/!/g, '.');
        }

        return styled.trim();
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StyleFingerprint;
}
