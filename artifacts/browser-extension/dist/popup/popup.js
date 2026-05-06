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
    const statusEl = document.getElementById("status");
    const previewEl = document.getElementById("preview");
    const downloadBtn = document.getElementById("download");
    const copyBtn = document.getElementById("copy");
    previewEl.style.display = "none";
    downloadBtn.style.display = "none";
    copyBtn.style.display = "none";
    downloadBtn.addEventListener("click", handleDownload);
    copyBtn.addEventListener("click", handleCopy);
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab?.id) {
      statusEl.textContent = "No active tab found.";
      statusEl.style.display = "block";
      loadingEl.style.display = "none";
      return;
    }
    chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_CONVERSATION" }, (response) => {
      loadingEl.style.display = "none";
      if (chrome.runtime.lastError) {
        statusEl.textContent = "Open a supported AI chat page first.";
        statusEl.style.display = "block";
        return;
      }
      if (response?.error) {
        statusEl.textContent = response.error;
        statusEl.style.display = "block";
        return;
      }
      const conv = response?.conversation;
      if (!conv || conv.messages.length === 0) {
        statusEl.textContent = "No conversation found on this page.";
        statusEl.style.display = "block";
        return;
      }
      currentConversation = conv;
      renderPreview(conv);
      downloadBtn.style.display = "block";
      copyBtn.style.display = "block";
    });
  });
})();
