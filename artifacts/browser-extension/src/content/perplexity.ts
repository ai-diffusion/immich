import { registerExtractor } from '../lib/capture';

registerExtractor({
  platform: 'Perplexity',
  turnSelectorTiers: [
    ['[data-testid="query"]', '[data-testid="answer"]'],
    ['.md\\:max-w-3xl'],
  ],
  roleOf: (turn, index) => {
    const testid = turn.getAttribute('data-testid');
    if (testid === 'query') return 'user';
    if (testid === 'answer') return 'assistant';
    return index % 2 === 0 ? 'user' : 'assistant';
  },
  proseSelectors: ['.prose', '[class*="prose"]'],
  scrollContainerHint: 'main',
  modelOf: () => {
    const sel = [
      '[data-testid="model-selector"] span',
      'button[aria-label*="model" i] span',
      '[class*="ModelPill"] span',
      '[class*="model-selector"] span',
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
