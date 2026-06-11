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
  assetFilter: (el) => !el.closest('button, [class*="avatar"]'),
});
