import { registerExtractor } from '../lib/capture';

registerExtractor({
  platform: 'Grok',
  turnSelectorTiers: [
    ['[data-testid="userMessage"]', '[data-testid="assistantMessage"]'],
    ['.message-bubble'],
  ],
  roleOf: (turn, index) => {
    const testid = turn.getAttribute('data-testid');
    if (testid === 'userMessage') return 'user';
    if (testid === 'assistantMessage') return 'assistant';
    // .message-bubble fallback: bubbles alternate starting with the user.
    return index % 2 === 0 ? 'user' : 'assistant';
  },
  proseSelectors: ['[class*="prose"]', '[class*="markdown"]'],
  scrollContainerHint: 'main',
  modelOf: () => {
    const sel = [
      '[data-testid="model-selector"] span',
      'button[aria-label*="model" i] span',
      '[class*="model-name"]',
      '[class*="ModelSelector"] span',
    ];
    for (const s of sel) {
      const el = document.querySelector(s);
      const text = (el as HTMLElement | null)?.innerText?.trim();
      if (text && text.length < 40) return text;
    }
    const titleMatch = document.title.match(/Grok[\s\w-]+/i);
    return titleMatch ? titleMatch[0].trim() : 'Grok';
  },
  assetFilter: (el) => !el.closest('button, [class*="avatar"]'),
});
