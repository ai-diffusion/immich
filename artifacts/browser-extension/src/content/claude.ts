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
  assetFilter: (el) => !el.closest('button, [class*="avatar"]'),
});
