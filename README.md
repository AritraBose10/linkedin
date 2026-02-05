# LinkedIn Comment Copilot

AI-powered LinkedIn comment suggestions that preserve your authentic voice — without auto-posting, bulk actions, or detection risks. Now featuring **Silent Learning** and **Local AI** support.

## 🚀 Features

- **Contextual Activation** — Floating button appears only when you hover over a post for 3+ seconds
- **Smart Analysis** — Understands post tone, author seniority, and engagement level
- **Silent Learning** — Automatically refines your style profile based on your edits and rewrites (no manual training needed!)
- **Local AI** — Run completely offline using **Google Gemini Nano** (Chrome Built-in) or **Puter.js** fallback
- **Model-Agnostic** — Also supports OpenAI, Google Gemini (Cloud), Anthropic Claude, and Groq
- **Anti-Detection** — Built-in variance, rate limiting, and pattern prevention

## ⚙️ Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked" and select the extension folder
5. Click the extension icon and go to **Settings**
6. Choose your **LLM Provider** (Cloud or Local)

## 🔑 AI Provider Setup

| Provider | Type | Usage |
|----------|------|-------|
| **Gemini Nano** | Local | **Free & Private.** Runs inside Chrome (Requires Chrome Canary/Dev + Flag Enablement). |
| **Puter.js** | Local | **Free Fallback.** Runs reliably in standard browsers with no setup. |
| **OpenAI** | Cloud | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| **Google Gemini** | Cloud | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| **Anthropic** | Cloud | [console.anthropic.com](https://console.anthropic.com) |

## 📁 Project Structure

```
linkedin-comment-copilot/
├── manifest.json            # Extension manifest (MV3)
├── background/
│   └── service-worker.js    # LLM API, Learning Logic, Rate Limiting
├── content/
│   ├── content.js           # UI Injection & Interaction Listeners
│   └── ai-bridge.js         # Main World Bridge for Local AI Access
├── core/
│   ├── analyzer.js          # Post analysis
│   ├── style-engine.js      # Universal Style Analysis & Learning
│   └── fingerprint.js       # Style Matching
├── offscreen/               # Gemini Nano Execution Environment
├── services/
│   ├── cache.js             # Semantic Caching
│   └── storage.js           # Data Persistence
├── options/                 # Settings Page
├── popup/                   # Toolbar Popup
└── icons/
```

## 🧠 Silent Learning Mode

The extension now learns from you automatically:
1.  **Draft**: Use the AI to generate a comment.
2.  **Refine**: Edit the text in the preview box or LinkedIn editor before posting.
3.  **Learn**: When you click "Insert" or "Copy", the extension compares the final text to the generated one.
4.  **Evolve**: Your style profile updates automatically in the background to match your voice better next time.

## 🛡️ Safety & Privacy

| Feature | Description |
|---------|-------------|
| **Local-First** | Local AI models process data entirely on your device. |
| **Privacy** | Learning corpus and style profiles are stored ONLY in your browser (`chrome.storage.local`). |
| **Rate Limiting** | Max 10 comments/hour to prevent spam identification. |
| **Manual Only** | Copy/paste required — no auto-posting. |

## 🔧 Development

```bash
# No build step required — vanilla JS
# Just load the extension folder in Chrome

# To test changes:
1. Make edits to any file
2. Go to chrome://extensions
3. Click the refresh icon on the extension card
4. Reload LinkedIn
```

## ⚠️ Disclaimer

This extension is a **productivity tool** for drafting comments. Users are responsible for:
- Reviewing and editing generated suggestions
- Complying with LinkedIn's Terms of Service
- Using the tool ethically and authentically

**No automation. No bulk actions. No auto-posting.**

## 📄 License

MIT License — use freely, modify as needed.

---

Built with ❤️ for authentic engagement
