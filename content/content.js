/**
 * LinkedIn Comment Copilot - Content Script
 * Handles LinkedIn DOM interaction, post detection, and UI injection
 */

// ============================================================================
// Constants & Configuration
// ============================================================================

const CONFIG = {
    // Dwell time thresholds
    minDwellTime: 3000, // 3 seconds minimum hover
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
const SELECTORS = {
    feedPost: '[data-urn*="activity"]',
    postContent: '.feed-shared-update-v2__description, .feed-shared-inline-show-more-text',
    postAuthor: '.update-components-actor__name, .feed-shared-actor__name',
    postAuthorHeadline: '.update-components-actor__description, .feed-shared-actor__description',
    commentBox: '.comments-comment-box__form',
    postContainer: '.feed-shared-update-v2'
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
    currentPanel: null
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

function createFloatingButton() {
    const button = document.createElement('button');
    button.id = 'lcc-suggest-btn';
    button.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      <path d="M12 7v6M9 10h6"></path>
    </svg>
    <span>Suggest</span>
  `;
    button.style.cssText = `
    position: absolute;
    z-index: 10000;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    background: linear-gradient(135deg, #0077b5 0%, #005582 100%);
    color: white;
    border: none;
    border-radius: 20px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    opacity: 0;
    transform: translateY(5px);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 2px 8px rgba(0, 119, 181, 0.3);
  `;

    button.addEventListener('mouseenter', () => {
        button.style.transform = 'translateY(0) scale(1.05)';
        button.style.boxShadow = '0 4px 12px rgba(0, 119, 181, 0.4)';
    });

    button.addEventListener('mouseleave', () => {
        button.style.transform = 'translateY(0) scale(1)';
        button.style.boxShadow = '0 2px 8px rgba(0, 119, 181, 0.3)';
    });

    return button;
}

function showButton(postElement) {
    if (state.currentButton) {
        state.currentButton.remove();
    }

    const button = createFloatingButton();
    const rect = postElement.getBoundingClientRect();

    // Add slight randomization to position (anti-pattern detection)
    const randomX = Math.floor(Math.random() * 20) - 10;
    const randomY = Math.floor(Math.random() * 10) - 5;

    button.style.top = `${rect.top + window.scrollY + CONFIG.buttonOffset.y + randomY}px`;
    button.style.right = `${window.innerWidth - rect.right + CONFIG.buttonOffset.x + randomX}px`;

    document.body.appendChild(button);
    state.currentButton = button;

    // Animate in after delay (simulates reading time)
    setTimeout(() => {
        button.style.opacity = '1';
        button.style.transform = 'translateY(0)';
        state.buttonVisible = true;
    }, CONFIG.buttonFadeDelay);

    // Click handler
    button.addEventListener('click', (e) => {
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

async function showSuggestionPanel(postElement) {
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
    panel.querySelector('.lcc-regen').addEventListener('click', () => handleRegenerate(postElement));
    panel.querySelector('.lcc-edit').addEventListener('click', handleEdit);
    panel.querySelector('.lcc-retry')?.addEventListener('click', () => handleRegenerate(postElement));

    // Generate comment
    await generateAndDisplayComment(postElement);
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

async function generateAndDisplayComment(postElement) {
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

    try {
        // Send to background for LLM generation
        const response = await chrome.runtime.sendMessage({
            type: 'GENERATE_COMMENT',
            postData
        });

        if (response.success) {
            statusEl.style.display = 'none';
            resultEl.style.display = 'block';
            previewEl.textContent = response.comment;

            // Update rate limit display
            if (response.rateLimit) {
                rateLimitEl.textContent = `${response.rateLimit.remaining} suggestions remaining`;
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

function handleCopy() {
    const previewEl = state.currentPanel?.querySelector('.lcc-comment-preview');
    if (previewEl) {
        navigator.clipboard.writeText(previewEl.textContent).then(() => {
            const copyBtn = state.currentPanel.querySelector('.lcc-copy');
            const originalText = copyBtn.innerHTML;
            copyBtn.innerHTML = '✓ Copied!';
            copyBtn.style.background = '#28a745';
            setTimeout(() => {
                copyBtn.innerHTML = originalText;
                copyBtn.style.background = '';
            }, 2000);
        });
    }
}

async function handleRegenerate(postElement) {
    await generateAndDisplayComment(postElement);
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

// ============================================================================
// Hover & Dwell Time Tracking
// ============================================================================

function setupPostTracking() {
    document.addEventListener('mouseover', (e) => {
        const post = e.target.closest(SELECTORS.feedPost);

        if (post && post !== state.hoveredPost) {
            // Ignore fast scrolling
            if (state.scrollVelocity > CONFIG.scrollVelocityThreshold) {
                return;
            }

            // Check if post is in viewport center
            if (!isPostInViewportCenter(post)) {
                return;
            }

            state.hoveredPost = post;
            state.hoverStartTime = Date.now();

            // Show button after dwell time
            setTimeout(() => {
                if (state.hoveredPost === post &&
                    Date.now() - state.hoverStartTime >= CONFIG.minDwellTime &&
                    !state.panelVisible) {
                    showButton(post);
                }
            }, CONFIG.minDwellTime);
        }
    });

    document.addEventListener('mouseout', (e) => {
        const post = e.target.closest(SELECTORS.feedPost);
        const relatedPost = e.relatedTarget?.closest(SELECTORS.feedPost);

        if (post === state.hoveredPost && relatedPost !== post) {
            // Check if moving to button or panel
            const isMovingToUI = e.relatedTarget?.closest('#lcc-suggest-btn, #lcc-panel');

            if (!isMovingToUI && !state.panelVisible) {
                state.hoveredPost = null;
                hideButton();
            }
        }
    });
}

// ============================================================================
// Utilities
// ============================================================================

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// Initialization
// ============================================================================

function init() {
    console.log('LinkedIn Comment Copilot content script loaded');

    // Wait for feed to load
    const observer = new MutationObserver((mutations, obs) => {
        const feed = document.querySelector(SELECTORS.feedPost);
        if (feed) {
            obs.disconnect();
            setupPostTracking();
            console.log('LinkedIn Comment Copilot: Ready');
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // Also try immediately in case feed is already loaded
    if (document.querySelector(SELECTORS.feedPost)) {
        setupPostTracking();
    }
}

// Run on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
