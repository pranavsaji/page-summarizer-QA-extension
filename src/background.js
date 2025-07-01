// src/background.js
console.log("[background] script loaded");

// ─── Helpers (added for semantic chunking) ───────────────────────
function cosine(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB) || 1);
}

async function embedText(text, hfKey) {
    const model = "sentence-transformers/all-MiniLM-L6-v2";
    const url = `https://router.huggingface.co/hf-inference/models/${model}/pipeline/feature-extraction`;
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${hfKey}` },
        body: JSON.stringify({ inputs: text })
    });
    if (!res.ok) throw new Error(`HF embed failed: ${await res.text()}`);
    const json = await res.json();
    return Array.isArray(json) ? json : null;
}
// ──────────────────────────────────────────────────────────────────

// 1️⃣ Keys
async function getGroqKey() {
  const { groqKey } = await chrome.storage.local.get("groqKey");
  if (!groqKey) throw new Error("Set your Groq API key in Options.");
  return groqKey;
}
async function getHfKey() {
  const { hfKey } = await chrome.storage.local.get("hfKey");
  if (!hfKey) throw new Error("Set your Huggingface API key in Options.");
  return hfKey;
}

// 2️⃣ Summarize via Groq Chat
async function summarize(text) {
  const key = await getGroqKey();
  const snippet = text.slice(0, 4000); // Increased snippet size for better summary
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type":"application/json", "Authorization":`Bearer ${key}` },
    body: JSON.stringify({
      model: "llama3-8b-8192",
      messages: [
        { role: "system", content: "You are a summarization assistant. Generate a concise, informative bullet-point summary of the provided text." },
        { role: "user",   content: snippet }
      ],
      temperature: 0.2,
      max_completion_tokens: 512,
      top_p: 0.9,
      n: 1
    })
  });
  if (!res.ok) throw new Error(`Summarize ${res.status}: ${await res.text()}`);
  const { choices } = await res.json();
  return choices[0].message.content.trim();
}

// 3️⃣ NEW CHUNKING STRATEGY: Semantic Chunker
async function semanticChunker(text, hfKey, similarityThreshold = 0.8) {
  console.log("[background] Starting semantic chunking...");
  // Split text into sentences. A simple regex is fine for most web content.
  const sentences = text.split(/(?<!\w\.\w.)(?<![A-Z][a-z]\.)(?<=\.|\?|\!)\s/g).map(s => s.trim()).filter(Boolean);
  if (sentences.length === 0) return [];

  const chunks = [];
  let currentChunkSentences = [sentences[0]];
  let lastEmbedding = await embedText(sentences[0], hfKey);

  for (let i = 1; i < sentences.length; i++) {
    const sentence = sentences[i];
    const currentEmbedding = await embedText(sentence, hfKey);

    if (!currentEmbedding || !lastEmbedding) continue;

    const similarity = cosine(lastEmbedding, currentEmbedding);
    
    // If sentences are semantically similar, add to the current chunk.
    if (similarity > similarityThreshold) {
      currentChunkSentences.push(sentence);
    } else {
      // If they are not similar, the topic has shifted. Finalize the current chunk.
      chunks.push({ id: chunks.length, text: currentChunkSentences.join(' ') });
      // Start a new chunk with the current sentence.
      currentChunkSentences = [sentence];
    }
    lastEmbedding = currentEmbedding;
  }
  // Add the last remaining chunk
  if (currentChunkSentences.length > 0) {
      chunks.push({ id: chunks.length, text: currentChunkSentences.join(' ') });
  }
  console.log(`[background] Semantic chunking complete. Created ${chunks.length} chunks.`);
  return chunks;
}


// 4️⃣ Extract trailing References/Notes block as its own chunk
function extractReferences(text) {
  const match = text.match(/(?:\n|^)(Notes?\[edit\]|References?\[edit\])([\s\S]+)$/i);
  return match ? { content: match[2].trim(), original: match[0] } : null;
}

// 5️⃣ Embed via HF router
async function embedChunks(text) {
  console.log("[background] embedChunks()");
  const hfKey = await getHfKey();

  const refsData = extractReferences(text);
  let mainText = refsData ? text.replace(refsData.original, "") : text;

  const chunks = await semanticChunker(mainText, hfKey, 0.8);
  if (refsData) chunks.push({ id: chunks.length, text: "References and citations: " + refsData.content });

  const embeddings = [];
  for (const { id, text: chunkText } of chunks) {
    try {
      const emb = await embedText(chunkText, hfKey);
      if (emb) {
        embeddings.push({ id, text: chunkText, emb });
      }
    } catch (err) {
      console.warn(`[background] embedChunks exception on chunk ${id}:`, err);
    }
  }

  console.log("[background] embeddings created:", embeddings.length);
  return embeddings;
}

// 6️⃣ Heuristic main-text extractor (no changes)
function extractMainText() {
  let els = [...document.querySelectorAll("article, main, section")];
  if (!els.length) els = [...document.body.querySelectorAll("div")];
  els = els.filter(el => {
    const tag = el.tagName.toLowerCase();
    if (["nav","header","footer","aside"].includes(tag)) return false;
    const style = getComputedStyle(el);
    return style.display!=="none" && style.visibility!=="hidden";
  });
  let best = "";
  for (const el of els) {
    const t = el.innerText.trim();
    if (t.length > best.length) best = t;
  }
  return best || document.body.innerText || "";
}

// 7️⃣ Full workflow (no changes)
async function handleSummarize() {
  console.log("[background] handleSummarize()");
  try {
    const [tab] = await chrome.tabs.query({ active:true, currentWindow:true });
    const [{ result: content }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractMainText });
    console.log("[background] content length:", content.length);
    const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 50 });
    const summary = await summarize(content);
    const embeddings = await embedChunks(content);
    const entry = { url: tab.url, title: tab.title, content, summary, screenshot, embeddings, timestamp: Date.now(), qas: [] };
    const { history = [] } = await chrome.storage.local.get("history");
    history.unshift(entry);
    await chrome.storage.local.set({ history });
    console.log("[background] saved entry; history length:", history.length);
    chrome.runtime.sendMessage({ type: "NEW_SUMMARY" }, ()=>{});
  } catch (err) {
    console.error("[background] handleSummarize error:", err);
  }
}

chrome.runtime.onMessage.addListener(msg => {
  if (msg.type === "SUMMARIZE_PAGE") handleSummarize();
});
