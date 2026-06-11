"use strict";
(() => {
  // src/lib/dom-to-markdown.ts
  function walk(node, hooks) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node;
    if (typeof el.className === "string" && el.className.includes("sr-only")) return "";
    const tag = el.tagName.toLowerCase();
    const kids = () => Array.from(el.childNodes).map((n) => walk(n, hooks)).join("");
    switch (tag) {
      case "h1":
        return `# ${kids().trim()}

`;
      case "h2":
        return `## ${kids().trim()}

`;
      case "h3":
        return `### ${kids().trim()}

`;
      case "h4":
        return `#### ${kids().trim()}

`;
      case "h5":
        return `##### ${kids().trim()}

`;
      case "h6":
        return `###### ${kids().trim()}

`;
      case "strong":
      case "b":
        return `**${kids()}**`;
      case "em":
      case "i":
        return `_${kids()}_`;
      case "code":
        return el.closest("pre") ? kids() : `\`${kids()}\``;
      case "pre":
        return `\`\`\`
${el.innerText}
\`\`\`

`;
      case "p":
        return `${kids()}

`;
      case "br":
        return "\n";
      case "hr":
        return "---\n\n";
      case "img":
        return hooks.onImage ? hooks.onImage(el) : "";
      case "a": {
        const href = el.href ?? "";
        const text = kids().trim();
        return href ? `[${text}](${href})` : text;
      }
      case "ul":
      case "ol": {
        const ordered = tag === "ol";
        let i = 0;
        return Array.from(el.childNodes).filter((n) => n.tagName?.toLowerCase() === "li").map((li) => `${ordered ? `${++i}.` : "-"} ${walk(li, hooks).trim()}`).join("\n") + "\n\n";
      }
      case "li":
        return kids();
      case "button":
      case "svg":
      case "script":
      case "style":
        return "";
      default:
        return kids();
    }
  }
  function htmlToMarkdown(root, hooks = {}) {
    return walk(root, hooks).replace(/\n{3,}/g, "\n\n").trim();
  }
  function findProseRoots(turn, proseSelectors) {
    for (const sel of proseSelectors) {
      const matches = Array.from(turn.querySelectorAll(sel));
      if (matches.length) {
        return matches.filter((m) => !matches.some((o) => o !== m && o.contains(m)));
      }
    }
    return [turn];
  }

  // src/lib/capture.ts
  var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function findTurns(config) {
    for (const tier of config.turnSelectorTiers) {
      const found = document.querySelectorAll(tier.join(","));
      if (found.length) return Array.from(found);
    }
    return [];
  }
  function findScrollContainer(sampleTurn, hint) {
    let start = sampleTurn;
    if (!start && hint) start = document.querySelector(hint);
    let el = start;
    while (el) {
      if (el.scrollHeight > el.clientHeight + 4) {
        const overflow = getComputedStyle(el).overflowY;
        if (overflow === "auto" || overflow === "scroll") return el;
      }
      el = el.parentElement;
    }
    return document.scrollingElement ?? document.documentElement;
  }
  function pushProgress(turnCount, iteration) {
    try {
      const p = chrome.runtime.sendMessage({ type: "EXTRACT_PROGRESS", turnCount, iteration });
      if (p && typeof p.catch === "function") {
        p.catch(() => {
        });
      }
    } catch {
    }
  }
  async function autoScrollToTop(container, countTurns, onIteration) {
    const maxIterations = 60;
    const settleMs = 600;
    const stableRequired = 3;
    const target = container === document.documentElement || container === document.body ? document.scrollingElement ?? document.documentElement : container;
    if (target.scrollHeight <= target.clientHeight + 4) {
      return { truncated: false, shrinkage: false };
    }
    let prevCount = countTurns();
    let prevHeight = target.scrollHeight;
    let stable = 0;
    let shrinkage = false;
    let truncated = true;
    for (let i = 0; i < maxIterations; i++) {
      target.scrollTop = 0;
      if (target === document.scrollingElement || target === document.documentElement) {
        window.scrollTo(0, 0);
      }
      target.dispatchEvent(new Event("scroll", { bubbles: true }));
      await sleep(settleMs);
      const count = countTurns();
      const height = target.scrollHeight;
      if (count < prevCount) shrinkage = true;
      onIteration(i, count, shrinkage);
      if (count === prevCount && height === prevHeight && target.scrollTop <= 2) {
        if (++stable >= stableRequired) {
          truncated = false;
          break;
        }
      } else {
        stable = 0;
      }
      prevCount = count;
      prevHeight = height;
    }
    target.scrollTop = target.scrollHeight;
    return { truncated, shrinkage };
  }
  function slugify(text) {
    const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
    return slug || "conversation";
  }
  var assetRegistry = /* @__PURE__ */ new Map();
  function extFromUrl(url) {
    const m = url.match(/\.([a-z0-9]{2,5})(?:[?#]|$)/i);
    return m ? m[1].toLowerCase() : null;
  }
  function sanitizeName(name) {
    return name.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "file";
  }
  function collectAssets(turns, config, exportDirName) {
    assetRegistry.clear();
    const assets = [];
    const markerByEl = /* @__PURE__ */ new Map();
    let imgCount = 0;
    turns.forEach((turn, messageIndex) => {
      turn.querySelectorAll("img").forEach((img) => {
        if (config.assetFilter && !config.assetFilter(img)) return;
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (w > 0 && w < 40 && h > 0 && h < 40) return;
        const url = img.currentSrc || img.src;
        if (!url || url.startsWith("chrome") || url.startsWith("moz-extension")) return;
        const ext = url.startsWith("data:") || url.startsWith("blob:") ? "png" : extFromUrl(url) ?? "png";
        const name = `image-${++imgCount}.${ext}`;
        const id = `asset-${assets.length}`;
        assets.push({ id, kind: "image", url, name, messageIndex });
        assetRegistry.set(id, { url, el: img });
        markerByEl.set(img, `![image](./${exportDirName}/${name})`);
      });
      turn.querySelectorAll('a[download], a[href*="/files/"]').forEach((a) => {
        if (config.assetFilter && !config.assetFilter(a)) return;
        const url = a.href;
        if (!url || !/^https?:/.test(url)) return;
        const rawName = a.getAttribute("download") || a.textContent?.trim() || url.split("/").pop() || "file";
        const name = sanitizeName(rawName);
        const id = `asset-${assets.length}`;
        assets.push({ id, kind: "file", url, name, messageIndex });
        assetRegistry.set(id, { url, el: null });
      });
    });
    return {
      assets,
      markerFor: (img) => markerByEl.get(img) ?? null
    };
  }
  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }
  var MAX_TRANSFER_BYTES = 32 * 1024 * 1024;
  function imageToDataUrl(img) {
    if (!img.complete || img.naturalWidth === 0) return null;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0);
      return canvas.toDataURL("image/png");
    } catch {
      return null;
    }
  }
  async function getAsset(id) {
    const entry = assetRegistry.get(id);
    if (!entry) return { ok: false, error: "unknown-asset" };
    const { url, el } = entry;
    if (url.startsWith("data:")) return { ok: true, dataUrl: url };
    if (url.startsWith("blob:") && el instanceof HTMLImageElement) {
      const dataUrl = imageToDataUrl(el);
      if (dataUrl) return { ok: true, dataUrl };
    }
    try {
      const resp = await fetch(url, { credentials: "include" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      if (blob.size > MAX_TRANSFER_BYTES) return { ok: false, error: "too-large", url };
      return { ok: true, dataUrl: await blobToDataUrl(blob) };
    } catch (e) {
      if (el instanceof HTMLImageElement) {
        const dataUrl = imageToDataUrl(el);
        if (dataUrl) return { ok: true, dataUrl };
      }
      return { ok: false, error: String(e), url };
    }
  }
  function extractMessages(turns, config, markerFor) {
    const hooks = {
      onImage: (img) => markerFor ? markerFor(img) ?? "" : ""
    };
    const messages = [];
    turns.forEach((turn, index) => {
      const role = config.roleOf(turn, index);
      if (role !== "user" && role !== "assistant") return;
      const proseRoots = findProseRoots(turn, config.proseSelectors);
      let content = proseRoots.map((r) => htmlToMarkdown(r, hooks)).filter(Boolean).join("\n\n");
      const extras = config.extractAttachmentTexts?.(turn, proseRoots) ?? [];
      for (const extra of extras) {
        content += (content ? "\n\n---\n" : "") + extra;
      }
      content = content.trim();
      if (content) messages.push({ role, content });
    });
    return messages;
  }
  function mergeWindows(windows) {
    const result = [];
    const seen = /* @__PURE__ */ new Set();
    for (let i = windows.length - 1; i >= 0; i--) {
      for (const m of windows[i]) {
        const key = m.role + "|" + m.content;
        if (!seen.has(key)) {
          seen.add(key);
          result.push(m);
        }
      }
    }
    return result;
  }
  async function captureConversation(config) {
    const countTurns = () => findTurns(config).length;
    const initialTurns = findTurns(config);
    const container = findScrollContainer(initialTurns[0] ?? null, config.scrollContainerHint ?? "main");
    const windows = [];
    const scroll = await autoScrollToTop(container, countTurns, (iteration, count, shrinkage) => {
      pushProgress(count, iteration);
      if (iteration === 0 || shrinkage) {
        windows.push(extractMessages(findTurns(config), config, null));
      }
    });
    const turns = findTurns(config);
    const title = (config.titleOf?.() ?? document.title).trim() || "conversation";
    const exportDirName = `chat-export-${slugify(title)}`;
    const { assets, markerFor } = collectAssets(turns, config, exportDirName);
    let messages;
    if (scroll.shrinkage) {
      windows.push(extractMessages(turns, config, null));
      messages = mergeWindows(windows);
    } else {
      messages = extractMessages(turns, config, markerFor);
    }
    return {
      conversation: {
        title,
        platform: config.platform,
        url: window.location.href,
        messages,
        exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
        assets
      },
      exportDirName,
      truncated: scroll.truncated
    };
  }
  function registerExtractor(config) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.type === "EXTRACT_CONVERSATION") {
        captureConversation(config).then((result) => sendResponse(result)).catch((e) => sendResponse({ error: String(e) }));
        return true;
      }
      if (msg?.type === "GET_ASSET") {
        getAsset(msg.id).then((result) => sendResponse(result)).catch((e) => sendResponse({ ok: false, error: String(e) }));
        return true;
      }
      return void 0;
    });
  }

  // src/content/gemini.ts
  registerExtractor({
    platform: "Gemini",
    turnSelectorTiers: [["user-query", "model-response"]],
    roleOf: (turn) => turn.tagName.toLowerCase() === "user-query" ? "user" : "assistant",
    proseSelectors: ["message-content", ".markdown", '[class*="markdown"]'],
    scrollContainerHint: 'main, [data-test-id="chat-history-container"]',
    assetFilter: (el) => !el.closest('button, [class*="avatar"]')
  });
})();
