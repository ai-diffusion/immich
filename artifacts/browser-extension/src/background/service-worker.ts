// Minimal service worker — keeps the extension alive for message routing.
// Downloads are handled directly in the popup via blob URLs, so no
// download logic is needed here.
chrome.runtime.onInstalled.addListener(() => {
  console.log('AI Chat Exporter installed.');
});
