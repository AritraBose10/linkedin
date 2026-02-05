/**
 * LinkedIn Comment Copilot - Vibe Engine (Sentiment Analysis)
 * Determines the category of a post to suggest appropriate actions.
 */

class VibeEngine {
    constructor() {
        this.categories = {
            CELEBRATION: {
                keywords: ['congratulations', 'promote', 'promotion', 'thrilled', 'excited', 'honored', 'happy to share', 'achievement', 'milestone', 'award', 'proud'],
                vibes: [
                    { id: 'congrats', icon: '🎉', label: 'Celebrate', prompt: 'Congratulate them warmly on this achievement' },
                    { id: 'curious', icon: '🤔', label: 'Ask How', prompt: 'Ask a specific question about how they achieved this' },
                    { id: 'support', icon: '🚀', label: 'Support', prompt: 'Express support for their continued success' }
                ]
            },
            HIRING: {
                keywords: ['hiring', 'looking for', 'join our team', 'open role', 'apply now', 'vacancy', 'job opening'],
                vibes: [
                    { id: 'refer', icon: '👋', label: 'Refer', prompt: 'Mention that I might know someone suitable' },
                    { id: 'boost', icon: '🚀', label: 'Boost', prompt: 'Comment for reach to help them find candidates' },
                    { id: 'insight', icon: '💡', label: 'Question', prompt: 'Ask about the team culture or specific requirements' }
                ]
            },
            SENSITIVE: {
                keywords: ['layoff', 'laid off', 'fired', 'grief', 'rest in peace', 'rip', 'sad news', 'difficult time', 'heartbroken', 'loss', 'struggle'],
                vibes: [
                    { id: 'support', icon: '💙', label: 'Support', prompt: 'Offer kind words of support and encouragement' },
                    { id: 'connect', icon: '🤝', label: 'Connect', prompt: 'Offer to connect or help if possible' },
                    { id: 'kindness', icon: '🙏', label: 'Kindness', prompt: 'Send thoughts and strength' }
                ]
            },
            EDUCATIONAL: {
                keywords: ['tip', 'trick', 'how to', 'guide', 'lesson', 'learned', 'insight', 'strategy', 'analysis', 'perspective'],
                vibes: [
                    { id: 'agree', icon: '👍', label: 'Agree', prompt: 'Validate their point with your own experience' },
                    { id: 'debate', icon: '🤔', label: 'Question', prompt: 'Politely challenge or ask for clarification on a specific point' },
                    { id: 'value', icon: '💎', label: 'Add Value', prompt: 'Add an additional related insight to expand the discussion' }
                ]
            }
        };

        this.defaultVibes = [
            { id: 'insight', icon: '💡', label: 'Insight', prompt: 'Add a professional insight' },
            { id: 'question', icon: '❓', label: 'Question', prompt: 'Ask a relevant follow-up question' },
            { id: 'support', icon: '👍', label: 'Agree', prompt: 'Express agreement with specific reasoning' }
        ];
    }

    /**
     * Analyze post content and return appropriate vibes
     * @param {string} text 
     * @returns {Array} List of vibe objects
     */
    analyze(text) {
        if (!text) return this.defaultVibes;
        const lowerText = text.toLowerCase();

        // Check Sensitive First (Priority)
        if (this.matches(lowerText, this.categories.SENSITIVE.keywords)) {
            return this.categories.SENSITIVE.vibes;
        }

        // Check others
        if (this.matches(lowerText, this.categories.CELEBRATION.keywords)) {
            return this.categories.CELEBRATION.vibes;
        }
        if (this.matches(lowerText, this.categories.HIRING.keywords)) {
            return this.categories.HIRING.vibes;
        }
        if (this.matches(lowerText, this.categories.EDUCATIONAL.keywords)) {
            return this.categories.EDUCATIONAL.vibes;
        }

        return this.defaultVibes;
    }

    matches(text, keywords) {
        return keywords.some(keyword => text.includes(keyword));
    }
}

// Export
if (typeof module !== 'undefined') module.exports = VibeEngine;
else window.VibeEngine = VibeEngine;
