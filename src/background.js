// src/background.js
console.log("[background] script loaded");

// 1️⃣ Fetch your Groq API key
async function getKey() {
  console.log("[background] getKey()");
  const { groqKey } = await chrome.storage.local.get("groqKey");
  if (!groqKey) {
    console.error("[background] No groqKey found");
    throw new Error("Groq API key not set. Please open Options and add it.");
  }
  return groqKey;
}

// 2️⃣ Summarize helper (unchanged)
async function summarize(text) {
  console.log("[background] summarize() text length:", text.length);
  const key = await getKey();
  const snippet = text.slice(0, 3000);
  const payload = {
    model: "llama3-8b-8192",
    messages: [
      { role: "system", content: "You are an assistant that generates concise bullet-point summaries." },
      { role: "user",   content: snippet }
    ],
    temperature: 0.2,
    max_completion_tokens: 512,
    top_p: 0.9,
    n: 1,
    stream: false
  };
  const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${key}`
    },
    body: JSON.stringify(payload)
  });
  if (!resp.ok) {
    const err = await resp.text();
    console.error("[background] summarize error:", err);
    throw new Error(`Groq ${resp.status}: ${err}`);
  }
  const { choices } = await resp.json();
  return choices[0].message.content.trim();
}

// 3️⃣ Smarter main-text extractor
function extractMainText() {
  // candidates: semantic blocks first
  let els = Array.from(document.querySelectorAll("article, main, section"));
  if (!els.length) {
    els = Array.from(document.body.querySelectorAll("div"));
  }

  // filter out nav/header/footer/aside and hidden
  els = els.filter(el => {
    const tag = el.tagName.toLowerCase();
    if (["nav","header","footer","aside"].includes(tag)) return false;
    if (el.closest("nav, header, footer, aside")) return false;
    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden";
  });

  // pick the one with most text
  let bestText = "";
  for (const el of els) {
    const t = el.innerText.trim();
    if (t.length > bestText.length) bestText = t;
  }

  // fallback to body if nothing
  return bestText || document.body.innerText || "";
}

// 4️⃣ Core flow: extract, screenshot, summarize, store
async function handleSummarize() {
  console.log("[background] handleSummarize()");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log("[background] Active tab:", tab.url);

    // ➡️ extract only main content
    const [{ result: content }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractMainText
    });
    console.log("[background] Extracted content length:", content.length);

    // ➡️ screenshot
    const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 50 });

    // const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    console.log("[background] Captured screenshot size:", screenshot.length);

    // ➡️ summary
    const summary = await summarize(content);
    console.log("[background] Got summary length:", summary.length);

    // ➡️ assemble entry
    const entry = {
      url:       tab.url,
      title:     tab.title,
      content,
      summary,
      screenshot,
      timestamp: Date.now(),
      qas:       []
    };

    // ➡️ save
    const { history = [] } = await chrome.storage.local.get("history");
    history.unshift(entry);
    await chrome.storage.local.set({ history });
    console.log("[background] Stored entry; total history:", history.length);

    // ➡️ broadcast
    chrome.runtime.sendMessage({ type: "NEW_SUMMARY" }, () => {
      if (chrome.runtime.lastError) {
        console.warn("[background] No listener for NEW_SUMMARY");
      }
    });
  } catch (err) {
    console.error("[background] handleSummarize error:", err);
  }
}

// 5️⃣ Listen for popup clicks
chrome.runtime.onMessage.addListener((msg) => {
  console.log("[background] onMessage:", msg);
  if (msg.type === "SUMMARIZE_PAGE") {
    handleSummarize();
  }
});

