"use strict";
(() => {
  // src/lib/formatters.ts
  function toMarkdown(conv) {
    let md = `# ${conv.title}

`;
    md += `**Platform:** ${conv.platform}  
`;
    md += `**URL:** ${conv.url}  
`;
    md += `**Exported:** ${conv.exportedAt}

`;
    md += `---

`;
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
    let text = `${conv.title}

`;
    text += `Platform: ${conv.platform}
`;
    text += `URL: ${conv.url}
`;
    text += `Exported: ${conv.exportedAt}

`;
    text += `---

`;
    conv.messages.forEach((msg) => {
      const speaker = msg.role === "user" ? "You" : "AI";
      text += `${speaker}:

${msg.content}

---

`;
    });
    return text.trim();
  }
  function toJSON(conv) {
    return JSON.stringify(conv, null, 2);
  }
  function toHTML(conv) {
    const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const messagesHtml = conv.messages.map((msg) => {
      const roleClass = msg.role;
      const roleName = msg.role === "user" ? "You" : "AI";
      const contentHtml = escapeHtml(msg.content).replace(/\n/g, "<br>");
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
  <title>${escapeHtml(conv.title)}</title>
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
  <h1>${escapeHtml(conv.title)}</h1>
  <div class="meta">
    ${escapeHtml(conv.platform)} &bull; <a href="${escapeHtml(conv.url)}">${escapeHtml(conv.url)}</a> &bull; ${escapeHtml(conv.exportedAt)}
  </div>
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
    const map = {
      markdown: "md",
      text: "txt",
      json: "json",
      html: "html"
    };
    return map[format];
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
    const extension = getExtension(format);
    const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `chat-export-${timestamp}.${extension}`;
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
    const copyBtn = document.getElementById("copy");
    previewEl.style.display = "none";
    downloadBtn.style.display = "none";
    copyBtn.style.display = "none";
    downloadBtn.addEventListener("click", handleDownload);
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
    copyBtn.style.display = "block";
  });
})();
