"use strict";
(() => {
  // src/content/chatgpt.ts
  function htmlToMarkdown(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node;
    const tag = el.tagName.toLowerCase();
    const kids = () => Array.from(el.childNodes).map(htmlToMarkdown).join("");
    switch (tag) {
      case "h1":
        return `# ${kids().trim()}

`;
      case "h2":
        return `## ${kids().trim()}

`;
      case "h3":
        return `### ${kids().trim()}

`;
      case "h4":
        return `#### ${kids().trim()}

`;
      case "strong":
      case "b":
        return `**${kids()}**`;
      case "em":
      case "i":
        return `_${kids()}_`;
      case "code":
        return el.closest("pre") ? kids() : `\`${kids()}\``;
      case "pre":
        return `\`\`\`
${el.innerText}
\`\`\`

`;
      case "p":
        return `${kids()}

`;
      case "br":
        return "\n";
      case "hr":
        return "---\n\n";
      case "a": {
        const href = el.href ?? "";
        const text = kids().trim();
        return href ? `[${text}](${href})` : text;
      }
      case "ul":
      case "ol": {
        const ordered = tag === "ol";
        let i = 0;
        return Array.from(el.childNodes).filter((n) => n.tagName?.toLowerCase() === "li").map((li) => `${ordered ? `${++i}.` : "-"} ${htmlToMarkdown(li).trim()}`).join("\n") + "\n\n";
      }
      case "li":
        return kids();
      case "button":
      case "svg":
      case "script":
      case "style":
        return "";
      default:
        return kids();
    }
  }
  function toMarkdown(el) {
    return htmlToMarkdown(el).replace(/\n{3,}/g, "\n\n").trim();
  }
  var PROSE_SEL = '.prose, .markdown, [class*="prose"], [class*="markdown"]';
  var ATTACH_SEL = 'pre, [class*="attachment"], [class*="file-block"], [class*="paste"], [data-testid*="file"]';
  function extractAttachments(container, proseEl) {
    const parts = [];
    container.querySelectorAll(ATTACH_SEL).forEach((att) => {
      if (proseEl?.contains(att)) return;
      const text = att.innerText?.trim();
      if (text) parts.push(text);
    });
    return parts.length ? "\n\n---\n" + parts.join("\n\n---\n") : "";
  }
  function extractFromTurns(turns) {
    const messages = [];
    turns.forEach((turn) => {
      const roleEl = turn.hasAttribute("data-message-author-role") ? turn : turn.querySelector("[data-message-author-role]");
      if (!roleEl) return;
      const role = roleEl.getAttribute("data-message-author-role");
      if (role !== "user" && role !== "assistant") return;
      const proseEl = roleEl.querySelector(PROSE_SEL) ?? roleEl;
      let content = toMarkdown(proseEl);
      if (role === "user") content += extractAttachments(roleEl, proseEl !== roleEl ? proseEl : null);
      if (content) messages.push({ role, content });
    });
    return messages;
  }
  function extract() {
    let turns = document.querySelectorAll('article[data-testid^="conversation-turn-"]');
    if (!turns.length) turns = document.querySelectorAll("[data-message-author-role]");
    return {
      title: document.title,
      platform: "ChatGPT",
      url: window.location.href,
      messages: extractFromTurns(turns),
      exportedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "EXTRACT_CONVERSATION") {
      try {
        sendResponse({ conversation: extract() });
      } catch (e) {
        sendResponse({ error: String(e) });
      }
    }
    return true;
  });
})();
