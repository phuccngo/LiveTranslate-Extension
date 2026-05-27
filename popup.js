/**
 * popup.js — Phase 1
 * Responsibilities:
 *  - Load saved state & settings from chrome.storage
 *  - Render UI based on current state (active / stopped)
 *  - On toggle: send START / STOP message to background
 *  - On language change: save to storage + notify background
 */

// ── DOM refs ──────────────────────────────────────────────
const btnToggle    = document.getElementById("btnToggle");
const sourceLang   = document.getElementById("sourceLang");
const targetLang   = document.getElementById("targetLang");
const statusBadge  = document.getElementById("statusBadge");
const statusText   = document.getElementById("statusText");
const infoText     = document.getElementById("infoText");

// ── Helpers ───────────────────────────────────────────────

/**
 * Render the entire UI to match a given state snapshot.
 * @param {{ isActive: boolean, sourceLang: string, targetLang: string }} state
 */
function renderUI(state) {
  const { isActive } = state;

  // Sync language dropdowns
  sourceLang.value = state.sourceLang || "en";
  targetLang.value = state.targetLang || "vi";

  // Toggle button appearance
  if (isActive) {
    btnToggle.textContent = "⏹ Stop Translation";
    btnToggle.className = "btn-main stop";
    statusBadge.className = "status-badge active";
    statusText.textContent = "Active";
    infoText.textContent = "Translating… click Stop to pause.";
  } else {
    btnToggle.textContent = "▶ Start Translation";
    btnToggle.className = "btn-main start";
    statusBadge.className = "status-badge";
    statusText.textContent = "Stopped";
    infoText.textContent = "Open a video tab, then press Start.";
  }
}

/**
 * Persist settings to chrome.storage.local and notify background.
 * @param {Partial<{ isActive, sourceLang, targetLang }>} patch
 */
async function saveAndBroadcast(patch) {
  // Merge patch into storage
  await chrome.storage.local.set(patch);

  // Notify background service worker
  chrome.runtime.sendMessage({
    type: "SETTINGS_UPDATED",
    payload: patch
  });
}

// ── Boot: load saved state ────────────────────────────────
chrome.storage.local.get(
  { isActive: false, sourceLang: "en", targetLang: "vi" },
  (savedState) => {
    renderUI(savedState);
  }
);

// ── Toggle Start / Stop ───────────────────────────────────
btnToggle.addEventListener("click", async () => {
  // Read current state from storage so we always toggle the true value
  const stored = await chrome.storage.local.get({ isActive: false });
  const nextActive = !stored.isActive;

  await saveAndBroadcast({ isActive: nextActive });

  renderUI({
    isActive: nextActive,
    sourceLang: sourceLang.value,
    targetLang: targetLang.value
  });

  // Tell background to START or STOP
  chrome.runtime.sendMessage({
    type: nextActive ? "START_TRANSLATION" : "STOP_TRANSLATION",
    payload: {
      sourceLang: sourceLang.value,
      targetLang: targetLang.value
    }
  });
});

// ── Language changes ──────────────────────────────────────
sourceLang.addEventListener("change", () => {
  saveAndBroadcast({ sourceLang: sourceLang.value });
});

targetLang.addEventListener("change", () => {
  saveAndBroadcast({ targetLang: targetLang.value });
});

// ── Listen for state updates pushed from background ───────
// (e.g. background auto-stops when tab closes)
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "STATE_SYNC") {
    renderUI(message.payload);
  }
});