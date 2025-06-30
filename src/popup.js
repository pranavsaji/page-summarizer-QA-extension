// src/popup.js
console.log("[popup] loaded");

document.getElementById("summarize")?.addEventListener("click", () => {
  console.log("[popup] Summarize clicked");
  chrome.runtime.sendMessage({ type: "SUMMARIZE_PAGE" }, () => {
    if (chrome.runtime.lastError) {
      console.warn("[popup] sendMessage error:", chrome.runtime.lastError.message);
    } else {
      console.log("[popup] sendMessage success");
    }
  });
  window.close();
});

document.getElementById("open-dashboard")?.addEventListener("click", async () => {
  console.log("[popup] Open Dashboard clicked");
  const url = chrome.runtime.getURL("src/dashboard.html");
  await chrome.tabs.create({ url });
  window.close();
});

// no-op listener to absorb NEW_SUMMARY broadcasts
chrome.runtime.onMessage.addListener((msg) => {
  console.log("[popup] onMessage:", msg);
});
