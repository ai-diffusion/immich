"use strict";
(() => {
  // src/content/perplexity.ts
  function extract() {
    const messages = [];
    let elements = document.querySelectorAll(".md\\:max-w-3xl");
    if (elements.length === 0) {
      elements = document.querySelectorAll('[data-testid="answer"], [data-testid="query"]');
    }
    elements.forEach((el, index) => {
      let role;
      const testid = el.getAttribute("data-testid");
      if (testid === "query") {
        role = "user";
      } else if (testid === "answer") {
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
      platform: "Perplexity",
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
