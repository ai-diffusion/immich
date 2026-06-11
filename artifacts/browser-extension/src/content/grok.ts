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
  assetFilter: (el) => !el.closest('button, [class*="avatar"]'),
});
