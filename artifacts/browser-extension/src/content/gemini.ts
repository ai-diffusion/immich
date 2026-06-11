import { registerExtractor } from '../lib/capture';

registerExtractor({
  platform: 'Gemini',
  turnSelectorTiers: [['user-query', 'model-response']],
  roleOf: (turn) => (turn.tagName.toLowerCase() === 'user-query' ? 'user' : 'assistant'),
  proseSelectors: ['message-content', '.markdown', '[class*="markdown"]'],
  scrollContainerHint: 'main, [data-test-id="chat-history-container"]',
  assetFilter: (el) => !el.closest('button, [class*="avatar"]'),
});
