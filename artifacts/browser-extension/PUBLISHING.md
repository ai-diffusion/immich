# AI Chat Exporter — Publishing Guide

Step-by-step instructions for publishing and testing the **AI Chat Exporter** browser extension.

---

## 1. Chrome Web Store Submission

1. Create a Google developer account at [chrome.google.com/webstore/devconsole](https://chrome.google.com/webstore/devconsole) (one-time $5 fee).

2. Build and package the extension:
   ```bash
   npm run pack
   ```
   This produces `extension.zip` in the project root.

3. Go to the Chrome Web Store Developer Dashboard, click **Add new item**, and upload `extension.zip`.

4. Fill in the store listing:
   - **Name:** AI Chat Exporter
   - **Description:** Export AI chat conversations locally to Markdown, Text, JSON, or HTML.
   - **Category:** Productivity
   - **Screenshots:** At least one at 1280×800 px

5. In the **Permissions** section, provide this justification:
   > `activeTab`: to read the current AI chat page DOM.
   > `downloads`: to save the exported file locally.

6. Submit for review — typically approved within 1–3 business days.

---

## 2. Firefox AMO Submission

1. Install the `web-ext` CLI globally:
   ```bash
   npm install -g web-ext
   ```

2. Create a developer account at [addons.mozilla.org](https://addons.mozilla.org).

3. Build a Firefox-compatible package:
   ```bash
   web-ext build
   ```
   This produces a `.zip` inside `web-ext-artifacts/`.

4. Go to [addons.mozilla.org/developers](https://addons.mozilla.org/developers), click **Submit a New Add-on**, and upload the zip.

5. When prompted, also upload the source code zip (`extension.zip` from `npm run pack`) for Mozilla's review.

6. **Alternative — automatic signing via CLI:**
   ```bash
   web-ext sign --api-key=YOUR_API_KEY --api-secret=YOUR_API_SECRET
   ```
   Your API credentials are available at [addons.mozilla.org/api/auth](https://addons.mozilla.org/api/auth).

---

## 3. Zen Browser

Zen Browser is Chromium-based. Chrome Web Store extensions install directly — just visit the extension's Chrome Web Store page from inside Zen.

For sideloading during development, follow the Chrome/Brave/Edge instructions below.

---

## 4. Sideload in Chrome / Brave / Edge (for testing)

1. Build the extension:
   ```bash
   npm run build
   ```

2. Open the extensions page:
   - Chrome: `chrome://extensions`
   - Brave: `brave://extensions`
   - Edge: `edge://extensions`

3. Enable **Developer mode** (toggle in the top-right corner).

4. Click **Load unpacked** and select the `dist/` folder.

5. The extension icon appears in the toolbar. After any code change, re-run `npm run build` and click the **Reload** button on the extension card.

---

## 5. Sideload in Firefox (for testing)

1. Build the extension:
   ```bash
   npm run build
   ```

2. Open Firefox and navigate to:
   ```
   about:debugging#/runtime/this-firefox
   ```

3. Click **Load Temporary Add-on…**

4. Navigate to the `dist/` folder and select `manifest.json`.

5. The extension loads immediately.

> **Note:** Temporary add-ons are removed when Firefox restarts. For a persistent dev session, use:
> ```bash
> web-ext run
> ```

---

## Testing Checklist

Before publishing, test on each supported platform:

- [ ] ChatGPT — [chatgpt.com](https://chatgpt.com)
- [ ] Claude — [claude.ai](https://claude.ai)
- [ ] Grok — [grok.com](https://grok.com)
- [ ] Gemini — [gemini.google.com](https://gemini.google.com)
- [ ] Perplexity — [perplexity.ai](https://perplexity.ai)

For each: open a conversation, click the extension icon, verify the preview shows messages, and confirm Download and Copy work for all four formats (Markdown, Plain Text, JSON, HTML).
