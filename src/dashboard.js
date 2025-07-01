// dashboard.js
console.log("[dashboard] script loaded");

// ─── Helpers ────────────────────────────────────────────────────

async function getKey(name) {
  const obj = await chrome.storage.local.get(name);
  if (!obj[name]) throw new Error(`${name} not set in Options`);
  return obj[name];
}

async function embedText(text) {
  const hfKey = await getKey("hfKey");
  const model = "sentence-transformers/all-MiniLM-L6-v2";
  const url   = `https://router.huggingface.co/hf-inference/models/${model}/pipeline/feature-extraction`;
  const res   = await fetch(url, {
    method: "POST",
    headers: { "Content-Type":"application/json", "Authorization":`Bearer ${hfKey}` },
    body: JSON.stringify({ inputs: text })
  });
  if (!res.ok) throw new Error(`HF embed failed: ${await res.text()}`);
  const json = await res.json();
  const embedding = Array.isArray(json) ? json : null;
  if (!embedding) throw new Error("Embedding response was not a valid array.");
  return embedding;
}

function cosine(a, b) {
  let dot=0, magA=0, magB=0;
  for (let i=0; i<a.length; i++) {
    dot  += a[i]*b[i];
    magA += a[i]*a[i];
    magB += b[i]*b[i];
  }
  return dot / (Math.sqrt(magA)*Math.sqrt(magB) || 1);
}

// NEW RETRIEVAL STRATEGY: Maximal Marginal Relevance (MMR)
function retrieveWithMMR(queryEmb, docEmbeddings, k = 3, lambda = 0.5) {
  if (docEmbeddings.length === 0) return [];
  if (docEmbeddings.length <= k) return docEmbeddings;

  const scoredDocs = docEmbeddings.map(doc => ({
    ...doc,
    score: cosine(queryEmb, doc.emb)
  }));

  const selectedDocs = [];
  const remainingDocs = [...scoredDocs];

  // 1. Pick the most relevant document first
  const firstDocIndex = remainingDocs.reduce((maxIdx, doc, i) => doc.score > remainingDocs[maxIdx].score ? i : maxIdx, 0);
  selectedDocs.push(remainingDocs[firstDocIndex]);
  remainingDocs.splice(firstDocIndex, 1);

  // 2. Iteratively pick the next best docs using MMR
  while (selectedDocs.length < k && remainingDocs.length > 0) {
    let bestMmrScore = -Infinity;
    let nextDocIndex = -1;

    for (let i = 0; i < remainingDocs.length; i++) {
      const doc = remainingDocs[i];
      const relevance = doc.score;
      const maxSimilarityToSelected = Math.max(...selectedDocs.map(sel => cosine(doc.emb, sel.emb)));
      const mmrScore = lambda * relevance - (1 - lambda) * maxSimilarityToSelected;

      if (mmrScore > bestMmrScore) {
        bestMmrScore = mmrScore;
        nextDocIndex = i;
      }
    }
    
    selectedDocs.push(remainingDocs[nextDocIndex]);
    remainingDocs.splice(nextDocIndex, 1);
  }

  return selectedDocs;
}

async function askQuestion(summary, chunks, question) {
  try {
    const groqKey = await getKey("groqKey");
    const messages = [
      { role: "system", content: "You are an assistant that answers based on provided context chunks. If the context is empty or irrelevant, say you cannot answer based on the provided text." },
      { role: "user", content:
        `Overall Page Summary:\n${summary}\n\n` +
        `Relevant Context Chunks:\n${chunks.map(c=>`[${c.id}] ${c.text}`).join("\n")}\n\n` +
        `Based on the provided summary and context, answer this question: ${question}`
      }
    ];
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type":"application/json", "Authorization":`Bearer ${groqKey}` },
      body: JSON.stringify({
        model: "llama3-8b-8192", messages, temperature: 0.2, max_completion_tokens: 256, top_p: 0.9, n: 1
      })
    });
    if (!res.ok) {
      const t = await res.text();
      if (res.status === 503) throw new Error("Answer service unavailable (503).");
      throw new Error(`Groq QA ${res.status}: ${t}`);
    }
    const { choices } = await res.json();
    return choices[0].message.content.trim();
  } catch (err) {
    throw err;
  }
}

// ─── Sidebar & Detail ───────────────────────────────────────────

async function loadHistory() {
  const { history = [] } = await chrome.storage.local.get("history");
  const list = document.getElementById("list");
  list.innerHTML = "";
  history.forEach((entry,i) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${new Date(entry.timestamp).toLocaleString()} – ${entry.title}</span><button class="remove" title="Delete">×</button>`;
    li.querySelector("span").onclick = () => showDetail(i);
    li.querySelector(".remove").onclick = async e => {
      e.stopPropagation();
      if (!confirm("Delete this entry?")) return;
      history.splice(i,1);
      await chrome.storage.local.set({ history });
      loadHistory();
      document.getElementById("detail").innerHTML = `<p style="color:#666;">Select an entry…</p>`;
    };
    list.appendChild(li);
  });
}

async function showDetail(idx) {
  const { history = [] } = await chrome.storage.local.get("history");
  const e = history[idx];
  const detail = document.getElementById("detail");
  detail.innerHTML = `<div class="card"><h2>${e.title}</h2><img src="${e.screenshot}" alt="screenshot"/><p><strong>Summary:</strong><br>${e.summary.replace(/\n/g, '<br>')}</p><details><summary>Full Page Content (click to expand)</summary><pre>${e.content.replace(/</g,"<").replace(/>/g,">")}</pre></details><div id="chunks"><strong>Stored chunks:</strong><ul></ul></div><div id="qa"><h3>Ask a Question</h3><div class="qa"><input id="q" placeholder="Your question…" /><button id="ask">Ask</button></div><div id="answer"></div><div id="used"><strong>Context Used:</strong><ul></ul></div></div><div class="qa-history"><h3>Previous Q&A</h3><div id="history-qas"></div></div></div>`;
  const ulChunks = detail.querySelector("#chunks ul");
  e.embeddings.forEach(c => {
    const li = document.createElement("li");
    li.textContent = `[${c.id}] ${c.text.slice(0,100)}…`;
    ulChunks.appendChild(li);
  });
  const historyDiv = detail.querySelector("#history-qas");
  if (e.qas && e.qas.length) { e.qas.forEach(({ question, answer }) => { const d = document.createElement("div"); d.innerHTML = `<strong>Q:</strong> ${question}<br><strong>A:</strong> ${answer}`; historyDiv.appendChild(d); }); } else { historyDiv.innerHTML = `<p style="color:#666;">No previous Q&A.</p>`; }
  detail.querySelector("#ask").onclick = async () => {
    const q = detail.querySelector("#q").value.trim();
    const ansEl = detail.querySelector("#answer");
    const usedEl = detail.querySelector("#used ul");
    if (!q) return;
    ansEl.textContent = "Loading…";
    usedEl.innerHTML = "";
    try {
      const qEmb = await embedText(q);
      
      // USE THE NEW MMR RETRIEVAL STRATEGY
      const topChunks = retrieveWithMMR(qEmb, e.embeddings, 3, 0.7); // lambda=0.7 biases towards relevance
      
      topChunks.forEach(c => {
        const li = document.createElement("li");
        li.textContent = `[${c.id}] ${c.text}`;
        usedEl.appendChild(li);
      });
      const answer = await askQuestion(e.summary, topChunks, q);
      ansEl.textContent = answer;
      e.qas = e.qas || [];
      e.qas.push({ question: q, answer });
      await chrome.storage.local.set({ history });
      const d = document.createElement("div");
      d.innerHTML = `<strong>Q:</strong> ${q}<br><strong>A:</strong> ${answer}`;
      if (historyDiv.innerHTML.includes("No previous Q&A")) { historyDiv.innerHTML = ""; }
      historyDiv.appendChild(d);
    } catch (err) {
      console.error(err);
      ansEl.textContent = err.message;
    }
  };
}

// ─── Bootstrapping ─────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  loadHistory();
  document.getElementById("clear-history").onclick = async () => {
    if (!confirm("Delete all history?")) return;
    await chrome.storage.local.remove("history");
    loadHistory();
    document.getElementById("detail").innerHTML = `<p style="color:#666;">Select an entry…</p>`;
  };
});

