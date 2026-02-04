# LinkedIn Comment Copilot

AI-powered LinkedIn comment suggestions that preserve your authentic voice — without auto-posting, bulk actions, or detection risks.

## 🚀 Features

- **Contextual Activation** — Floating button appears only when you hover over a post for 3+ seconds
- **Smart Analysis** — Understands post tone, author seniority, and engagement level
- **Style Fingerprinting** — Learns your commenting patterns to match your voice
- **Anti-Detection** — Built-in variance, rate limiting, and pattern prevention
- **Model-Agnostic** — Works with OpenAI, Google Gemini, or Anthropic Claude

## ⚙️ Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked" and select the extension folder
5. Click the extension icon and go to **Settings**
6. Add your LLM API key (OpenAI, Gemini, or Claude)

## 🔑 API Key Setup

| Provider | Get API Key |
|----------|-------------|
| OpenAI | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| Google Gemini | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| Anthropic | [console.anthropic.com](https://console.anthropic.com) |

## 📁 Project Structure

```
linkedin-comment-copilot/
├── manifest.json         # Extension manifest (MV3)
├── background/
│   └── service-worker.js # LLM API, rate limiting
├── content/
│   └── content.js        # LinkedIn DOM interaction
├── core/
│   ├── analyzer.js       # Post analysis
│   ├── fingerprint.js    # Style learning
│   └── antidetect.js     # Pattern prevention
├── services/
│   ├── llm.js           # LLM API wrapper
│   ├── cache.js         # Semantic caching
│   └── storage.js       # Data persistence
├── ui/
│   └── styles.css       # Panel styling
├── options/
│   ├── options.html     # Settings page
│   └── options.js
├── popup/
│   ├── popup.html       # Toolbar popup
│   └── popup.js
└── icons/               # Extension icons
```

## 🛡️ Safety Features

| Feature | Description |
|---------|-------------|
| Rate Limiting | Max 10 comments/hour |
| Similarity Detection | Blocks comments >60% similar to recent |
| Pattern Prevention | Detects repeated openings, lengths, emoji positions |
| Manual Only | Copy/paste required — no auto-posting |
| Local Storage | All data stays in your browser |

## 🎯 How It Works

1. **Browse LinkedIn** — Open your feed as normal
2. **Pause on a post** — The "Suggest" button appears after 3 seconds
3. **Click Suggest** — AI analyzes the post and generates a comment
4. **Copy & Paste** — Manually paste into LinkedIn's comment box
5. **Edit if needed** — Refine the suggestion to your liking

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
