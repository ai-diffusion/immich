"use strict";
(() => {
  // src/content/grok.ts
  function extract() {
    const messages = [];
    let elements = document.querySelectorAll('[data-testid="userMessage"], [data-testid="assistantMessage"]');
    if (elements.length === 0) {
      elements = document.querySelectorAll(".message-bubble");
    }
    elements.forEach((el, index) => {
      let role;
      const testid = el.getAttribute("data-testid");
      if (testid === "userMessage") {
        role = "user";
      } else if (testid === "assistantMessage") {
        role = "assistant";
      } else {
        role = index % 2 === 0 ? "user" : "assistant";
      }
      const content = el.innerText.trim();
      if (content) {
        messages.push({ role, content });
      }
    });
    return {
      title: document.title,
      platform: "Grok",
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
