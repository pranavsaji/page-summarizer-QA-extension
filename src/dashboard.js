// src/dashboard.js
console.log("[dashboard] loaded");

// Helper to fetch API key
async function getKey() {
  console.log("[dashboard] getKey()");
  const { groqKey } = await chrome.storage.local.get("groqKey");
  if (!groqKey) throw new Error("Set your Groq API key in Options.");
  return groqKey;
}

// Low-level chat Q&A
async function qaWithContext(context, question) {
  console.log("[dashboard] qaWithContext()");
  const key = await getKey();
  const payload = {
    model: "llama3-8b-8192",
    messages: [
      { role: "system", content: "Answer based on provided text." },
      { role: "user",   content: `${context}\n\nQ: ${question}` }
    ],
    temperature: 0.2,
    max_completion_tokens: 256,
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
    const text = await resp.text();
    throw new Error(text);
  }
  const { choices } = await resp.json();
  return choices[0].message.content.trim();
}

// Try full context, fallback to summary
async function askQuestion(context, summary, question) {
  try {
    console.log("[dashboard] Trying full-context Q&A");
    return await qaWithContext(context, question);
  } catch (err) {
    if (/tokens per minute|Request too large/.test(err.message)) {
      console.warn("[dashboard] Full-context failed, falling back:", err.message);
      return await qaWithContext(summary, question);
    }
    throw err;
  }
}

// Clear all history
async function clearHistory() {
  console.log("[dashboard] clearHistory()");
  await chrome.storage.local.remove("history");
  document.getElementById("list").innerHTML = "";
  document.getElementById("detail").innerHTML =
    "<p style='color:#666;'>History cleared. Summaries will appear here.</p>";
}

// Load and render history list
async function loadHistory() {
  console.log("[dashboard] loadHistory()");
  const { history = [] } = await chrome.storage.local.get("history");
  const list = document.getElementById("list");
  list.innerHTML = "";
  history.forEach((entry, idx) => {
    const li = document.createElement("li");
    li.textContent = `${new Date(entry.timestamp).toLocaleString()} – ${entry.title}`;
    li.addEventListener("click", () => showDetail(idx));
    list.appendChild(li);
  });
}

// Show detail view with content, summary, QA history, and form
async function showDetail(idx) {
  console.log("[dashboard] showDetail()", idx);
  const { history } = await chrome.storage.local.get("history");
  const e = history[idx];
  const d = document.getElementById("detail");

  // sanitize and preserve line breaks
  const safeContent = e.content
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");

  d.innerHTML = `
    <div class="card">
      <h2>${e.title}</h2>
      <img src="${e.screenshot}" alt="Screenshot"/>
      <details>
        <summary><strong>Full Page Content</strong></summary>
        <div style="margin-top:10px; line-height:1.4; max-height:300px; overflow:auto;">
          ${safeContent}
        </div>
      </details>
      <h3>Summary</h3>
      <p>${e.summary}</p>
      <div class="qa-history">
        <h3>Previous Q&amp;A</h3>
        ${e.qas.map(qa => `
          <div>
            <strong>Q:</strong> ${qa.question}<br>
            <strong>A:</strong> ${qa.answer}
          </div>
        `).join("") || "<p style='color:#666;'>No questions yet.</p>"}
      </div>
      <h3>Ask a New Question</h3>
      <div class="qa">
        <input id="q" placeholder="Your question…" />
        <button id="ask">Ask</button>
      </div>
      <div id="answer"></div>
    </div>
  `;

  document.getElementById("ask").onclick = async () => {
    const question = document.getElementById("q").value.trim();
    if (!question) return;
    const answerEl = document.getElementById("answer");
    answerEl.textContent = "Loading…";
    try {
      const answer = await askQuestion(e.content, e.summary, question);
      // save this Q&A
      e.qas.push({ question, answer, timestamp: Date.now() });
      await chrome.storage.local.set({ history });
      // re-render to include new Q&A
      showDetail(idx);
    } catch (err) {
      console.error("[dashboard] askQuestion error:", err);
      answerEl.textContent = "Error: " + err.message;
    }
  };
}

// Wire up Clear History button
document.getElementById("clear-history").addEventListener("click", () => {
  if (confirm("Really delete all saved summaries?")) {
    clearHistory();
  }
});

// Refresh list on new summary
chrome.runtime.onMessage.addListener((msg) => {
  console.log("[dashboard] onMessage:", msg);
  if (msg.type === "NEW_SUMMARY") loadHistory();
});

// Initial load
document.addEventListener("DOMContentLoaded", loadHistory);

