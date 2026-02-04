/**
 * LinkedIn Comment Copilot - Post Analyzer
 * Extracts context and metadata from LinkedIn posts
 */

const PostAnalyzer = {
    // ========================================================================
    // Author Seniority Detection
    // ========================================================================

    detectSeniority(headline) {
        const headline_lower = headline.toLowerCase();

        const seniorityPatterns = {
            'c-level': ['ceo', 'cto', 'cfo', 'coo', 'cmo', 'chief', 'founder', 'co-founder'],
            'vp': ['vp ', 'vice president', 'svp', 'evp'],
            'director': ['director', 'head of'],
            'manager': ['manager', 'lead', 'team lead', 'senior manager'],
            'senior': ['senior', 'sr.', 'principal', 'staff'],
            'mid': ['specialist', 'analyst', 'engineer', 'developer'],
            'entry': ['associate', 'junior', 'intern', 'trainee', 'assistant']
        };

        for (const [level, patterns] of Object.entries(seniorityPatterns)) {
            if (patterns.some(p => headline_lower.includes(p))) {
                return level;
            }
        }

        return 'unknown';
    },

    // ========================================================================
    // Post Tone Detection
    // ========================================================================

    detectTone(content) {
        const content_lower = content.toLowerCase();

        const toneIndicators = {
            personal: ['i ', 'my ', 'me ', 'myself', 'i\'m', 'i\'ve', 'realized', 'learned', 'struggled', 'journey'],
            promotional: ['excited to announce', 'we\'re hiring', 'check out', 'register now', 'link in', 'free trial', 'discount'],
            educational: ['how to', 'tips', 'guide', 'lesson', 'framework', 'strategy', 'here\'s what', 'thread'],
            celebratory: ['thrilled', 'honored', 'grateful', 'milestone', 'achievement', 'award', 'promoted'],
            controversial: ['unpopular opinion', 'hot take', 'disagree', 'controversy', 'problem with', 'stop doing'],
            professional: ['insights', 'research', 'data shows', 'according to', 'industry', 'market']
        };

        const scores = {};
        for (const [tone, indicators] of Object.entries(toneIndicators)) {
            scores[tone] = indicators.filter(i => content_lower.includes(i)).length;
        }

        const maxTone = Object.entries(scores).reduce((a, b) => a[1] > b[1] ? a : b);
        return maxTone[1] > 0 ? maxTone[0] : 'neutral';
    },

    // ========================================================================
    // Engagement Level Detection
    // ========================================================================

    detectEngagementLevel(metrics) {
        const { likes = 0, comments = 0, reposts = 0 } = metrics;
        const total = likes + comments * 3 + reposts * 2; // Weight comments and reposts higher

        if (total > 500) return 'viral';
        if (total > 100) return 'high';
        if (total > 20) return 'moderate';
        return 'low';
    },

    // ========================================================================
    // Industry Detection
    // ========================================================================

    detectIndustry(content, headline) {
        const combined = (content + ' ' + headline).toLowerCase();

        const industryKeywords = {
            'tech': ['software', 'developer', 'engineer', 'startup', 'saas', 'ai', 'ml', 'tech', 'coding', 'programming'],
            'finance': ['finance', 'banking', 'investment', 'financial', 'trading', 'fintech', 'venture capital'],
            'marketing': ['marketing', 'brand', 'content', 'seo', 'growth', 'demand gen', 'campaign'],
            'sales': ['sales', 'revenue', 'account executive', 'business development', 'quota', 'pipeline'],
            'hr': ['hr', 'human resources', 'talent', 'recruiting', 'hiring', 'people ops', 'culture'],
            'consulting': ['consulting', 'strategy', 'advisory', 'transformation', 'management consulting'],
            'healthcare': ['healthcare', 'medical', 'health', 'clinical', 'pharma', 'biotech'],
            'education': ['education', 'learning', 'teaching', 'academic', 'university', 'training']
        };

        for (const [industry, keywords] of Object.entries(industryKeywords)) {
            if (keywords.some(k => combined.includes(k))) {
                return industry;
            }
        }

        return 'general';
    },

    // ========================================================================
    // Content Complexity
    // ========================================================================

    analyzeComplexity(content) {
        const words = content.split(/\s+/).length;
        const sentences = content.split(/[.!?]+/).length;
        const avgWordsPerSentence = words / Math.max(sentences, 1);

        // Check for complex indicators
        const hasCode = /```|`[^`]+`/.test(content);
        const hasLinks = /https?:\/\//.test(content);
        const hasHashtags = /#\w+/.test(content);
        const hasMentions = /@\w+/.test(content);
        const hasNumbers = /\d+%|\d+x|\$\d+/.test(content);

        return {
            wordCount: words,
            sentenceCount: sentences,
            avgWordsPerSentence: Math.round(avgWordsPerSentence),
            hasCode,
            hasLinks,
            hasHashtags,
            hasMentions,
            hasNumbers,
            estimatedReadTime: Math.ceil(words / 200) // minutes at 200 WPM
        };
    },

    // ========================================================================
    // Full Analysis
    // ========================================================================

    analyze(postData) {
        const { content, author, hasMedia, metrics = {} } = postData;

        return {
            author: {
                name: author.name,
                headline: author.headline,
                seniority: this.detectSeniority(author.headline),
                industry: this.detectIndustry(content, author.headline)
            },
            post: {
                tone: this.detectTone(content),
                engagementLevel: this.detectEngagementLevel(metrics),
                hasMedia,
                complexity: this.analyzeComplexity(content)
            },
            recommendations: this.generateRecommendations(content, author)
        };
    },

    // ========================================================================
    // Comment Recommendations
    // ========================================================================

    generateRecommendations(content, author) {
        const tone = this.detectTone(content);
        const seniority = this.detectSeniority(author.headline);

        const recommendations = {
            suggestedTone: 'professional',
            suggestedLength: 'medium',
            suggestedApproach: 'supportive',
            riskLevel: 'low'
        };

        // Adjust based on author seniority
        if (['c-level', 'vp'].includes(seniority)) {
            recommendations.suggestedLength = 'concise';
            recommendations.riskLevel = 'medium';
        }

        // Adjust based on post tone
        if (tone === 'personal') {
            recommendations.suggestedTone = 'empathetic';
            recommendations.suggestedApproach = 'supportive';
        } else if (tone === 'controversial') {
            recommendations.riskLevel = 'high';
            recommendations.suggestedApproach = 'thoughtful';
        } else if (tone === 'educational') {
            recommendations.suggestedApproach = 'additive';
        }

        return recommendations;
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PostAnalyzer;
}
