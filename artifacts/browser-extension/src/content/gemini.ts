import { registerExtractor } from '../lib/capture';

registerExtractor({
  platform: 'Gemini',
  turnSelectorTiers: [['user-query', 'model-response']],
  roleOf: (turn) => (turn.tagName.toLowerCase() === 'user-query' ? 'user' : 'assistant'),
  proseSelectors: ['message-content', '.markdown', '[class*="markdown"]'],
  scrollContainerHint: 'main, [data-test-id="chat-history-container"]',
  modelOf: () => {
    const sel = [
      'model-switcher',
      'bard-model-switcher',
      '[data-test-id="model-switcher"] span',
      '[aria-label*="Gemini"] span',
      '.model-switcher-container span',
    ];
    for (const s of sel) {
      const el = document.querySelector(s);
      const text = (el as HTMLElement | null)?.innerText?.trim();
      if (text && text.length < 40) return text;
    }
    // Fall back to page title which often contains "Gemini 2.0" etc.
    const titleMatch = document.title.match(/Gemini[\s\w.]+/i);
    return titleMatch ? titleMatch[0].trim() : 'Gemini';
  },
  assetFilter: (el) => !el.closest('button, [class*="avatar"]'),
});
