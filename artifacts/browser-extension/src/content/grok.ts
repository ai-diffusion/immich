import type { Message, Conversation } from '../lib/types';

function extract(): Conversation {
  const messages: Message[] = [];

  // Primary selector
  let elements = document.querySelectorAll('[data-testid="userMessage"], [data-testid="assistantMessage"]');

  // Fallback: alternate bubbles starting with user
  if (elements.length === 0) {
    elements = document.querySelectorAll('.message-bubble');
  }

  elements.forEach((el, index) => {
    let role: 'user' | 'assistant';
    const testid = el.getAttribute('data-testid');

    if (testid === 'userMessage') {
      role = 'user';
    } else if (testid === 'assistantMessage') {
      role = 'assistant';
    } else {
      role = index % 2 === 0 ? 'user' : 'assistant';
    }

    const content = (el as HTMLElement).innerText.trim();
    if (content) {
      messages.push({ role, content });
    }
  });

  return {
    title: document.title,
    platform: 'Grok',
    url: window.location.href,
    messages,
    exportedAt: new Date().toISOString(),
  };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'EXTRACT_CONVERSATION') {
    try {
      sendResponse({ conversation: extract() });
    } catch (e) {
      sendResponse({ error: String(e) });
    }
  }
  return true;
});
