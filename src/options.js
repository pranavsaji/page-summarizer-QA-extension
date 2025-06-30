// src/options.js

// Populate the input with any saved key when the options page loads
document.addEventListener("DOMContentLoaded", async () => {
  const { groqKey } = await chrome.storage.local.get("groqKey");
  if (groqKey) {
    document.getElementById("key").value = groqKey;
  }
});

// Save the key when the user clicks “Save”
document.getElementById("save").addEventListener("click", () => {
  const key = document.getElementById("key").value.trim();
  if (!key) {
    alert("Please enter a valid Groq API key.");
    return;
  }
  chrome.storage.local.set({ groqKey: key }, () => {
    alert("Groq API key saved!");
  });
});
