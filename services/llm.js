/**
 * LinkedIn Comment Copilot - LLM Service
 * Model-agnostic API for OpenAI, Gemini, and Anthropic
 */

const LLMService = {
    // ========================================================================
    // Provider Configurations
    // ========================================================================

    providers: {
        openai: {
            endpoint: 'https://api.openai.com/v1/chat/completions',
            buildHeaders: (apiKey) => ({
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            }),
            buildBody: (messages, model, maxTokens, temperature) => ({
                model,
                messages,
                max_tokens: maxTokens,
                temperature
            }),
            parseResponse: (data) => data.choices[0].message.content
        },

        gemini: {
            endpoint: (model, apiKey) =>
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            buildHeaders: () => ({
                'Content-Type': 'application/json'
            }),
            buildBody: (messages, model, maxTokens, temperature) => ({
                contents: messages.map(m => ({
                    role: m.role === 'assistant' ? 'model' : (m.role === 'system' ? 'user' : m.role),
                    parts: [{ text: m.content }]
                })),
                generationConfig: {
                    maxOutputTokens: maxTokens,
                    temperature
                }
            }),
            parseResponse: (data) => data.candidates[0].content.parts[0].text
        },

        anthropic: {
            endpoint: 'https://api.anthropic.com/v1/messages',
            buildHeaders: (apiKey) => ({
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            }),
            buildBody: (messages, model, maxTokens, temperature) => ({
                model,
                max_tokens: maxTokens,
                messages: messages.filter(m => m.role !== 'system'),
                system: messages.find(m => m.role === 'system')?.content || '',
                temperature
            }),
            parseResponse: (data) => data.content[0].text
        }
    },

    // ========================================================================
    // Main API Call
    // ========================================================================

    async call(messages, settings) {
        const { llmProvider, apiKey, model, maxTokens, temperature } = settings;

        if (!apiKey) {
            throw new Error('API key not configured');
        }

        const provider = this.providers[llmProvider];
        if (!provider) {
            throw new Error(`Unknown provider: ${llmProvider}`);
        }

        // Build request
        const endpoint = typeof provider.endpoint === 'function'
            ? provider.endpoint(model, apiKey)
            : provider.endpoint;

        const headers = provider.buildHeaders(apiKey);
        const body = provider.buildBody(messages, model, maxTokens, temperature);

        // Make request with retry
        let lastError;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(body)
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`API error ${response.status}: ${errorText}`);
                }

                const data = await response.json();
                return provider.parseResponse(data);

            } catch (error) {
                lastError = error;

                // Don't retry on auth errors
                if (error.message.includes('401') || error.message.includes('403')) {
                    throw error;
                }

                // Wait before retry
                if (attempt < 2) {
                    await this.delay(1000 * (attempt + 1));
                }
            }
        }

        throw lastError;
    },

    // ========================================================================
    // Comment Generation Pipeline
    // ========================================================================

    async generateComment(postData, settings, userStyle = null) {
        // Stage 1: Analyze post
        const analysisMessages = [
            {
                role: 'system',
                content: `You analyze LinkedIn posts. Return JSON only:
{
  "focalPoint": "main topic in 1 sentence",
  "authorIntent": "inform|inspire|sell|vent|celebrate",
  "recommendedTone": "supportive|curious|professional|casual|contrarian",
  "keyTopics": ["topic1", "topic2"],
  "riskLevel": "low|medium|high"
}`
            },
            {
                role: 'user',
                content: `Analyze this LinkedIn post by ${postData.author.name} (${postData.author.headline}):\n\n${postData.content}`
            }
        ];

        let analysis;
        try {
            const analysisResponse = await this.call(analysisMessages, {
                ...settings,
                maxTokens: 200,
                temperature: 0.3
            });
            analysis = JSON.parse(analysisResponse.replace(/```json|```/g, '').trim());
        } catch {
            analysis = {
                focalPoint: postData.content.slice(0, 100),
                recommendedTone: 'professional',
                keyTopics: [],
                riskLevel: 'low'
            };
        }

        // Stage 2: Generate comment
        const styleGuide = userStyle ? `
Style: ${userStyle.avgLength} length, ${userStyle.emojiRate} emojis, ${userStyle.questionRate} questions.
${userStyle.commonPhrases?.length ? `Common phrases: ${userStyle.commonPhrases.join(', ')}` : ''}` : '';

        const generationMessages = [
            {
                role: 'system',
                content: `Generate an authentic LinkedIn comment. Be specific to the post content.

Context: ${JSON.stringify(analysis)}
${styleGuide}

RULES:
- NEVER use: "Great post", "Thanks for sharing", "Love this", "So true", "Couldn't agree more"
- NEVER start with: "Wow", "Amazing", emoji
- MUST: Add genuine insight, reference specific content, sound human
- Length: MAX 20 WORDS. Be concise.

Return ONLY the comment text.`
            },
            {
                role: 'user',
                content: `Generate a ${analysis.recommendedTone} comment about: ${analysis.focalPoint}`
            }
        ];

        const comment = await this.call(generationMessages, settings);

        return {
            comment: comment.trim().replace(/^["']|["']$/g, ''),
            analysis
        };
    },

    // ========================================================================
    // Regeneration with Different Angle
    // ========================================================================

    async regenerateWithAngle(postData, settings, angle = 'different') {
        const angles = {
            supportive: 'Write a supportive, encouraging comment that validates the author\'s perspective.',
            curious: 'Write a curious comment that asks a thoughtful follow-up question.',
            contrarian: 'Write a respectful comment that offers a different perspective or gentle pushback.',
            personal: 'Write a comment sharing a relevant personal experience or anecdote.',
            different: 'Write a completely different comment from typical responses.'
        };

        const messages = [
            {
                role: 'system',
                content: `${angles[angle] || angles.different}

Post by ${postData.author.name}:
${postData.content}

RULES:
- Be specific to this post
- Sound human, not AI-generated
- MAX 20 WORDS
- No generic phrases

Return ONLY the comment.`
            },
            {
                role: 'user',
                content: 'Generate the comment.'
            }
        ];

        const comment = await this.call(messages, settings);
        return comment.trim().replace(/^["']|["']$/g, '');
    },

    // ========================================================================
    // Utility
    // ========================================================================

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
};

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LLMService;
}
