/**
 * background.js (Service Worker) — Phase 3
 *
 * Thêm so với Phase 2:
 *  ① AudioCaptureManager — quản lý vòng đời tabCapture + offscreen document
 *  ② Xử lý message AUDIO_CHUNK / CAPTURE_STARTED / CAPTURE_STOPPED / CAPTURE_ERROR
 *     từ offscreen.js (hiện tại chỉ log; Phase 4 sẽ forward qua WebSocket)
 *  ③ startCapture() được gọi ngay sau VIDEO_FOUND (không delay async)
 */

// ── Default settings ──────────────────────────────────────────────────────────
const DEFAULT_STATE = {
  isActive:    false,
  sourceLang:  "en",
  targetLang:  "vi",
  activeTabId: null,
};

// ── On install: seed storage ──────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set(DEFAULT_STATE, () => {
    console.log("[Background] Extension installed. Default state set.");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// ① AudioCaptureManager
//    Đóng gói toàn bộ logic tabCapture + offscreen document.
//    Lý do tách module: tabCapture.capture() PHẢI được gọi đồng bộ (sync)
//    ngay trong event handler — không được để bất kỳ await nào trước nó.
// ══════════════════════════════════════════════════════════════════════════════
const AudioCaptureManager = (() => {

  const OFFSCREEN_URL = chrome.runtime.getURL("offscreen.html");
  let   _capturing    = false;

  // ── Tạo offscreen document nếu chưa có ────────────────────────────────
  async function ensureOffscreen() {
    // chrome.offscreen.hasDocument() trả về boolean
    const exists = await chrome.offscreen.hasDocument();
    if (!exists) {
      await chrome.offscreen.createDocument({
        url:      OFFSCREEN_URL,
        reasons:  [chrome.offscreen.Reason.USER_MEDIA],
        justification: "Process tab audio stream with MediaRecorder for ASR",
      });
      console.log("[AudioCapture] Offscreen document created.");
    }
  }

  // ── Đóng offscreen document ────────────────────────────────────────────
  async function closeOffscreen() {
    const exists = await chrome.offscreen.hasDocument();
    if (exists) {
      await chrome.offscreen.closeDocument();
      console.log("[AudioCapture] Offscreen document closed.");
    }
  }

  /**
   * Bắt đầu capture audio của tab hiện tại.
   *
   * ⚠️  QUAN TRỌNG: chrome.tabCapture.capture() phải được gọi ĐỒNG BỘ
   * trong message event handler (không await trước). Nếu không Chrome sẽ
   * throw "getUserMedia is not allowed from this context."
   *
   * Giải pháp: tabCapture.capture() gọi sync, xử lý stream trong callback.
   */
  /**
   * Dùng getMediaStreamId() thay vì capture() vì:
   *  1. Không yêu cầu sync call trong message handler — hoạt động đúng khi
   *     được gọi từ bên trong chrome.storage.local.get() callback.
   *  2. Trả về stream ID (string) qua Promise — offscreen tự reconstruct
   *     MediaStream bằng getUserMedia({ chromeMediaSourceId: streamId }).
   *  3. Ổn định hơn trong MV3 Service Worker sau khi wake up từ sleep.
   */
  async function start(tabId) {
    if (_capturing) {
      console.warn("[AudioCapture] Already capturing.");
      return;
    }

    if (!chrome?.tabCapture?.getMediaStreamId) {
      const msg = "tabCapture.getMediaStreamId() không khả dụng. Kiểm tra manifest permissions.";
      console.error("[AudioCapture]", msg);
      if (tabId) sendToContentScript(tabId, { type: "CAPTURE_ERROR", payload: { message: msg } });
      return;
    }

    console.log("[AudioCapture] Requesting stream ID for tab:", tabId);

    try {
      // getMediaStreamId() là async-safe — không cần sync call
      const streamId = await chrome.tabCapture.getMediaStreamId({
        targetTabId: tabId,
      });

      console.log("[AudioCapture] Got streamId:", streamId?.slice(0, 20) + "…");

      // Đảm bảo offscreen document đang chạy trước khi gửi streamId
      await ensureOffscreen();

      // Gửi streamId sang offscreen để reconstruct MediaStream
      await chrome.runtime.sendMessage({
        type:     "START_CAPTURE",
        streamId: streamId,
      });

      _capturing = true;

    } catch (err) {
      console.error("[AudioCapture] start() failed:", err.message);
      if (tabId) {
        sendToContentScript(tabId, {
          type:    "CAPTURE_ERROR",
          payload: { message: err.message },
        });
      }
    }
  }

  // ── Dừng capture ───────────────────────────────────────────────────────
  async function stop() {
    if (!_capturing) return;
    _capturing = false;

    try {
      await chrome.runtime.sendMessage({ type: "STOP_CAPTURE" });
    } catch (_) {
      // Offscreen có thể đã bị kill
    }

    await closeOffscreen();
    console.log("[AudioCapture] Stopped.");
  }

  function isCapturing() { return _capturing; }

  // Đặt _capturing = false từ bên ngoài (khi offscreen báo lỗi)
  function markStopped() { _capturing = false; }

  return { start, stop, isCapturing, markStopped };
})();


// ══════════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════════
async function sendToContentScript(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch (err) {
    console.warn("[Background] Could not reach content script:", err.message);
  }
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}


// ══════════════════════════════════════════════════════════════════════════════
// Message listener
// ══════════════════════════════════════════════════════════════════════════════
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[Background] Message:", message.type);

  switch (message.type) {

    // ── Popup toggled ON ─────────────────────────────────────────────────
    case "START_TRANSLATION": {
      getActiveTab().then((tab) => {
        if (!tab) return;
        chrome.storage.local.set({ isActive: true, activeTabId: tab.id });
        sendToContentScript(tab.id, {
          type:    "START_TRANSLATION",
          payload: message.payload,
        });
      });
      sendResponse({ ok: true });
      break;
    }

    // ── Popup toggled OFF ────────────────────────────────────────────────
    case "STOP_TRANSLATION": {
      chrome.storage.local.set({ isActive: false, activeTabId: null });

      // Dừng audio capture
      AudioCaptureManager.stop();

      getActiveTab().then((tab) => {
        if (!tab) return;
        sendToContentScript(tab.id, { type: "STOP_TRANSLATION" });
      });
      sendResponse({ ok: true });
      break;
    }

    // ── Settings changed ─────────────────────────────────────────────────
    case "SETTINGS_UPDATED": {
      getActiveTab().then((tab) => {
        if (!tab) return;
        sendToContentScript(tab.id, {
          type:    "SETTINGS_UPDATED",
          payload: message.payload,
        });
      });
      sendResponse({ ok: true });
      break;
    }

    // ── Content script alive — push current state ────────────────────────
    case "CONTENT_READY": {
      chrome.storage.local.get(DEFAULT_STATE, (state) => {
        if (!sender.tab) return;
        sendToContentScript(sender.tab.id, {
          type:    "STATE_SYNC",
          payload: state,
        });
      });
      sendResponse({ ok: true });
      break;
    }

    // ── Content script found a <video> → bắt đầu capture ────────────────
    case "VIDEO_FOUND": {
      const { src, width, height } = message.payload ?? {};
      console.log(
        `[Background] Video on tab ${sender.tab?.id}: ${width}×${height}`,
        src?.slice(0, 80)
      );
      chrome.storage.local.set({ activeTabId: sender.tab?.id });

      // Bắt đầu capture ngay khi video được phát hiện
      // (chỉ nếu extension đang active)
      chrome.storage.local.get(["isActive"], ({ isActive }) => {
        if (isActive && !AudioCaptureManager.isCapturing()) {
          AudioCaptureManager.start(sender.tab?.id);
        }
      });

      sendResponse({ ok: true });
      break;
    }

    // ── Từ offscreen: mỗi audio chunk 2 giây ────────────────────────────
    case "AUDIO_CHUNK": {
      const { rms, timestamp, chunkIndex, buffer } = message.payload ?? {};

      // ── Log waveform để verify audio thực ─────────────────────────────
      const isSilence = rms < 0.001;
      console.log(
        `[Background] 🎵 Chunk #${chunkIndex}` +
        ` | size: ${buffer?.byteLength ?? 0}B` +
        ` | rms: ${rms?.toFixed(4)}` +
        ` | ${isSilence ? "🔇 silence" : "🔊 audio"}` +
        ` | t=${new Date(timestamp).toISOString()}`
      );

      // Phase 4: forward buffer qua WebSocket tới ASR server
      // wsClient.send(buffer);

      sendResponse({ ok: true });
      break;
    }

    // ── Từ offscreen: capture đã bắt đầu ────────────────────────────────
    case "CAPTURE_STARTED": {
      console.log("[Background] ✅ Audio capture confirmed by offscreen.");

      // Thông báo content script để hiện trạng thái trên overlay
      chrome.storage.local.get(["activeTabId"], ({ activeTabId }) => {
        if (activeTabId) {
          sendToContentScript(activeTabId, { type: "CAPTURE_STARTED" });
        }
      });
      sendResponse({ ok: true });
      break;
    }

    // ── Từ offscreen: capture đã dừng ────────────────────────────────────
    case "CAPTURE_STOPPED": {
      console.log("[Background] ⏹ Audio capture stopped by offscreen.");
      AudioCaptureManager.markStopped();
      sendResponse({ ok: true });
      break;
    }

    // ── Từ offscreen hoặc tabCapture: lỗi ───────────────────────────────
    case "CAPTURE_ERROR": {
      const msg = message.payload?.message ?? "Unknown capture error";
      console.error("[Background] ❌ Capture error:", msg);
      AudioCaptureManager.markStopped();

      // Thông báo lên content script để hiện lỗi trên overlay
      chrome.storage.local.get(["activeTabId"], ({ activeTabId }) => {
        if (activeTabId) {
          sendToContentScript(activeTabId, {
            type:    "CAPTURE_ERROR",
            payload: { message: msg },
          });
        }
      });
      sendResponse({ ok: true });
      break;
    }

    default:
      console.warn("[Background] Unknown message type:", message.type);
  }

  return true; // giữ channel mở cho async sendResponse
});


// ── Tab closed: auto-stop ─────────────────────────────────────────────────────
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.get(["isActive", "activeTabId"], ({ isActive, activeTabId }) => {
    if (isActive && (activeTabId === tabId || activeTabId === null)) {
      chrome.storage.local.set({ isActive: false, activeTabId: null });
      AudioCaptureManager.stop();
      console.log(`[Background] Tab ${tabId} closed — capture stopped.`);
    }
  });
});