"use strict";
(() => {
  // src/lib/formatters.ts
  function countWords(text) {
    return text.trim().split(/\s+/).filter(Boolean).length;
  }
  function estimateTokens(text) {
    return Math.round(text.length / 4);
  }
  function computeStats(conv) {
    let totalWords = 0;
    let totalChars = 0;
    let userMessages = 0;
    let assistantMessages = 0;
    for (const msg of conv.messages) {
      totalWords += countWords(msg.content);
      totalChars += msg.content.length;
      if (msg.role === "user") userMessages++;
      else assistantMessages++;
    }
    return {
      totalWords,
      totalChars,
      estimatedTokens: estimateTokens(conv.messages.map((m) => m.content).join(" ")),
      userMessages,
      assistantMessages
    };
  }
  function buildFilename(conv, ext) {
    const date = conv.exportedAt.slice(0, 10);
    const platform = conv.platform;
    const model = conv.model ? ` ${conv.model}` : "";
    const title = conv.title.replace(/[/\\:*?"<>|]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
    return `${date} ${platform}${model} ${title}.${ext}`;
  }
  function yamlFrontmatter(conv) {
    const s = computeStats(conv);
    const lines = [
      "---",
      `title: "${conv.title.replace(/"/g, '\\"')}"`,
      `date: ${conv.exportedAt.slice(0, 10)}`,
      `time: ${conv.exportedAt.slice(11, 19)}`,
      `platform: ${conv.platform}`
    ];
    if (conv.model) lines.push(`model: "${conv.model}"`);
    lines.push(
      `url: "${conv.url}"`,
      `messages: ${conv.messages.length}`,
      `user_messages: ${s.userMessages}`,
      `ai_messages: ${s.assistantMessages}`,
      `words: ${s.totalWords}`,
      `characters: ${s.totalChars}`,
      `estimated_tokens: ${s.estimatedTokens}`,
      `tags: [ai-chat, ${conv.platform.toLowerCase().replace(/\s+/g, "-")}${conv.model ? ", " + conv.model.toLowerCase().replace(/[\s.]/g, "-") : ""}]`,
      "source: Complete Recall",
      "---",
      ""
    );
    return lines.join("\n");
  }
  function toMarkdown(conv) {
    const s = computeStats(conv);
    let md = yamlFrontmatter(conv);
    md += `# ${conv.title}

`;
    const meta = [`**Platform:** ${conv.platform}`];
    if (conv.model) meta.push(`**Model:** ${conv.model}`);
    meta.push(`**URL:** ${conv.url}`);
    meta.push(`**Exported:** ${conv.exportedAt}`);
    meta.push(`**Messages:** ${conv.messages.length} (${s.userMessages} from you, ${s.assistantMessages} from AI)`);
    meta.push(`**Words:** ${s.totalWords.toLocaleString()}  |  **Est. tokens:** ${s.estimatedTokens.toLocaleString()}  |  **Characters:** ${s.totalChars.toLocaleString()}`);
    md += meta.join("  \n") + "\n\n---\n\n";
    conv.messages.forEach((msg) => {
      const speaker = msg.role === "user" ? "You" : "AI";
      md += `**${speaker}:**

${msg.content}

---

`;
    });
    return md.trim();
  }
  function toPlainText(conv) {
    const s = computeStats(conv);
    let text = `${conv.title}
${"=".repeat(conv.title.length)}

`;
    text += `Platform: ${conv.platform}
`;
    if (conv.model) text += `Model: ${conv.model}
`;
    text += `URL: ${conv.url}
`;
    text += `Exported: ${conv.exportedAt}
`;
    text += `Messages: ${conv.messages.length} (${s.userMessages} from you, ${s.assistantMessages} from AI)
`;
    text += `Words: ${s.totalWords.toLocaleString()}  |  Est. tokens: ${s.estimatedTokens.toLocaleString()}  |  Characters: ${s.totalChars.toLocaleString()}

`;
    text += `${"\u2500".repeat(60)}

`;
    conv.messages.forEach((msg) => {
      const speaker = msg.role === "user" ? "You" : "AI";
      text += `${speaker}:

${msg.content}

${"\u2500".repeat(60)}

`;
    });
    return text.trim();
  }
  function toJSON(conv) {
    return JSON.stringify(conv, null, 2);
  }
  function toHTML(conv) {
    const escape = (s2) => s2.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const s = computeStats(conv);
    const metaParts = [`${escape(conv.platform)}`];
    if (conv.model) metaParts.push(`<strong>${escape(conv.model)}</strong>`);
    metaParts.push(`<a href="${escape(conv.url)}">${escape(conv.url)}</a>`);
    metaParts.push(escape(conv.exportedAt));
    metaParts.push(`${conv.messages.length} messages &bull; ${s.totalWords.toLocaleString()} words &bull; ~${s.estimatedTokens.toLocaleString()} tokens`);
    const messagesHtml = conv.messages.map((msg) => {
      const roleClass = msg.role;
      const roleName = msg.role === "user" ? "You" : "AI";
      const contentHtml = escape(msg.content).replace(/\n/g, "<br>");
      return `
      <div class="message ${roleClass}">
        <div class="label">${roleName}</div>
        <div class="content">${contentHtml}</div>
      </div>`;
    }).join("\n");
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escape(conv.title)}</title>
  <style>
    body { background: #1a1a1a; color: #e8e8e8; font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 24px; line-height: 1.6; }
    h1 { color: #a5b4fc; font-size: 1.4rem; margin-bottom: 6px; }
    .meta { font-size: 12px; color: #666; margin-bottom: 24px; }
    .meta a { color: #6366f1; }
    .message { margin-bottom: 20px; padding: 14px 16px; border-radius: 8px; }
    .message.user { background: #1e1e2e; border-left: 3px solid #6366f1; }
    .message.assistant { background: #111; border-left: 3px solid #22d3ee; }
    .label { font-size: 11px; font-weight: 700; text-transform: uppercase; opacity: 0.6; margin-bottom: 8px; }
    .message.user .label { color: #a5b4fc; }
    .message.assistant .label { color: #67e8f9; }
    .content { font-size: 14px; }
  </style>
</head>
<body>
  <h1>${escape(conv.title)}</h1>
  <div class="meta">${metaParts.join(" &bull; ")}</div>
  ${messagesHtml}
</body>
</html>`;
  }
  function convert(conv, format) {
    switch (format) {
      case "markdown":
        return toMarkdown(conv);
      case "text":
        return toPlainText(conv);
      case "json":
        return toJSON(conv);
      case "html":
        return toHTML(conv);
      default:
        return toMarkdown(conv);
    }
  }

  // src/popup/popup.ts
  var currentConversation = null;
  var currentExportDir = "chat-export";
  var currentTabId = null;
  var EXTRACT_TIMEOUT_MS = 9e4;
  function getExtension(format) {
    const map = { markdown: "md", text: "txt", json: "json", html: "html" };
    return map[format];
  }
  function getFilename(format) {
    if (!currentConversation) {
      const ts = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").slice(0, 19);
      return `chat-export-${ts}.${getExtension(format)}`;
    }
    return buildFilename(currentConversation, getExtension(format));
  }
  function truncate(text, maxLength = 200) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  }
  function setStatus(text, kind = "info") {
    const statusEl = document.getElementById("status");
    statusEl.textContent = text;
    statusEl.className = kind === "info" ? "info" : "";
    statusEl.style.display = text ? "block" : "none";
  }
  function renderPreview(conv) {
    const previewEl = document.getElementById("preview");
    previewEl.innerHTML = "";
    previewEl.style.display = "block";
    conv.messages.forEach((msg) => {
      const div = document.createElement("div");
      div.className = msg.role === "user" ? "msg-user" : "msg-assistant";
      const label = document.createElement("span");
      label.className = "msg-label";
      label.textContent = msg.role === "user" ? "You" : "AI";
      const content = document.createElement("p");
      content.style.margin = "0";
      content.textContent = truncate(msg.content);
      div.appendChild(label);
      div.appendChild(content);
      previewEl.appendChild(div);
    });
  }
  function sendToTab(tabId, payload) {
    return new Promise((resolve, reject) => {
      try {
        chrome.tabs.sendMessage(tabId, payload, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      } catch (e) {
        reject(e);
      }
    });
  }
  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))
    ]);
  }
  function dataUrlToBlob(dataUrl) {
    const [head, body] = dataUrl.split(",");
    const mime = head.match(/data:([^;]+)/)?.[1] ?? "application/octet-stream";
    const bin = atob(body);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  function downloadViaApi(url, filename) {
    return new Promise((resolve, reject) => {
      chrome.downloads.download({ url, filename, conflictAction: "uniquify" }, (id) => {
        if (chrome.runtime.lastError || id === void 0) {
          reject(new Error(chrome.runtime.lastError?.message ?? "download failed"));
        } else {
          resolve();
        }
      });
    });
  }
  async function downloadAssets(assets) {
    if (currentTabId === null) return;
    const downloadable = assets.filter((a) => !a.unavailable);
    let done = 0;
    let skipped = 0;
    for (let i = 0; i < downloadable.length; i++) {
      const asset = downloadable[i];
      setStatus(`Downloading asset ${i + 1}/${downloadable.length}: ${asset.name}`);
      const resp = await sendToTab(currentTabId, {
        type: "GET_ASSET",
        id: asset.id
      }).catch(() => null);
      let url = null;
      let objectUrl = null;
      if (resp?.ok && resp.dataUrl) {
        objectUrl = URL.createObjectURL(dataUrlToBlob(resp.dataUrl));
        url = objectUrl;
      } else if (resp?.url || /^https?:/.test(asset.url)) {
        url = resp?.url ?? asset.url;
      }
      if (!url) {
        skipped++;
        continue;
      }
      try {
        await downloadViaApi(url, `${currentExportDir}/${resp?.name ?? asset.name}`);
        done++;
      } catch {
        skipped++;
      }
      if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 6e4);
    }
    setStatus(`Done. ${done} asset(s) downloaded${skipped ? `, ${skipped} skipped` : ""}.`);
  }
  async function handleDownload() {
    if (!currentConversation) return;
    const formatSelect = document.getElementById("format");
    const format = formatSelect.value;
    const content = convert(currentConversation, format);
    const filename = getFilename(format);
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    const includeAssets = document.getElementById("include-assets");
    const assets = currentConversation.assets ?? [];
    if (includeAssets?.checked && assets.length) {
      await downloadAssets(assets);
    }
  }
  async function handleObsidian() {
    if (!currentConversation) return;
    const content = convert(currentConversation, "markdown");
    const filename = getFilename("markdown").replace(/\.md$/, "");
    const MAX_OBSIDIAN_CONTENT = 5e4;
    if (content.length > MAX_OBSIDIAN_CONTENT) {
      setStatus("Chat too large for Obsidian URI \u2014 downloading as .md instead.", "info");
      const blob = new Blob([content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filename}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return;
    }
    const uri = `obsidian://new?file=${encodeURIComponent(filename)}&content=${encodeURIComponent(content)}`;
    window.open(uri, "_blank");
    setStatus("Sent to Obsidian. If nothing opened, make sure Obsidian is running.", "info");
  }
  async function handleCopy() {
    if (!currentConversation) return;
    const formatSelect = document.getElementById("format");
    const format = formatSelect.value;
    const content = convert(currentConversation, format);
    const copyBtn = document.getElementById("copy");
    const originalText = copyBtn.textContent;
    try {
      await navigator.clipboard.writeText(content);
      copyBtn.textContent = "Copied!";
      setTimeout(() => {
        copyBtn.textContent = originalText ?? "Copy to Clipboard";
      }, 2e3);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }
  document.addEventListener("DOMContentLoaded", async () => {
    const loadingEl = document.getElementById("loading");
    const previewEl = document.getElementById("preview");
    const downloadBtn = document.getElementById("download");
    const obsidianBtn = document.getElementById("obsidian");
    const copyBtn = document.getElementById("copy");
    previewEl.style.display = "none";
    downloadBtn.style.display = "none";
    obsidianBtn.style.display = "none";
    copyBtn.style.display = "none";
    downloadBtn.addEventListener("click", handleDownload);
    obsidianBtn.addEventListener("click", handleObsidian);
    copyBtn.addEventListener("click", handleCopy);
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.type === "EXTRACT_PROGRESS") {
        loadingEl.textContent = `Loading full conversation\u2026 (${msg.turnCount} messages found)`;
      }
    });
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab?.id) {
      setStatus("No active tab found.", "error");
      loadingEl.style.display = "none";
      return;
    }
    currentTabId = tab.id;
    loadingEl.textContent = "Loading full conversation\u2026";
    let response;
    try {
      response = await withTimeout(
        sendToTab(tab.id, { type: "EXTRACT_CONVERSATION" }),
        EXTRACT_TIMEOUT_MS
      );
    } catch (e) {
      loadingEl.style.display = "none";
      setStatus(
        String(e).includes("timeout") ? "Timed out loading the conversation \u2014 try refreshing the page." : "Open a supported AI chat page first.",
        "error"
      );
      return;
    }
    loadingEl.style.display = "none";
    if (response?.error) {
      setStatus(response.error, "error");
      return;
    }
    const conv = response?.conversation;
    if (!conv || conv.messages.length === 0) {
      setStatus("No conversation found on this page.", "error");
      return;
    }
    currentConversation = conv;
    currentExportDir = response.exportDirName ?? "chat-export";
    if (response.truncated) {
      setStatus("Note: very long conversation \u2014 export may be incomplete.");
    }
    renderPreview(conv);
    downloadBtn.style.display = "block";
    obsidianBtn.style.display = "block";
    copyBtn.style.display = "block";
  });
})();
