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
    let totalWords = 0, totalChars = 0, userMessages = 0, assistantMessages = 0;
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
  var MODELS = [
    { name: "Claude Sonnet 4.6", contextK: 200, inputPer1M: 3, outputPer1M: 15 },
    { name: "Claude Opus 4.6", contextK: 200, inputPer1M: 5, outputPer1M: 25 },
    { name: "Claude Haiku 4.5", contextK: 200, inputPer1M: 1, outputPer1M: 5 },
    { name: "GPT-4.1", contextK: 1e3, inputPer1M: 2, outputPer1M: 8 },
    { name: "GPT-4.1 Mini", contextK: 1e3, inputPer1M: 0.4, outputPer1M: 1.6 },
    { name: "Gemini 2.5 Pro", contextK: 1e3, inputPer1M: 1.25, outputPer1M: 10 },
    { name: "Grok 4.3", contextK: 1e3, inputPer1M: 1.25, outputPer1M: 2.5 },
    { name: "Grok 4.20", contextK: 2e3, inputPer1M: 2, outputPer1M: 6 }
  ];
  function costTable(tokens) {
    const rows = MODELS.map((m) => {
      const contextTokens = m.contextK * 1e3;
      const pct = (tokens / contextTokens * 100).toFixed(2) + "%";
      const cost = "$" + (tokens / 1e6 * m.inputPer1M).toFixed(4);
      const out = "$" + m.outputPer1M.toFixed(2);
      return `| ${m.name} | ${m.contextK}K | ${pct} | ${cost} | ${out} |`;
    });
    return [
      "| Model | Context window | This = % of window | Est. input cost (USD) | Output rate (per 1M) |",
      "|---|---|---|---|---|",
      ...rows
    ].join("\n");
  }
  var MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ];
  var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  function friendlyDateTime(iso) {
    const d = new Date(iso);
    const day = DAYS[d.getDay()];
    const date = d.getDate();
    const month = MONTHS[d.getMonth()];
    const year = d.getFullYear();
    let hours = d.getHours();
    const mins = String(d.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "pm" : "am";
    hours = hours % 12 || 12;
    return `${day}, ${date} ${month} ${year}, ${hours}.${mins}${ampm}`;
  }
  function shortDateTime(iso) {
    const d = new Date(iso);
    const date = d.getDate();
    const month = MONTHS[d.getMonth()];
    const year = d.getFullYear();
    let hours = d.getHours();
    const mins = String(d.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "pm" : "am";
    hours = hours % 12 || 12;
    return `${date} ${month} ${year}, ${hours}.${mins}${ampm}`;
  }
  function kTokens(n) {
    return Math.round(n / 1e3) + "k";
  }
  function buildFilename(conv, ext) {
    const s = computeStats(conv);
    const date = conv.exportedAt.slice(0, 10);
    const platform = conv.platform;
    const title = conv.title.replace(/[/\\:*?"<>|—]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
    const exported = shortDateTime(conv.exportedAt);
    const msgCount = conv.messages.length;
    const tk = kTokens(s.estimatedTokens);
    return `${date} \u2014 ${platform} \u2014 ${title} \u2014 exported ${exported} [${msgCount} msgs ~${tk} tk].${ext}`;
  }
  function yamlFrontmatter(conv, s) {
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
  function preview(text, max = 80) {
    const first = text.trim().split("\n")[0].replace(/[#*`_]/g, "").trim();
    return first.length > max ? first.slice(0, max - 1) + "\u2026" : first;
  }
  function toMarkdown(conv) {
    const s = computeStats(conv);
    const aiName = conv.platform;
    let md = yamlFrontmatter(conv, s);
    md += `# ${conv.title}

`;
    md += `## File info

`;
    md += `- **Source:** ${conv.platform}`;
    if (conv.model) md += ` (${conv.model})`;
    md += ` \u2014 ${conv.url}
`;
    md += `- **Exported:** ${friendlyDateTime(conv.exportedAt)}

`;
    md += `## Size

`;
    md += `- **Messages:** ${conv.messages.length} (${s.userMessages} from you, ${s.assistantMessages} from ${aiName})
`;
    md += `- **Words:** ${s.totalWords.toLocaleString()}
`;
    md += `- **Characters:** ${s.totalChars.toLocaleString()}
`;
    md += `- **Estimated tokens:** ~${s.estimatedTokens.toLocaleString()} *(rough estimate, ~4 chars/token; exact count varies by model)*

`;
    md += `## Cost / context-fit if pasted as context elsewhere

`;
    md += costTable(s.estimatedTokens) + "\n\n";
    md += `*Prices verified June 2026. Subscription plans (Claude Pro, ChatGPT Plus, Grok Premium, Gemini Advanced) are flat-rate, so per-chat cost via those is $0.*

`;
    let exchangeNum = 0;
    conv.messages.forEach((msg) => {
      if (msg.role === "user") exchangeNum++;
      const speaker = msg.role === "user" ? "You" : aiName;
      const prev = preview(msg.content);
      md += `## ${speaker} \xB7 ${exchangeNum} \xB7 ${prev}

`;
      md += msg.content.trim() + "\n\n";
    });
    return md.trim();
  }
  function toPlainText(conv) {
    const s = computeStats(conv);
    let text = `${conv.title}
${"=".repeat(Math.min(conv.title.length, 60))}

`;
    text += `Platform: ${conv.platform}`;
    if (conv.model) text += ` (${conv.model})`;
    text += `
URL: ${conv.url}
`;
    text += `Exported: ${friendlyDateTime(conv.exportedAt)}
`;
    text += `Messages: ${conv.messages.length} (${s.userMessages} from you, ${s.assistantMessages} from ${conv.platform})
`;
    text += `Words: ${s.totalWords.toLocaleString()}  |  Est. tokens: ~${s.estimatedTokens.toLocaleString()}  |  Characters: ${s.totalChars.toLocaleString()}

`;
    text += `${"\u2500".repeat(60)}

`;
    let exchangeNum = 0;
    conv.messages.forEach((msg) => {
      if (msg.role === "user") exchangeNum++;
      const speaker = msg.role === "user" ? "You" : conv.platform;
      text += `${speaker} \xB7 ${exchangeNum}:

${msg.content.trim()}

${"\u2500".repeat(60)}

`;
    });
    return text.trim();
  }
  function toJSON(conv) {
    const s = computeStats(conv);
    return JSON.stringify({ ...conv, stats: s }, null, 2);
  }
  function toHTML(conv) {
    const esc = (s2) => s2.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const s = computeStats(conv);
    const aiName = conv.platform;
    let exchangeNum = 0;
    const messagesHtml = conv.messages.map((msg) => {
      if (msg.role === "user") exchangeNum++;
      const roleClass = msg.role;
      const roleName = msg.role === "user" ? "You" : aiName;
      const contentHtml = esc(msg.content).replace(/\n/g, "<br>");
      return `
      <div class="message ${roleClass}">
        <div class="label">${roleName} \xB7 ${exchangeNum}</div>
        <div class="content">${contentHtml}</div>
      </div>`;
    }).join("\n");
    const costRowsHtml = MODELS.map((m) => {
      const contextTokens = m.contextK * 1e3;
      const pct = (s.estimatedTokens / contextTokens * 100).toFixed(2) + "%";
      const cost = "$" + (s.estimatedTokens / 1e6 * m.inputPer1M).toFixed(4);
      return `<tr><td>${esc(m.name)}</td><td>${m.contextK}K</td><td>${pct}</td><td>${cost}</td><td>$${m.outputPer1M.toFixed(2)}</td></tr>`;
    }).join("\n");
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(conv.title)}</title>
  <style>
    body { background:#1a1a1a; color:#e8e8e8; font-family:sans-serif; max-width:800px; margin:0 auto; padding:24px; line-height:1.6; }
    h1 { color:#a5b4fc; font-size:1.4rem; margin-bottom:6px; }
    h2 { color:#888; font-size:.85rem; font-weight:600; text-transform:uppercase; letter-spacing:.5px; margin:24px 0 8px; }
    .meta { font-size:12px; color:#666; margin-bottom:8px; }
    .meta a { color:#6366f1; }
    table { width:100%; border-collapse:collapse; font-size:12px; margin:12px 0; }
    th,td { padding:6px 10px; text-align:left; border-bottom:1px solid #333; }
    th { color:#a5b4fc; }
    .message { margin-bottom:16px; padding:12px 16px; border-radius:8px; }
    .message.user { background:#1e1e2e; border-left:3px solid #6366f1; }
    .message.assistant { background:#111; border-left:3px solid #22d3ee; }
    .label { font-size:11px; font-weight:700; text-transform:uppercase; opacity:.6; margin-bottom:8px; color:#a5b4fc; }
    .message.assistant .label { color:#67e8f9; }
    .content { font-size:14px; }
  </style>
</head>
<body>
  <h1>${esc(conv.title)}</h1>
  <h2>File info</h2>
  <div class="meta"><strong>Source:</strong> ${esc(conv.platform)}${conv.model ? " (" + esc(conv.model) + ")" : ""} \u2014 <a href="${esc(conv.url)}">${esc(conv.url)}</a></div>
  <div class="meta"><strong>Exported:</strong> ${esc(friendlyDateTime(conv.exportedAt))}</div>
  <h2>Size</h2>
  <div class="meta">
    ${conv.messages.length} messages (${s.userMessages} from you, ${s.assistantMessages} from ${esc(aiName)}) &bull;
    ${s.totalWords.toLocaleString()} words &bull; ~${s.estimatedTokens.toLocaleString()} tokens &bull; ${s.totalChars.toLocaleString()} chars
  </div>
  <h2>Cost / context-fit if pasted as context elsewhere</h2>
  <table>
    <tr><th>Model</th><th>Context window</th><th>This = % of window</th><th>Est. input cost</th><th>Output rate (per 1M)</th></tr>
    ${costRowsHtml}
  </table>
  <p style="font-size:11px;color:#555;"><em>Prices verified June 2026. Subscription plans are flat-rate, so per-chat cost via those is $0.</em></p>
  <h2>Conversation</h2>
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
