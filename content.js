/**
 * content.js — Phase 3
 *
 * Thêm so với Phase 2:
 *  - Xử lý message CAPTURE_STARTED → hiện badge "🎙 Capturing" trên overlay
 *  - Xử lý message CAPTURE_ERROR   → hiện thông báo lỗi ngắn trên overlay
 *
 * Tất cả module Phase 2 (VideoDetector, OverlayManager, SubtitleRenderer,
 * VideoLifecycle, MockDemo) giữ nguyên không đổi.
 */

(function () {
  if (window.__aiTranslatorInjected) return;
  window.__aiTranslatorInjected = true;

  console.log("[Content] AI Translator loaded on:", location.hostname);

  let state = {
    isActive:   false,
    sourceLang: "en",
    targetLang: "vi",
  };


  // ════════════════════════════════════════════════════════════════════════════
  // ① VideoDetector
  // ════════════════════════════════════════════════════════════════════════════
  const VideoDetector = (() => {
    let domObserver = null;
    let cbFound     = null;
    let cbLost      = null;

    function scoreVideo(v) {
      if (v.offsetWidth === 0 || v.offsetHeight === 0) return -1;
      let score = v.offsetWidth * v.offsetHeight;
      if (!v.paused)      score += 1_000_000;
      if (v.readyState >= 2) score += 100_000;
      return score;
    }

    function findBestVideo() {
      const all = Array.from(document.querySelectorAll("video"));
      const candidates = all
        .map((v)  => ({ v, s: scoreVideo(v) }))
        .filter((x) => x.s >= 0);
      if (!candidates.length) return null;
      candidates.sort((a, b) => b.s - a.s);
      return candidates[0].v;
    }

    function startObserving(foundCallback, lostCallback) {
      cbFound = foundCallback;
      cbLost  = lostCallback;
      const immediate = findBestVideo();
      if (immediate) {
        console.log("[VideoDetector] Video found immediately.");
        cbFound(immediate);
      }
      domObserver = new MutationObserver(() => {
        const video = findBestVideo();
        if (video && video !== OverlayManager.currentVideo()) {
          console.log("[VideoDetector] New video detected via MutationObserver.");
          cbFound(video);
        }
      });
      domObserver.observe(document.body, { childList: true, subtree: true });
    }

    function stopObserving() {
      if (domObserver) { domObserver.disconnect(); domObserver = null; }
    }

    return { startObserving, stopObserving, findBestVideo };
  })();


  // ════════════════════════════════════════════════════════════════════════════
  // ② OverlayManager
  // ════════════════════════════════════════════════════════════════════════════
  const OverlayManager = (() => {
    let overlayEl      = null;
    let _videoEl       = null;
    let resizeObserver = null;
    let rafId          = null;
    let lastRectKey    = "";

    function injectStyles() {
      if (document.getElementById("ai-translator-styles")) return;
      const style = document.createElement("style");
      style.id = "ai-translator-styles";
      style.textContent = `
        #ai-translator-overlay {
          position        : fixed;
          pointer-events  : none;
          z-index         : 2147483647;
          display         : flex;
          flex-direction  : column;
          align-items     : center;
          justify-content : flex-end;
          padding-bottom  : 7%;
          box-sizing      : border-box;
          transition      : opacity 0.25s ease;
        }
        #ai-translator-overlay.hidden { opacity: 0; }

        /* ── Phase 3: capture status badge ─────────────────────── */
        #ai-capture-badge {
          position        : absolute;
          top             : 12px;
          right           : 14px;
          display         : flex;
          align-items     : center;
          gap             : 6px;
          padding         : 4px 10px;
          border-radius   : 20px;
          background      : rgba(0,0,0,0.55);
          backdrop-filter : blur(4px);
          font-size       : 11px;
          font-weight     : 600;
          font-family     : -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
          color           : #fff;
          letter-spacing  : 0.3px;
          opacity         : 0;
          transition      : opacity 0.3s ease;
          pointer-events  : none;
        }
        #ai-capture-badge.visible { opacity: 1; }
        #ai-capture-badge.error   { color: #ff6b6b; }

        .capture-dot {
          width        : 7px;
          height       : 7px;
          border-radius: 50%;
          background   : #3ecf5a;
          flex-shrink  : 0;
        }
        #ai-capture-badge.error .capture-dot { background: #ff6b6b; animation: none; }
        .capture-dot { animation: capturePulse 1.2s ease-in-out infinite; }
        @keyframes capturePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(0.8); }
        }

        .ai-sub-translated {
          display       : inline-block;
          max-width     : 90%;
          text-align    : center;
          font-size     : clamp(14px, 2.4vw, 30px);
          font-weight   : 700;
          font-family   : -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
          color         : #ffffff;
          line-height   : 1.45;
          letter-spacing: 0.01em;
          margin-bottom : 5px;
          text-shadow   : 0 0 4px #000, 1px 1px 3px #000, -1px -1px 3px #000,
                          1px -1px 3px #000, -1px 1px 3px #000, 0 3px 8px rgba(0,0,0,0.85);
          opacity   : 0;
          transform : translateY(8px);
          transition: opacity 0.2s ease, transform 0.2s ease;
        }
        .ai-sub-original {
          display       : inline-block;
          max-width     : 86%;
          text-align    : center;
          font-size     : clamp(11px, 1.6vw, 20px);
          font-weight   : 400;
          font-family   : -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
          color         : rgba(255,255,255,0.70);
          line-height   : 1.35;
          text-shadow   : 0 0 3px #000, 1px 1px 2px #000, -1px -1px 2px #000;
          opacity   : 0;
          transform : translateY(5px);
          transition: opacity 0.2s ease, transform 0.2s ease;
        }
        .ai-sub-translated.visible,
        .ai-sub-original.visible {
          opacity  : 1;
          transform: translateY(0);
        }
      `;
      document.head.appendChild(style);
    }

    function syncPosition() {
      if (!overlayEl || !_videoEl) return;
      const r = _videoEl.getBoundingClientRect();
      overlayEl.style.top    = `${r.top}px`;
      overlayEl.style.left   = `${r.left}px`;
      overlayEl.style.width  = `${r.width}px`;
      overlayEl.style.height = `${r.height}px`;
    }

    function startPositionSync() {
      resizeObserver = new ResizeObserver(syncPosition);
      resizeObserver.observe(_videoEl);
      window.addEventListener("scroll", syncPosition, { passive: true });
      window.addEventListener("resize", syncPosition, { passive: true });
      function rafLoop() {
        if (!_videoEl) return;
        const r = _videoEl.getBoundingClientRect();
        const key = `${r.top.toFixed(1)},${r.left.toFixed(1)},${r.width.toFixed(1)},${r.height.toFixed(1)}`;
        if (key !== lastRectKey) { lastRectKey = key; syncPosition(); }
        rafId = requestAnimationFrame(rafLoop);
      }
      rafId = requestAnimationFrame(rafLoop);
    }

    function stopPositionSync() {
      if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
      if (rafId)          { cancelAnimationFrame(rafId); rafId = null; }
      window.removeEventListener("scroll", syncPosition);
      window.removeEventListener("resize", syncPosition);
      lastRectKey = "";
    }

    function createOverlay(video) {
      if (overlayEl) removeOverlay();
      _videoEl = video;
      injectStyles();
      overlayEl = document.createElement("div");
      overlayEl.id = "ai-translator-overlay";
      overlayEl.innerHTML = `
        <div id="ai-capture-badge">
          <span class="capture-dot"></span>
          <span id="ai-capture-label">Connecting…</span>
        </div>
        <span class="ai-sub-translated" id="ai-sub-translated"></span>
        <span class="ai-sub-original"   id="ai-sub-original"></span>
      `;
      document.body.appendChild(overlayEl);
      syncPosition();
      startPositionSync();
      console.log("[OverlayManager] Overlay created.");
    }

    function removeOverlay() {
      stopPositionSync();
      if (overlayEl) { overlayEl.remove(); overlayEl = null; }
      _videoEl = null;
    }

    function show()  { overlayEl?.classList.remove("hidden"); }
    function hide()  { overlayEl?.classList.add("hidden");    }

    // ── Phase 3: badge helpers ─────────────────────────────────────────
    function showCaptureBadge(label, isError = false) {
      const badge = document.getElementById("ai-capture-badge");
      const lEl   = document.getElementById("ai-capture-label");
      if (!badge || !lEl) return;
      lEl.textContent = label;
      badge.classList.toggle("error", isError);
      badge.classList.add("visible");
    }

    function hideCaptureBadge() {
      document.getElementById("ai-capture-badge")?.classList.remove("visible");
    }

    function currentVideo() { return _videoEl; }
    function isReady()      { return !!overlayEl; }

    return {
      createOverlay, removeOverlay, show, hide,
      showCaptureBadge, hideCaptureBadge,
      currentVideo, isReady,
    };
  })();


  // ════════════════════════════════════════════════════════════════════════════
  // ③ SubtitleRenderer
  // ════════════════════════════════════════════════════════════════════════════
  const SubtitleRenderer = (() => {
    let clearTimer = null;
    function show({ translated = "", original = "", duration = 0 }) {
      const tEl = document.getElementById("ai-sub-translated");
      const oEl = document.getElementById("ai-sub-original");
      if (!tEl || !oEl) return;
      tEl.textContent = translated;
      oEl.textContent = original;
      void tEl.offsetWidth;
      tEl.classList.add("visible");
      oEl.classList.add("visible");
      if (clearTimer) clearTimeout(clearTimer);
      if (duration > 0) clearTimer = setTimeout(clear, duration);
    }
    function clear() {
      document.getElementById("ai-sub-translated")?.classList.remove("visible");
      document.getElementById("ai-sub-original")?.classList.remove("visible");
      if (clearTimer) { clearTimeout(clearTimer); clearTimer = null; }
    }
    return { show, clear };
  })();


  // ════════════════════════════════════════════════════════════════════════════
  // ④ VideoLifecycle
  // ════════════════════════════════════════════════════════════════════════════
  const VideoLifecycle = (() => {
    let _video = null;
    function onPlay()       { OverlayManager.show(); }
    function onPause()      { OverlayManager.hide(); SubtitleRenderer.clear(); }
    function onSeeking()    { SubtitleRenderer.clear(); }
    function onEnded()      { SubtitleRenderer.clear(); OverlayManager.hide(); }
    function onRateChange() { console.log("[VideoLifecycle] ratechange →", _video?.playbackRate); }

    function attach(video) {
      detach();
      _video = video;
      video.addEventListener("play",       onPlay);
      video.addEventListener("pause",      onPause);
      video.addEventListener("seeking",    onSeeking);
      video.addEventListener("ended",      onEnded);
      video.addEventListener("ratechange", onRateChange);
    }
    function detach() {
      if (!_video) return;
      _video.removeEventListener("play",       onPlay);
      _video.removeEventListener("pause",      onPause);
      _video.removeEventListener("seeking",    onSeeking);
      _video.removeEventListener("ended",      onEnded);
      _video.removeEventListener("ratechange", onRateChange);
      _video = null;
    }
    return { attach, detach };
  })();


  // ════════════════════════════════════════════════════════════════════════════
  // ⑤ MockDemo (giữ nguyên từ Phase 2 — Phase 4 sẽ xoá)
  // ════════════════════════════════════════════════════════════════════════════
  const MOCK_SUBTITLES = [
    { translated: "Chào mừng đến với AI Realtime Translator! 🎉", original: "Welcome to AI Realtime Translator! 🎉", delay: 1000, duration: 3500 },
    { translated: "🎙 Audio đang được capture từ tab này...",      original: "🎙 Audio is being captured from this tab...", delay: 5000, duration: 3200 },
    { translated: "Mỗi 2 giây một chunk được gửi tới background.", original: "Every 2s a chunk is sent to the background.", delay: 9000, duration: 3500 },
    { translated: "Kiểm tra console background để xem waveform.",  original: "Check the background console to see waveform.", delay: 13500, duration: 4000 },
    { translated: "Phase 3 hoàn thành ✅ — tiếp theo: ASR Server.", original: "Phase 3 complete ✅ — next: ASR Server.", delay: 18500, duration: 4500 },
  ];
  let mockTimers = [];
  function runMockDemo() {
    clearMockDemo();
    MOCK_SUBTITLES.forEach(({ translated, original, delay, duration }) => {
      mockTimers.push(setTimeout(() => SubtitleRenderer.show({ translated, original, duration }), delay));
    });
  }
  function clearMockDemo() {
    mockTimers.forEach(clearTimeout);
    mockTimers = [];
    SubtitleRenderer.clear();
  }


  // ════════════════════════════════════════════════════════════════════════════
  // Core handlers
  // ════════════════════════════════════════════════════════════════════════════
  function onStart() {
    console.log(`[Content] ▶ Translation started | ${state.sourceLang} → ${state.targetLang}`);
    VideoDetector.startObserving(
      (video) => {
        OverlayManager.createOverlay(video);
        VideoLifecycle.attach(video);
        if (!video.paused) OverlayManager.show(); else OverlayManager.hide();

        // Hiện badge "Connecting" trong lúc chờ tabCapture
        OverlayManager.showCaptureBadge("🎙 Connecting…");

        runMockDemo();

        chrome.runtime.sendMessage({
          type:    "VIDEO_FOUND",
          payload: {
            src:    video.src || video.currentSrc || "(blob/stream)",
            width:  video.videoWidth,
            height: video.videoHeight,
          },
        });
      },
      () => {
        VideoLifecycle.detach();
        OverlayManager.removeOverlay();
        clearMockDemo();
      }
    );
  }

  function onStop() {
    console.log("[Content] ⏹ Translation stopped.");
    VideoDetector.stopObserving();
    VideoLifecycle.detach();
    OverlayManager.removeOverlay();
    clearMockDemo();
  }


  // ════════════════════════════════════════════════════════════════════════════
  // Message listener
  // ════════════════════════════════════════════════════════════════════════════
  chrome.runtime.sendMessage({ type: "CONTENT_READY" }, (response) => {
    if (chrome.runtime.lastError) {
      console.warn("[Content] Background not ready:", chrome.runtime.lastError.message);
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    console.log("[Content] Message:", message.type);

    switch (message.type) {

      case "START_TRANSLATION":
        state.isActive = true;
        if (message.payload) {
          state.sourceLang = message.payload.sourceLang ?? state.sourceLang;
          state.targetLang = message.payload.targetLang ?? state.targetLang;
        }
        onStart();
        break;

      case "STOP_TRANSLATION":
        state.isActive = false;
        onStop();
        break;

      case "SETTINGS_UPDATED":
        Object.assign(state, message.payload);
        break;

      case "STATE_SYNC":
        Object.assign(state, message.payload);
        if (state.isActive) onStart();
        break;

      // ── Phase 3: tabCapture xác nhận đã chạy ──────────────────────────
      case "CAPTURE_STARTED":
        console.log("[Content] ✅ Audio capture active.");
        OverlayManager.showCaptureBadge("🎙 Capturing");
        // Tự ẩn badge sau 4 giây
        setTimeout(() => OverlayManager.hideCaptureBadge(), 4000);
        break;

      // ── Phase 3: lỗi capture ──────────────────────────────────────────
      case "CAPTURE_ERROR": {
        const errMsg = message.payload?.message ?? "Capture failed";
        console.error("[Content] ❌ Capture error:", errMsg);
        OverlayManager.showCaptureBadge("❌ " + errMsg, true);
        setTimeout(() => OverlayManager.hideCaptureBadge(), 5000);
        break;
      }

      default:
        break;
    }
  });

})();