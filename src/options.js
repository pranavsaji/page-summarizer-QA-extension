// src/options.js

// When the options page loads, populate the inputs with any saved keys.
document.addEventListener("DOMContentLoaded", async () => {
  const { groqKey = "", hfKey = "" } = await chrome.storage.local.get(["groqKey", "hfKey"]);
  document.getElementById("groqKey").value = groqKey;
  document.getElementById("hfKey").value   = hfKey;
});

// Save both keys when the user clicks “Save”
document.getElementById("save").addEventListener("click", async () => {
  const groqKey = document.getElementById("groqKey").value.trim();
  const hfKey   = document.getElementById("hfKey").value.trim();

  if (!groqKey) {
    alert("Please enter a valid Groq API key.");
    return;
  }
  if (!hfKey) {
    alert("Please enter a valid Huggingface API key.");
    return;
  }

  await chrome.storage.local.set({ groqKey, hfKey });
  alert("API keys saved!");
});
