"use strict";
(() => {
  // src/content/claude.ts
  function extract() {
    const messages = [];
    const elements = document.querySelectorAll('[data-testid="human-turn"], [data-testid="ai-turn"]');
    elements.forEach((el) => {
      const testid = el.getAttribute("data-testid");
      const role = testid === "human-turn" ? "user" : "assistant";
      const content = el.innerText.trim();
      if (content) {
        messages.push({ role, content });
      }
    });
    return {
      title: document.title,
      platform: "Claude",
      url: window.location.href,
      messages,
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
