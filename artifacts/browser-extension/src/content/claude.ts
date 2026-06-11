import { registerExtractor } from '../lib/capture';

registerExtractor({
  platform: 'Claude',
  turnSelectorTiers: [
    ['[data-testid="human-turn"]', '[data-testid="ai-turn"]'],
    ['[data-testid="user-message"]', '.font-claude-message'],
  ],
  roleOf: (turn) => {
    if (turn.matches('[data-testid="human-turn"], [data-testid="user-message"]')) return 'user';
    return 'assistant';
  },
  proseSelectors: ['[class*="prose"]', '.font-claude-message', '[class*="markdown"]'],
  scrollContainerHint: 'main',
  modelOf: () => {
    const sel = [
      '[data-testid="model-selector-dropdown"] span',
      'button[data-testid*="model"] span',
      '[class*="model-name"]',
      'header [class*="model"]',
    ];
    for (const s of sel) {
      const el = document.querySelector(s);
      const text = (el as HTMLElement | null)?.innerText?.trim();
      if (text && text.length < 40) return text;
    }
    return null;
  },
  assetFilter: (el) => !el.closest('button, [class*="avatar"]'),
});
