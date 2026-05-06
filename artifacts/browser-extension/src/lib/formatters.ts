import type { Conversation, Format } from './types';

export function toMarkdown(conv: Conversation): string {
  let md = `# ${conv.title}\n\n`;
  md += `**Platform:** ${conv.platform}  \n`;
  md += `**URL:** ${conv.url}  \n`;
  md += `**Exported:** ${conv.exportedAt}\n\n`;
  md += `---\n\n`;

  conv.messages.forEach((msg) => {
    const speaker = msg.role === 'user' ? 'You' : 'AI';
    md += `**${speaker}:**\n\n${msg.content}\n\n---\n\n`;
  });

  return md.trim();
}

export function toPlainText(conv: Conversation): string {
  let text = `${conv.title}\n\n`;
  text += `Platform: ${conv.platform}\n`;
  text += `URL: ${conv.url}\n`;
  text += `Exported: ${conv.exportedAt}\n\n`;
  text += `---\n\n`;

  conv.messages.forEach((msg) => {
    const speaker = msg.role === 'user' ? 'You' : 'AI';
    text += `${speaker}:\n\n${msg.content}\n\n---\n\n`;
  });

  return text.trim();
}

export function toJSON(conv: Conversation): string {
  return JSON.stringify(conv, null, 2);
}

export function toHTML(conv: Conversation): string {
  const escapeHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const messagesHtml = conv.messages
    .map((msg) => {
      const roleClass = msg.role;
      const roleName = msg.role === 'user' ? 'You' : 'AI';
      const contentHtml = escapeHtml(msg.content).replace(/\n/g, '<br>');
      return `
      <div class="message ${roleClass}">
        <div class="label">${roleName}</div>
        <div class="content">${contentHtml}</div>
      </div>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(conv.title)}</title>
  <style>
    body { background: #1a1a1a; color: #e8e8e8; font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 24px; line-height: 1.6; }
    h1 { color: #a5b4fc; font-size: 1.4rem; margin-bottom: 6px; }
    .meta { font-size: 12px; color: #666; margin-bottom: 24px; }
    .meta a { color: #6366f1; }
    .message { margin-bottom: 20px; padding: 14px 16px; border-radius: 8px; }
    .message.user { background: #1e1e2e; border-left: 3px solid #6366f1; }
    .message.assistant { background: #111; border-left: 3px solid #22d3ee; }
    .label { font-size: 11px; font-weight: 700; text-transform: uppercase; opacity: 0.6; margin-bottom: 8px; }
    .message.user .label { color: #a5b4fc; }
    .message.assistant .label { color: #67e8f9; }
    .content { font-size: 14px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(conv.title)}</h1>
  <div class="meta">
    ${escapeHtml(conv.platform)} &bull; <a href="${escapeHtml(conv.url)}">${escapeHtml(conv.url)}</a> &bull; ${escapeHtml(conv.exportedAt)}
  </div>
  ${messagesHtml}
</body>
</html>`;
}

export function convert(conv: Conversation, format: Format): string {
  switch (format) {
    case 'markdown': return toMarkdown(conv);
    case 'text':     return toPlainText(conv);
    case 'json':     return toJSON(conv);
    case 'html':     return toHTML(conv);
    default:         return toMarkdown(conv);
  }
}
