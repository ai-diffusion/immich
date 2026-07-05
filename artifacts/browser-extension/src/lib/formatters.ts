import type { Conversation, Format } from './types';

// ── Stats ──────────────────────────────────────────────────────────────────

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function estimateTokens(text: string): number {
  return Math.round(text.length / 4);
}

interface ConvStats {
  totalWords: number;
  totalChars: number;
  estimatedTokens: number;
  userMessages: number;
  assistantMessages: number;
}

function computeStats(conv: Conversation): ConvStats {
  let totalWords = 0, totalChars = 0, userMessages = 0, assistantMessages = 0;
  for (const msg of conv.messages) {
    totalWords += countWords(msg.content);
    totalChars += msg.content.length;
    if (msg.role === 'user') userMessages++; else assistantMessages++;
  }
  return {
    totalWords, totalChars,
    estimatedTokens: estimateTokens(conv.messages.map((m) => m.content).join(' ')),
    userMessages, assistantMessages,
  };
}

// ── Cost table ─────────────────────────────────────────────────────────────

interface ModelInfo {
  name: string;
  contextK: number;       // context window in thousands of tokens
  inputPer1M: number;     // USD per 1M input tokens
  outputPer1M: number;    // USD per 1M output tokens
}

// Prices verified June 2026.
const MODELS: ModelInfo[] = [
  { name: 'Claude Sonnet 4.6', contextK: 200,  inputPer1M: 3.00,  outputPer1M: 15.00 },
  { name: 'Claude Opus 4.6',   contextK: 200,  inputPer1M: 5.00,  outputPer1M: 25.00 },
  { name: 'Claude Haiku 4.5',  contextK: 200,  inputPer1M: 1.00,  outputPer1M:  5.00 },
  { name: 'GPT-4.1',           contextK: 1000, inputPer1M: 2.00,  outputPer1M:  8.00 },
  { name: 'GPT-4.1 Mini',      contextK: 1000, inputPer1M: 0.40,  outputPer1M:  1.60 },
  { name: 'Gemini 2.5 Pro',    contextK: 1000, inputPer1M: 1.25,  outputPer1M: 10.00 },
  { name: 'Grok 4.3',          contextK: 1000, inputPer1M: 1.25,  outputPer1M:  2.50 },
  { name: 'Grok 4.20',         contextK: 2000, inputPer1M: 2.00,  outputPer1M:  6.00 },
];

interface TokenBreakdown {
  inputTokens: number;          // sum of your (user) message tokens, single pass
  outputTokens: number;         // sum of the AI's message tokens
  compoundedInputTokens: number; // input actually billed: context resent each turn
  singlePassTokens: number;     // input + output, one pass (for context-window %)
}

// Real API billing has two effects the naive "whole convo × input rate" misses:
// output is billed at the (higher) output rate, and every AI reply resends the
// entire prior thread as input — so input compounds across turns.
function computeTokenBreakdown(conv: Conversation): TokenBreakdown {
  let inputTokens = 0;
  let outputTokens = 0;
  let compoundedInputTokens = 0;
  let runningContext = 0;
  for (const msg of conv.messages) {
    const t = estimateTokens(msg.content);
    if (msg.role === 'user') {
      inputTokens += t;
      runningContext += t;
    } else {
      outputTokens += t;
      compoundedInputTokens += runningContext; // context sent to generate this reply
      runningContext += t;
    }
  }
  return {
    inputTokens,
    outputTokens,
    compoundedInputTokens,
    singlePassTokens: inputTokens + outputTokens,
  };
}

function trueCost(b: TokenBreakdown, m: ModelInfo): number {
  return (b.compoundedInputTokens / 1_000_000) * m.inputPer1M
       + (b.outputTokens / 1_000_000) * m.outputPer1M;
}

function defaultModelFor(platform: string): ModelInfo {
  const p = platform.toLowerCase();
  if (p.includes('claude')) return MODELS.find((m) => m.name === 'Claude Sonnet 4.6')!;
  if (p.includes('gemini')) return MODELS.find((m) => m.name === 'Gemini 2.5 Pro')!;
  if (p.includes('grok')) return MODELS.find((m) => m.name === 'Grok 4.3')!;
  return MODELS.find((m) => m.name === 'GPT-4.1')!; // ChatGPT / GPT / OpenAI / other
}

// Best-effort match of the conversation's actual model string to our rate table.
function matchModel(conv: Conversation): ModelInfo {
  if (conv.model) {
    const needle = conv.model.toLowerCase().replace(/[\s._-]/g, '');
    const hit = MODELS.find((m) => {
      const hay = m.name.toLowerCase().replace(/[\s._-]/g, '');
      return hay.includes(needle) || needle.includes(hay);
    });
    if (hit) return hit;
  }
  return defaultModelFor(conv.platform);
}

function fmtUsd(n: number): string {
  if (n === 0) return '$0.00';
  if (n < 0.01) return '$' + n.toFixed(4);
  return '$' + n.toFixed(2);
}

function costTable(conv: Conversation, b: TokenBreakdown): string {
  const rows = MODELS.map((m) => {
    const contextTokens = m.contextK * 1000;
    const pct = ((b.singlePassTokens / contextTokens) * 100).toFixed(2) + '%';
    const cost = fmtUsd(trueCost(b, m));
    return `| ${m.name} | ${m.contextK}K | ${pct} | ${cost} |`;
  });
  return [
    '| Model | Context window | Convo = % of window | True cost (in+out) |',
    '|---|---|---|---|',
    ...rows,
  ].join('\n');
}

// ── Date formatting ────────────────────────────────────────────────────────

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];
const DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function friendlyDateTime(iso: string): string {
  const d = new Date(iso);
  const day   = DAYS[d.getDay()];
  const date  = d.getDate();
  const month = MONTHS[d.getMonth()];
  const year  = d.getFullYear();
  let hours   = d.getHours();
  const mins  = String(d.getMinutes()).padStart(2, '0');
  const ampm  = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12 || 12;
  return `${day}, ${date} ${month} ${year}, ${hours}.${mins}${ampm}`;
}

function shortDateTime(iso: string): string {
  const d = new Date(iso);
  const date  = d.getDate();
  const month = MONTHS[d.getMonth()];
  const year  = d.getFullYear();
  let hours   = d.getHours();
  const mins  = String(d.getMinutes()).padStart(2, '0');
  const ampm  = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12 || 12;
  return `${date} ${month} ${year}, ${hours}.${mins}${ampm}`;
}

function kTokens(n: number): string {
  return Math.round(n / 1000) + 'k';
}

// ── Filename ───────────────────────────────────────────────────────────────

export function buildFilename(conv: Conversation, ext: string): string {
  const s = computeStats(conv);
  const date = conv.exportedAt.slice(0, 10);
  const platform = conv.platform;
  const title = conv.title
    .replace(/[/\\:*?"<>|—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  const exported = shortDateTime(conv.exportedAt);
  const msgCount = conv.messages.length;
  const tk = kTokens(s.estimatedTokens);
  return `${date} — ${platform} — ${title} — exported ${exported} [${msgCount} msgs ~${tk} tk].${ext}`;
}

// ── YAML frontmatter ───────────────────────────────────────────────────────

function yamlFrontmatter(conv: Conversation, s: ConvStats): string {
  const b = computeTokenBreakdown(conv);
  const m = matchModel(conv);
  const cost = trueCost(b, m);
  const lines = [
    '---',
    `title: "${conv.title.replace(/"/g, '\\"')}"`,
    `date: ${conv.exportedAt.slice(0, 10)}`,
    `time: ${conv.exportedAt.slice(11, 19)}`,
    `platform: ${conv.platform}`,
  ];
  if (conv.model) lines.push(`model: "${conv.model}"`);
  lines.push(
    `url: "${conv.url}"`,
    `messages: ${conv.messages.length}`,
    `user_messages: ${s.userMessages}`,
    `ai_messages: ${s.assistantMessages}`,
    `words: ${s.totalWords}`,
    `characters: ${s.totalChars}`,
    `estimated_tokens: ${s.estimatedTokens}`,
    `estimated_input_tokens: ${b.inputTokens}`,
    `estimated_output_tokens: ${b.outputTokens}`,
    `est_api_cost_usd: ${cost.toFixed(4)}`,
    `est_api_model: "${m.name}"`,
    `tags: [ai-chat, ${conv.platform.toLowerCase().replace(/\s+/g, '-')}${conv.model ? ', ' + conv.model.toLowerCase().replace(/[\s.]/g, '-') : ''}]`,
    'source: Complete Recall',
    '---',
    '',
  );
  return lines.join('\n');
}

// ── Message preview (first line, capped) ──────────────────────────────────

function preview(text: string, max = 80): string {
  const first = text.trim().split('\n')[0].replace(/[#*`_]/g, '').trim();
  return first.length > max ? first.slice(0, max - 1) + '…' : first;
}

// ── Markdown formatter ─────────────────────────────────────────────────────

export function toMarkdown(conv: Conversation): string {
  const s = computeStats(conv);
  const aiName = conv.platform; // e.g. "ChatGPT", "Grok", "Claude"

  let md = yamlFrontmatter(conv, s);
  md += `# ${conv.title}\n\n`;

  // ── File info ──
  md += `## File info\n\n`;
  md += `- **Source:** ${conv.platform}`;
  if (conv.model) md += ` (${conv.model})`;
  md += ` — ${conv.url}\n`;
  md += `- **Exported:** ${friendlyDateTime(conv.exportedAt)}\n\n`;

  // ── Size ──
  md += `## Size\n\n`;
  md += `- **Messages:** ${conv.messages.length} (${s.userMessages} from you, ${s.assistantMessages} from ${aiName})\n`;
  md += `- **Words:** ${s.totalWords.toLocaleString()}\n`;
  md += `- **Characters:** ${s.totalChars.toLocaleString()}\n`;
  md += `- **Estimated tokens:** ~${s.estimatedTokens.toLocaleString()} *(rough estimate, ~4 chars/token; exact count varies by model)*\n\n`;

  // ── Cost (API-equivalent) ──
  const b = computeTokenBreakdown(conv);
  const actual = matchModel(conv);
  md += `## Cost (API-equivalent)\n\n`;
  md += `- **This conversation via ${actual.name} API: ≈ ${fmtUsd(trueCost(b, actual))}** — input ~${b.compoundedInputTokens.toLocaleString()} tk (context resent each turn), output ~${b.outputTokens.toLocaleString()} tk\n`;
  md += `- *If this ran on a flat-rate subscription (Claude Pro, ChatGPT Plus, Grok Premium, Gemini Advanced) your out-of-pocket was likely $0. This is the metered-API equivalent.*\n\n`;
  md += `### If this conversation had run on other models\n\n`;
  md += costTable(conv, b) + '\n\n';
  md += `*Multi-turn context compounding included; ~4 chars/token estimate. Prices verified June 2026.*\n\n`;

  // ── Conversation turns with numbered headings ──
  let exchangeNum = 0;
  conv.messages.forEach((msg) => {
    if (msg.role === 'user') exchangeNum++;
    const speaker = msg.role === 'user' ? 'You' : aiName;
    const prev = preview(msg.content);
    md += `## ${speaker} · ${exchangeNum} · ${prev}\n\n`;
    md += msg.content.trim() + '\n\n';
  });

  return md.trim();
}

// ── Plain text formatter ───────────────────────────────────────────────────

export function toPlainText(conv: Conversation): string {
  const s = computeStats(conv);
  let text = `${conv.title}\n${'='.repeat(Math.min(conv.title.length, 60))}\n\n`;
  text += `Platform: ${conv.platform}`;
  if (conv.model) text += ` (${conv.model})`;
  text += `\nURL: ${conv.url}\n`;
  text += `Exported: ${friendlyDateTime(conv.exportedAt)}\n`;
  text += `Messages: ${conv.messages.length} (${s.userMessages} from you, ${s.assistantMessages} from ${conv.platform})\n`;
  text += `Words: ${s.totalWords.toLocaleString()}  |  Est. tokens: ~${s.estimatedTokens.toLocaleString()}  |  Characters: ${s.totalChars.toLocaleString()}\n`;
  const bt = computeTokenBreakdown(conv);
  const mt = matchModel(conv);
  text += `Est. API cost via ${mt.name}: ~${fmtUsd(trueCost(bt, mt))} (input ~${bt.compoundedInputTokens.toLocaleString()} tk compounded, output ~${bt.outputTokens.toLocaleString()} tk)\n\n`;
  text += `${'─'.repeat(60)}\n\n`;

  let exchangeNum = 0;
  conv.messages.forEach((msg) => {
    if (msg.role === 'user') exchangeNum++;
    const speaker = msg.role === 'user' ? 'You' : conv.platform;
    text += `${speaker} · ${exchangeNum}:\n\n${msg.content.trim()}\n\n${'─'.repeat(60)}\n\n`;
  });

  return text.trim();
}

// ── JSON formatter ─────────────────────────────────────────────────────────

export function toJSON(conv: Conversation): string {
  const s = computeStats(conv);
  return JSON.stringify({ ...conv, stats: s }, null, 2);
}

// ── HTML formatter ─────────────────────────────────────────────────────────

export function toHTML(conv: Conversation): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const s = computeStats(conv);
  const aiName = conv.platform;

  let exchangeNum = 0;
  const messagesHtml = conv.messages.map((msg) => {
    if (msg.role === 'user') exchangeNum++;
    const roleClass = msg.role;
    const roleName = msg.role === 'user' ? 'You' : aiName;
    const contentHtml = esc(msg.content).replace(/\n/g, '<br>');
    return `
      <div class="message ${roleClass}">
        <div class="label">${roleName} · ${exchangeNum}</div>
        <div class="content">${contentHtml}</div>
      </div>`;
  }).join('\n');

  const b = computeTokenBreakdown(conv);
  const actual = matchModel(conv);
  const costRowsHtml = MODELS.map((m) => {
    const contextTokens = m.contextK * 1000;
    const pct = ((b.singlePassTokens / contextTokens) * 100).toFixed(2) + '%';
    const cost = fmtUsd(trueCost(b, m));
    return `<tr><td>${esc(m.name)}</td><td>${m.contextK}K</td><td>${pct}</td><td>${cost}</td></tr>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(conv.title)}</title>
  <style>
    body { background:#1a1a1a; color:#e8e8e8; font-family:sans-serif; max-width:800px; margin:0 auto; padding:24px; line-height:1.6; }
    h1 { color:#a5b4fc; font-size:1.4rem; margin-bottom:6px; }
    h2 { color:#888; font-size:.85rem; font-weight:600; text-transform:uppercase; letter-spacing:.5px; margin:24px 0 8px; }
    .meta { font-size:12px; color:#666; margin-bottom:8px; }
    .meta a { color:#6366f1; }
    table { width:100%; border-collapse:collapse; font-size:12px; margin:12px 0; }
    th,td { padding:6px 10px; text-align:left; border-bottom:1px solid #333; }
    th { color:#a5b4fc; }
    .message { margin-bottom:16px; padding:12px 16px; border-radius:8px; }
    .message.user { background:#1e1e2e; border-left:3px solid #6366f1; }
    .message.assistant { background:#111; border-left:3px solid #22d3ee; }
    .label { font-size:11px; font-weight:700; text-transform:uppercase; opacity:.6; margin-bottom:8px; color:#a5b4fc; }
    .message.assistant .label { color:#67e8f9; }
    .content { font-size:14px; }
  </style>
</head>
<body>
  <h1>${esc(conv.title)}</h1>
  <h2>File info</h2>
  <div class="meta"><strong>Source:</strong> ${esc(conv.platform)}${conv.model ? ' (' + esc(conv.model) + ')' : ''} — <a href="${esc(conv.url)}">${esc(conv.url)}</a></div>
  <div class="meta"><strong>Exported:</strong> ${esc(friendlyDateTime(conv.exportedAt))}</div>
  <h2>Size</h2>
  <div class="meta">
    ${conv.messages.length} messages (${s.userMessages} from you, ${s.assistantMessages} from ${esc(aiName)}) &bull;
    ${s.totalWords.toLocaleString()} words &bull; ~${s.estimatedTokens.toLocaleString()} tokens &bull; ${s.totalChars.toLocaleString()} chars
  </div>
  <h2>Cost (API-equivalent)</h2>
  <div class="meta"><strong>This conversation via ${esc(actual.name)} API: &asymp; ${fmtUsd(trueCost(b, actual))}</strong> &bull; input ~${b.compoundedInputTokens.toLocaleString()} tk (context resent each turn), output ~${b.outputTokens.toLocaleString()} tk</div>
  <table>
    <tr><th>Model</th><th>Context window</th><th>Convo = % of window</th><th>True cost (in+out)</th></tr>
    ${costRowsHtml}
  </table>
  <p style="font-size:11px;color:#555;"><em>Multi-turn context compounding included; ~4 chars/token estimate. Flat-rate subscriptions = $0 out of pocket. Prices verified June 2026.</em></p>
  <h2>Conversation</h2>
  ${messagesHtml}
</body>
</html>`;
}

// ── Dispatcher ─────────────────────────────────────────────────────────────

export function convert(conv: Conversation, format: Format): string {
  switch (format) {
    case 'markdown': return toMarkdown(conv);
    case 'text':     return toPlainText(conv);
    case 'json':     return toJSON(conv);
    case 'html':     return toHTML(conv);
    default:         return toMarkdown(conv);
  }
}
