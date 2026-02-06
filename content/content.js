/**
 * LinkedIn Comment Copilot - Content Script
 * Handles LinkedIn DOM interaction, post detection, and UI injection
 */

// ============================================================================
// Constants & Configuration
// ============================================================================

const CONFIG = {
    // Dwell time thresholds
    minDwellTime: 2000, // 2 seconds minimum hover
    buttonFadeDelay: 2000, // 2 seconds before showing button

    // Viewport detection
    viewportCenterThreshold: 0.3, // Post must be within 30% of viewport center

    // Scroll tracking
    scrollVelocityThreshold: 100, // pixels per second - ignore fast scrolls

    // UI
    buttonOffset: { x: 10, y: 10 },
    panelWidth: 380
};

// LinkedIn selectors (may need updates as LinkedIn changes their UI)
// LinkedIn selectors (Updated for 2026 robustness)
// LinkedIn selectors (Updated for 2026 robustness - AGGRESSIVE MODE)
const SELECTORS = {
    // Try everything that looks like a container
    feedPost: '[data-urn]', // Extremely broad: Catch anything with a URN
    postContent: '.feed-shared-update-v2__description, .feed-shared-inline-show-more-text, .update-components-text, span.break-words',
    postAuthor: '.update-components-actor__name, .feed-shared-actor__name, .update-components-actor__title, a.app-aware-link > span > span:first-child',
    postAuthorHeadline: '.update-components-actor__description, .feed-shared-actor__description',
    commentBox: '.comments-comment-box__form, .comments-comment-box, form',
    postContainer: '.feed-shared-update-v2, .occludable-update, div[data-id]'
};

// ============================================================================
// State Management
// ============================================================================

const state = {
    hoveredPost: null,
    hoverStartTime: null,
    scrollVelocity: 0,
    lastScrollY: 0,
    lastScrollTime: Date.now(),
    buttonVisible: false,
    panelVisible: false,
    currentButton: null,
    currentPanel: null,
    persistenceTimeout: null
};

// ============================================================================
// Scroll Velocity Tracking
// ============================================================================

let scrollTimeout;
window.addEventListener('scroll', () => {
    const now = Date.now();
    const deltaY = Math.abs(window.scrollY - state.lastScrollY);
    const deltaTime = now - state.lastScrollTime;

    if (deltaTime > 0) {
        state.scrollVelocity = deltaY / (deltaTime / 1000);
    }

    state.lastScrollY = window.scrollY;
    state.lastScrollTime = now;

    // Reset velocity after scroll stops
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
        state.scrollVelocity = 0;
    }, 150);
});

// ============================================================================
// Post Detection & Context Extraction
// ============================================================================

function isPostInViewportCenter(element) {
    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const postCenter = rect.top + rect.height / 2;
    const viewportCenter = viewportHeight / 2;

    const distanceFromCenter = Math.abs(postCenter - viewportCenter);
    const threshold = viewportHeight * CONFIG.viewportCenterThreshold;

    return distanceFromCenter < threshold;
}

function extractPostData(postElement) {
    const contentEl = postElement.querySelector(SELECTORS.postContent);
    const authorEl = postElement.querySelector(SELECTORS.postAuthor);
    const headlineEl = postElement.querySelector(SELECTORS.postAuthorHeadline);

    return {
        content: contentEl?.innerText?.trim() || '',
        author: {
            name: authorEl?.innerText?.trim() || 'Unknown',
            headline: headlineEl?.innerText?.trim() || ''
        },
        urn: postElement.getAttribute('data-urn') || '',
        hasMedia: !!postElement.querySelector('img, video'),
        timestamp: Date.now()
    };
}

// ============================================================================
// UI Components - Floating Button
// ============================================================================

// Initialize Vibe Engine
let vibeEngine;
try {
    vibeEngine = new VibeEngine();
} catch (e) {
    console.error('VibeEngine failed to load', e);
}

function createFloatingButton(postElement) {
    const container = document.createElement('div');
    container.className = 'lcc-button-container';
    container.style.cssText = `
        position: absolute;
        display: flex;
        align-items: center;
        gap: 8px;
        z-index: 10000;
        transition: all 0.3s ease;
    `;

    const mainBtn = document.createElement('button');
    mainBtn.className = 'lcc-suggest-btn';
    mainBtn.innerHTML = `
        <span style="font-size: 16px;">✨</span>
        <span>Suggest</span>
    `;
    mainBtn.style.cssText = `
        background: white;
        border: 1px solid #191919;
        border-radius: 16px;
        padding: 5px 12px;
        color: #191919;
        display: flex;
        align-items: center;
        gap: 6px;
        font-family: -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
    `;

    // Hover effect for main button
    mainBtn.onmouseover = () => {
        mainBtn.style.background = '#eef3f8';
        mainBtn.style.boxShadow = 'inset 0 0 0 1px #0a66c2';
    };
    mainBtn.onmouseout = () => {
        mainBtn.style.background = 'transparent';
        mainBtn.style.boxShadow = 'none';
    };

    // Quick Vibe Container (Hidden by default)
    const vibeContainer = document.createElement('div');
    vibeContainer.className = 'lcc-vibe-container';
    vibeContainer.style.cssText = `
        display: flex;
        gap: 4px;
        opacity: 0;
        transform: translateX(-10px);
        transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        pointer-events: none;
    `;

    container.appendChild(mainBtn);
    container.appendChild(vibeContainer);

    // Hover interactions
    container.addEventListener('mouseenter', async () => {
        // Use passed postElement instead of global state
        if (!postElement || vibeContainer.children.length > 0) return;

        // Lazy analyze post
        const postData = extractPostData(postElement);
        const vibes = vibeEngine ? vibeEngine.analyze(postData.content) : [];

        // Render Vibe Buttons
        vibeContainer.innerHTML = '';
        vibes.slice(0, 3).forEach(vibe => {
            const btn = document.createElement('button');
            btn.className = 'lcc-vibe-btn';
            btn.innerHTML = `<span>${vibe.icon}</span>`;
            btn.title = vibe.label; // Tooltip
            btn.style.cssText = `
                width: 32px;
                height: 32px;
                border-radius: 50%;
                border: none;
                background: white;
                box-shadow: 0 2px 5px rgba(0,0,0,0.1);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 16px;
                transition: transform 0.1s;
            `;

            btn.onmouseover = () => btn.style.transform = 'scale(1.2)';
            btn.onmouseout = () => btn.style.transform = 'scale(1)';

            btn.onclick = (e) => {
                e.stopPropagation();
                showSuggestionPanel(postElement, vibe);
            };

            vibeContainer.appendChild(btn);
        });

        // Show container
        vibeContainer.style.opacity = '1';
        vibeContainer.style.transform = 'translateX(0)';
        vibeContainer.style.pointerEvents = 'auto';
    });

    return container;
}

// Renamed for clarity: Injects permanent button
function injectButton(postElement) {
    if (postElement.dataset.lccEnhanced) return;

    // Find Header to Inject Into (Try multiple newer selectors)
    const header = postElement.querySelector('.update-components-actor') ||
        postElement.querySelector('.feed-shared-actor') ||
        postElement.querySelector('.update-components-header') ||
        postElement.querySelector('.feed-shared-actor__container') ||
        postElement.querySelector('.update-components-actor__container') ||
        postElement.querySelector('.feed-shared-control-menu'); // Fallback to menu area

    if (!header) {
        // console.warn('LCC: Could not find header for post', postElement);
        return;
    }

    // Pass postElement to createFloatingButton for local scoping
    const buttonContainer = createFloatingButton(postElement);

    // V2: Header Injection Styles - Permanent
    buttonContainer.style.position = 'relative';
    buttonContainer.style.marginLeft = 'auto'; // Push to right
    buttonContainer.style.marginRight = '8px'; // Add some spacing
    buttonContainer.style.alignSelf = 'flex-start'; // Align top
    buttonContainer.style.marginTop = '4px';
    buttonContainer.style.opacity = '1'; // Visible immediately
    buttonContainer.style.transform = 'translateY(0)';
    buttonContainer.style.zIndex = '2147483647'; // Max Z-Index

    // Ensure header is positioned for containment
    if (getComputedStyle(header).position === 'static') {
        header.style.position = 'relative';
    }
    header.style.overflow = 'visible';

    // Insert before the control menu if possible (3 dots)
    const menu = header.querySelector('.feed-shared-control-menu');
    if (menu) {
        header.insertBefore(buttonContainer, menu);
    } else {
        header.appendChild(buttonContainer);
    }

    // Mark as enhanced
    postElement.dataset.lccEnhanced = 'true';

    // Update Debug Badge
    updateDebug('success', 'Buttons Injected!');

    // Click handler for main button
    buttonContainer.querySelector('.lcc-suggest-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        showSuggestionPanel(postElement);
    });
}

function hideButton() {
    if (state.currentButton) {
        state.currentButton.style.opacity = '0';
        state.currentButton.style.transform = 'translateY(5px)';
        setTimeout(() => {
            state.currentButton?.remove();
            state.currentButton = null;
        }, 300);
    }
    state.buttonVisible = false;
}

// ============================================================================
// UI Components - Suggestion Panel
// ============================================================================

function createSuggestionPanel() {
    const panel = document.createElement('div');
    panel.id = 'lcc-panel';
    panel.innerHTML = `
    <div class="lcc-panel-header">
      <span class="lcc-title">💬 Comment Copilot</span>
      <button class="lcc-close">×</button>
    </div>
    <div class="lcc-panel-body">
      <div class="lcc-status">
        <div class="lcc-progress"></div>
        <span class="lcc-status-text">Reading post...</span>
      </div>
      <div class="lcc-result" style="display: none;">
        <div class="lcc-comment-preview"></div>
        <div class="lcc-actions">
          <button class="lcc-action lcc-copy" title="Copy to clipboard">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            Copy
          </button>
          <button class="lcc-action lcc-regen" title="Generate another">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M23 4v6h-6M1 20v-6h6"></path>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
            Another
          </button>
          <button class="lcc-action lcc-edit" title="Edit manually">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            Edit
          </button>
          <button class="lcc-action lcc-insert" title="Insert into comment box" style="background: linear-gradient(135deg, #057642 0%, #046c3c 100%); color: white; border: none;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            Insert
          </button>
        </div>
      </div>
      <div class="lcc-error" style="display: none;">
        <span class="lcc-error-text"></span>
        <button class="lcc-retry">Retry</button>
      </div>
    </div>
    <div class="lcc-footer">
      <span class="lcc-rate-limit"></span>
    </div>
  `;

    return panel;
}

async function showSuggestionPanel(postElement, vibe = null) {
    hideButton();

    if (state.currentPanel) {
        state.currentPanel.remove();
    }

    const panel = createSuggestionPanel();
    const rect = postElement.getBoundingClientRect();

    panel.style.cssText = `
    position: fixed;
    top: ${Math.min(rect.top, window.innerHeight - 300)}px;
    right: 20px;
    width: ${CONFIG.panelWidth}px;
    z-index: 10001;
  `;

    document.body.appendChild(panel);
    state.currentPanel = panel;
    state.panelVisible = true;

    // Setup event listeners
    panel.querySelector('.lcc-close').addEventListener('click', hidePanel);
    panel.querySelector('.lcc-copy').addEventListener('click', handleCopy);
    panel.querySelector('.lcc-regen').addEventListener('click', () => handleRegenerate(postElement, vibe));
    panel.querySelector('.lcc-edit').addEventListener('click', handleEdit);
    panel.querySelector('.lcc-insert').addEventListener('click', () => handleInsert(postElement));
    panel.querySelector('.lcc-retry')?.addEventListener('click', () => handleRegenerate(postElement, vibe));

    // Generate comment
    await generateAndDisplayComment(postElement, vibe);
}

function hidePanel() {
    if (state.currentPanel) {
        state.currentPanel.style.opacity = '0';
        state.currentPanel.style.transform = 'translateX(20px)';
        setTimeout(() => {
            state.currentPanel?.remove();
            state.currentPanel = null;
        }, 300);
    }
    state.panelVisible = false;
}

// ============================================================================
// Comment Generation & Display
// ============================================================================

async function generateAndDisplayComment(postElement, vibe = null) {
    const panel = state.currentPanel;
    if (!panel) return;

    const statusEl = panel.querySelector('.lcc-status');
    const statusText = panel.querySelector('.lcc-status-text');
    const resultEl = panel.querySelector('.lcc-result');
    const errorEl = panel.querySelector('.lcc-error');
    const previewEl = panel.querySelector('.lcc-comment-preview');
    const rateLimitEl = panel.querySelector('.lcc-rate-limit');

    // Reset state
    statusEl.style.display = 'block';
    resultEl.style.display = 'none';
    errorEl.style.display = 'none';

    // Simulate reading time with progress
    const postData = extractPostData(postElement);
    const readTime = Math.min(2000 + postData.content.length * 10, 5000);

    statusText.textContent = 'Reading post...';
    await delay(readTime * 0.3);
    statusText.textContent = 'Analyzing context...';
    await delay(readTime * 0.3);
    statusText.textContent = 'Generating comment...';

    // 1. Orphan/Context Check
    if (!chrome.runtime || !chrome.runtime.sendMessage) {
        statusEl.style.display = 'none';
        errorEl.style.display = 'block';
        panel.querySelector('.lcc-error-text').textContent = 'Extension updated. Please refresh the page.';
        return;
    }

    try {
        // Fetch settings first to decide provider
        const settings = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });

        let response;

        if (settings.llmProvider === 'nano' || settings.llmProvider === 'puter') {
            // -----------------------------------------------------------
            // Use Local AI Bridge (Main World) - Nano or Puter
            // -----------------------------------------------------------
            const isPuter = settings.llmProvider === 'puter';
            statusText.textContent = isPuter ? 'Running Puter.js...' : 'Running Local Gemini Nano...';

            response = await new Promise((resolve, reject) => {
                const handler = (event) => {
                    // Check source to avoid noise
                    if (!event.data || event.data.source !== 'LCC_AI_BRIDGE') return;

                    if (event.data.type === 'SUCCESS') {
                        window.removeEventListener('message', handler);

                        // Parse result if needed (Bridge returns raw text)
                        let text = event.data.result || '';
                        let analysis = {};
                        try {
                            const jsonMatch = text.match(/\{[\s\S]*\}/);
                            if (jsonMatch) {
                                const parsed = JSON.parse(jsonMatch[0]);
                                text = parsed.comment || text;
                                analysis = parsed.analysis || {};
                            }
                        } catch (e) { }

                        resolve({
                            success: true,
                            comment: text,
                            analysis,
                            rateLimit: { remaining: 'Unlimited' }
                        });
                    } else if (event.data.type === 'DOWNLOAD_PROGRESS') {
                        // Update progress in UI
                        if (event.data.total > 0) {
                            const percent = Math.round((event.data.loaded / event.data.total) * 100);
                            statusText.textContent = `Downloading Model: ${percent}%`;
                        }
                    } else if (event.data.type === 'ERROR') {
                        window.removeEventListener('message', handler);
                        reject(new Error(event.data.error || 'Unknown AI Error'));
                    }
                };

                window.addEventListener('message', handler);

                // Map maxTokens to explicit instructions (Match Service Worker logic)
                const tokens = parseInt(settings.maxTokens) || 50;
                let lengthInstruction = "Keep it concise.";
                if (tokens <= 50) lengthInstruction = "Extremely short. Max 10 words. One punchy sentence.";
                else if (tokens <= 100) lengthInstruction = "Short and concise. Around 25 words. 1-2 sentences.";
                else if (tokens <= 150) lengthInstruction = "Moderate length. Around 40 words. Add some depth.";
                else if (tokens >= 300) lengthInstruction = "Detailed and thoughtful. Around 80 words. Expand on the topic.";

                // Construct Prompt
                const fullPrompt = `You are a LinkedIn comment assistant.
POST:
${postData.content.slice(0, 1000)}

Reply to this post professionally. ${lengthInstruction} No emojis at start.`;

                window.postMessage({
                    source: 'LCC_CONTENT_SCRIPT',
                    type: isPuter ? 'EXECUTE_PUTER' : 'EXECUTE_NANO',
                    prompt: fullPrompt,
                    settings
                }, '*');

                // Timeout (30s)
                setTimeout(() => {
                    window.removeEventListener('message', handler);
                    reject(new Error('AI Request timed out. Check connection.'));
                }, 30000);
            });

        } else {
            // -----------------------------------------------------------
            // Standard Remote Provider (Background)
            // -----------------------------------------------------------
            response = await chrome.runtime.sendMessage({
                type: 'GENERATE_COMMENT',
                postData,
                // Add vibe context if needed by background
                vibe
            });
        }

        if (response.success) {
            statusEl.style.display = 'none';
            resultEl.style.display = 'block';

            // Humanizer: Typewriter simulation
            previewEl.textContent = '';
            await typewriterEffect(previewEl, response.comment);

            // Update rate limit display
            if (response.rateLimit) {
                rateLimitEl.textContent = response.rateLimit.remaining === 'Unlimited'
                    ? '∞ (Local/Puter)'
                    : `${response.rateLimit.remaining} suggestions remaining`;
            }
        } else {
            throw new Error(response.error);
        }

    } catch (error) {
        statusEl.style.display = 'none';
        errorEl.style.display = 'block';
        panel.querySelector('.lcc-error-text').textContent = error.message;
    }
}

// ============================================================================
// Action Handlers
// ============================================================================

function sendLearningSignal(finalText, actionType) {
    if (!finalText || finalText.length < 5) return;

    try {
        chrome.runtime.sendMessage({
            type: 'LEARN_FROM_INTERACTION',
            payload: {
                finalText,
                action: actionType,
                timestamp: Date.now()
            }
        });
    } catch (e) {
        console.warn('Learning signal failed', e);
    }
}

function handleCopy() {
    const previewEl = state.currentPanel?.querySelector('.lcc-comment-preview');
    if (previewEl) {
        const text = previewEl.textContent;
        navigator.clipboard.writeText(text).then(() => {
            const copyBtn = state.currentPanel.querySelector('.lcc-copy');
            const originalText = copyBtn.innerHTML;
            copyBtn.innerHTML = '✓ Copied!';
            copyBtn.style.background = '#28a745';

            // Trigger Learning Signal
            sendLearningSignal(text, 'copy');

            setTimeout(() => {
                copyBtn.innerHTML = originalText;
                copyBtn.style.background = '';
            }, 2000);
        });
    }
}

async function handleRegenerate(postElement, vibe = null) {
    await generateAndDisplayComment(postElement, vibe);
}

function handleEdit() {
    const previewEl = state.currentPanel?.querySelector('.lcc-comment-preview');
    if (previewEl) {
        previewEl.contentEditable = 'true';
        previewEl.focus();
        previewEl.style.border = '1px solid #0077b5';
        previewEl.style.borderRadius = '8px';
        previewEl.style.padding = '8px';
    }
}

async function handleInsert(postElement) {
    const previewEl = state.currentPanel?.querySelector('.lcc-comment-preview');
    if (!previewEl) return;

    const commentText = previewEl.textContent;
    const insertBtn = state.currentPanel.querySelector('.lcc-insert');

    // Feedback - Start
    const originalText = insertBtn.innerHTML;
    insertBtn.innerHTML = 'Inserting...';

    try {
        // 1. Find or open comment box
        // Modern LinkedIn often nests the box deep, or changes class names.
        // We look for multiple potential container classes.
        let commentBox = postElement.querySelector('.comments-comment-box__form, .comments-comment-box, form.comments-comment-box__form, .feed-shared-update-v2__comments-box');

        if (!commentBox) {
            // Try to click the "Comment" button to open the box
            let commentButton = postElement.querySelector(
                '.social-actions-button.comment-button, ' +
                'button[aria-label*="Comment"], ' +
                'button[aria-label*="comment"], ' +
                '.feed-shared-social-action-bar__action-btn--comment'
            );

            // Fallback: Text-based search for button
            if (!commentButton) {
                const buttons = Array.from(postElement.querySelectorAll('button'));
                commentButton = buttons.find(b => b.innerText.trim().toLowerCase() === 'comment');
            }

            if (commentButton) {
                commentButton.click();

                // Wait for box to appear (max 3s, poll every 100ms)
                let attempts = 0;
                while (attempts < 30) {
                    await delay(100);
                    // Broader selector for the box
                    commentBox = postElement.querySelector(
                        '.comments-comment-box__form, ' +
                        '.comments-comment-box, ' +
                        'form.comments-comment-box__form, ' +
                        '.feed-shared-update-v2__comments-box, ' +
                        '.display-flex.flex-column.ml4' // Common wrapper class
                    );
                    if (commentBox) break;
                    attempts++;
                }
            }
        }

        if (!commentBox) {
            // Fallback: Look for the editor directly within the post (skipping the box check)
            const directEditor = postElement.querySelector('.ql-editor, .msg-form__contenteditable, div[contenteditable="true"], div[role="textbox"]');
            if (directEditor) {
                // If editor exists, we can use its parent as a proxy for the box
                commentBox = directEditor.parentElement;
            } else {
                // Last resort: Check if the post opened in a modal (document level search limited to modal)
                const modal = document.querySelector('.artdeco-modal');
                if (modal && modal.contains(postElement)) {
                    const modalEditor = modal.querySelector('div[contenteditable="true"], div[role="textbox"]');
                    if (modalEditor) commentBox = modalEditor.parentElement;
                }

                if (!commentBox) throw new Error('Could not find comment box');
            }
        }

        // 2. Find the editor
        // LinkedIn uses different editors depending on A/B tests (ProseMirror, Quill, etc.)
        const editor = commentBox.querySelector('.ql-editor, .msg-form__contenteditable, div[contenteditable="true"], div[role="textbox"]');
        if (!editor) {
            throw new Error('Could not find text editor');
        }

        // 3. Insert Text via Human Simulation
        editor.focus();

        // Use the new Human Typing Simulation
        await simulateHumanTyping(editor, commentText);

        // 4. Trigger final events to ensure "Post" button is enabled
        const eventOpts = { bubbles: true, composed: true };
        editor.dispatchEvent(new Event('change', eventOpts));

        // Focusout/in cycle often triggers validation
        editor.dispatchEvent(new FocusEvent('blur', eventOpts));
        editor.dispatchEvent(new FocusEvent('focus', eventOpts));

        // Feedback - Success
        insertBtn.innerHTML = '✓ Ready!';
        insertBtn.style.background = '#28a745';

        // Trigger Learning Signal
        sendLearningSignal(commentText, 'insert');

        // Hide panel after a moment
        setTimeout(() => {
            hidePanel();
        }, 1500);

    } catch (error) {
        console.error('Insert failed:', error);
        insertBtn.innerHTML = '❌ Failed';
        insertBtn.style.background = '#d9534f';
        setTimeout(() => {
            insertBtn.innerHTML = originalText;
            insertBtn.style.background = '';
        }, 2000);
    }
}

// ============================================================================
// Hover & Dwell Time Tracking
// ============================================================================

function setupPostTracking() {
    // 1. Initial Scan
    const existingPosts = document.querySelectorAll(SELECTORS.feedPost);
    existingPosts.forEach(injectButton);

    // 2. Observe for new posts (Infinite Scroll)
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === 1) { // Element node
                    // Check if node itself is a post
                    if (node.matches && node.matches(SELECTORS.feedPost)) {
                        injectButton(node);
                    }
                    // Check children
                    const posts = node.querySelectorAll ? node.querySelectorAll(SELECTORS.feedPost) : [];
                    posts.forEach(injectButton);
                }
            });
        });
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

// ============================================================================
// Utilities
// ============================================================================

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// Debug Badge (For User Feedback)
// ============================================================================

function createDebugBadge() {
    const badge = document.createElement('div');
    badge.id = 'lcc-debug-badge';
    badge.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 20px; // Left side to avoid chat windows
        padding: 8px 12px;
        background: #333;
        color: white;
        border-radius: 20px;
        font-family: monospace;
        font-size: 12px;
        z-index: 2147483647;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        pointer-events: none;
        display: flex;
        align-items: center;
        gap: 8px;
    `;
    badge.innerHTML = `
        <span style="width: 10px; height: 10px; background: red; border-radius: 50%; display: inline-block;" id="lcc-debug-dot"></span>
        <span id="lcc-debug-text">LCC: Loading...</span>
    `;
    document.body.appendChild(badge);
}

function updateDebug(status, message) {
    const dot = document.getElementById('lcc-debug-dot');
    const text = document.getElementById('lcc-debug-text');
    if (!dot || !text) return;

    text.textContent = `LCC: ${message}`;
    if (status === 'error') dot.style.background = 'red';
    if (status === 'warning') dot.style.background = 'orange';
    if (status === 'success') dot.style.background = '#00ff00';
    if (status === 'info') dot.style.background = '#0077b5';
}

// ============================================================================
// Initialization
// ============================================================================

function init() {
    console.log('LinkedIn Comment Copilot content script loaded');
    createDebugBadge();
    updateDebug('error', 'Script Loaded (Waiting for Feed)');

    // Wait for feed to load
    const observer = new MutationObserver((mutations, obs) => {
        const feed = document.querySelector(SELECTORS.feedPost);
        if (feed) {
            updateDebug('warning', 'Feed Detected');
            // obs.disconnect(); // Don't disconnect, keep watching for re-renders
            setupPostTracking();
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // Also try immediately in case feed is already loaded
    if (document.querySelector(SELECTORS.feedPost)) {
        updateDebug('warning', 'Feed Detected (Immediate)');
        setupPostTracking();
    } else {
        // Fallback: Check for ANY linkedin body content to confirm mismatch vs not loading
        if (document.querySelector('#global-nav')) {
            updateDebug('error', 'Nav Found, No Feed Yet');
        }
    }
}

// Run on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

/**
 * Simulates human typing with variable speed, pauses, and error correction
 */
function simulateHumanTyping(element, text) {
    return new Promise(async (resolve) => {
        // Clear existing content if needed, or append.
        // For comment boxes, we usually want to start fresh or append. 
        // Let's assume we append to whatever is focused/current.

        let i = 0;
        while (i < text.length) {
            // 1. Chance to make a mistake (5%)
            if (Math.random() < 0.05 && i > 0) {
                const wrongChar = String.fromCharCode(97 + Math.floor(Math.random() * 26)); // Random lowercase
                document.execCommand('insertText', false, wrongChar);
                triggerInputEvents(element, wrongChar);

                // Reaction delay (realizing mistake)
                await delay(Math.random() * 200 + 150);

                // Backspace
                document.execCommand('delete', false);
                triggerInputEvents(element, null); // Trigger input for delete

                await delay(Math.random() * 100 + 50);
            }

            // 2. Type correct character
            const char = text.charAt(i);
            document.execCommand('insertText', false, char);
            triggerInputEvents(element, char);
            i++;

            // 3. Variable delay between keystrokes
            let typeDelay = Math.random() * 30 + 30; // 30-60ms base

            // Slower for capitals or special chars
            if (char !== char.toLowerCase() || '.,?!'.includes(char)) {
                typeDelay += 50;
            }

            // Pauses
            if (char === ' ') typeDelay += 20;
            if (char === ',') typeDelay += Math.random() * 100 + 50;
            if ('.?!'.includes(char)) typeDelay += Math.random() * 300 + 150;

            await delay(typeDelay);
        }
        resolve();
    });
}

// Helper to trigger events that React/Frameworks listen for
function triggerInputEvents(element, char) {
    const eventOpts = { bubbles: true, composed: true };
    if (char) {
        element.dispatchEvent(new InputEvent('beforeinput', { ...eventOpts, inputType: 'insertText', data: char }));
        element.dispatchEvent(new InputEvent('input', { ...eventOpts, inputType: 'insertText', data: char }));
    } else {
        // Deletion events
        element.dispatchEvent(new InputEvent('beforeinput', { ...eventOpts, inputType: 'deleteContentBackward', data: null }));
        element.dispatchEvent(new InputEvent('input', { ...eventOpts, inputType: 'deleteContentBackward', data: null }));
    }
}

/**
 * Visual-only typewriter for the preview panel (non-editable elements)
 */
function typewriterEffect(element, text) {
    return new Promise(resolve => {
        let i = 0;
        function type() {
            if (i < text.length) {
                element.textContent += text.charAt(i);
                i++;
                setTimeout(type, Math.random() * 20 + 10);
            } else {
                resolve();
            }
        }
        type();
    });
}
