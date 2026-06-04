/**
 * offscreen.js — Phase 3
 *
 * Chạy trong Offscreen Document (có DOM, có Web Audio API).
 * Nhận MediaStream ID từ background → record → chunk → gửi trả background.
 *
 * Message IN  (từ background):
 *   { type: "START_CAPTURE", streamId: string }
 *   { type: "STOP_CAPTURE" }
 *
 * Message OUT (gửi background):
 *   { type: "AUDIO_CHUNK",  payload: { buffer: ArrayBuffer, rms: number, timestamp: number } }
 *   { type: "CAPTURE_ERROR", payload: { message: string } }
 *   { type: "CAPTURE_STARTED" }
 *   { type: "CAPTURE_STOPPED" }
 */

// ── Constants ─────────────────────────────────────────────────────────────────
const CHUNK_INTERVAL_MS = 2000;   // cắt chunk mỗi 2 giây
const MIME_PRIORITY = [
  "audio/webm;codecs=opus",       // Chrome native — nhỏ gọn, Whisper decode được
  "audio/webm",
  "audio/ogg;codecs=opus",
];

// ── State ─────────────────────────────────────────────────────────────────────
let mediaRecorder  = null;
let audioStream    = null;
let audioContext   = null;
let analyserNode   = null;
let chunkCount     = 0;

// ── Helper: chọn MIME type được hỗ trợ ───────────────────────────────────────
function pickMimeType() {
  for (const mime of MIME_PRIORITY) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return ""; // fallback — trình duyệt tự chọn
}

// ── Helper: tính RMS amplitude từ AnalyserNode ────────────────────────────────
// Dùng để verify audio có data thực, không phải silence hoàn toàn.
function getRMS() {
  if (!analyserNode) return 0;
  const buf = new Float32Array(analyserNode.fftSize);
  analyserNode.getFloatTimeDomainData(buf);
  const sum = buf.reduce((acc, v) => acc + v * v, 0);
  return Math.sqrt(sum / buf.length);
}

// ── Helper: send message an toàn về background ───────────────────────────────
function toBackground(message) {
  chrome.runtime.sendMessage(message).catch(() => {
    // Background service worker có thể đang sleep — bỏ qua
  });
}

// ── Khởi động capture ─────────────────────────────────────────────────────────
async function startCapture(streamId) {
  try {
    // Reconstruct MediaStream từ stream ID (Chrome-only API)
    audioStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource:   "tab",
          chromeMediaSourceId: streamId,
        },
      },
      video: false,
    });

    // ── Gắn AnalyserNode để đo amplitude realtime ────────────────────────
    audioContext  = new AudioContext();
    const source  = audioContext.createMediaStreamSource(audioStream);
    analyserNode  = audioContext.createAnalyser();
    analyserNode.fftSize = 256;

    // Graph: source → analyser → destination (speaker)
    // Phải connect tới destination để user nghe được audio gốc.
    // tabCapture mute tab audio — nếu không route lại qua AudioContext
    // thì user sẽ mất tiếng hoàn toàn khi extension đang chạy.
    source.connect(analyserNode);
    analyserNode.connect(audioContext.destination);

    // ── Khởi tạo MediaRecorder ───────────────────────────────────────────
    const mimeType = pickMimeType();
    console.log("[Offscreen] Using MIME type:", mimeType || "(browser default)");

    mediaRecorder = new MediaRecorder(
      audioStream,
      mimeType ? { mimeType } : {}
    );

    mediaRecorder.ondataavailable = async (event) => {
      if (!event.data || event.data.size === 0) return;

      chunkCount++;
      const rms       = getRMS();
      const timestamp = Date.now();

      // Chuyển Blob → ArrayBuffer để truyền qua chrome.runtime.sendMessage
      const buffer = await event.data.arrayBuffer();

      console.log(
        `[Offscreen] Chunk #${chunkCount} | size: ${buffer.byteLength}B` +
        ` | rms: ${rms.toFixed(4)} | ${new Date(timestamp).toISOString()}`
      );

      // Gửi về background (Phase 4 sẽ forward sang WebSocket)
      toBackground({
        type:    "AUDIO_CHUNK",
        payload: { buffer, rms, timestamp, chunkIndex: chunkCount },
      });
    };

    mediaRecorder.onerror = (event) => {
      console.error("[Offscreen] MediaRecorder error:", event.error);
      toBackground({
        type:    "CAPTURE_ERROR",
        payload: { message: event.error?.message ?? "MediaRecorder error" },
      });
    };

    mediaRecorder.onstart = () => {
      console.log("[Offscreen] ▶ Capture started.");
      toBackground({ type: "CAPTURE_STARTED" });
    };

    mediaRecorder.onstop = () => {
      console.log("[Offscreen] ⏹ Capture stopped. Total chunks:", chunkCount);
      toBackground({ type: "CAPTURE_STOPPED" });
    };

    // Bắt đầu record — ondataavailable kích hoạt mỗi CHUNK_INTERVAL_MS
    mediaRecorder.start(CHUNK_INTERVAL_MS);

  } catch (err) {
    console.error("[Offscreen] startCapture failed:", err);
    toBackground({
      type:    "CAPTURE_ERROR",
      payload: { message: err.message },
    });
  }
}

// ── Khởi tạo recorder trực tiếp từ MediaStream (reserved for future use) ──────
// Hiện tại không được gọi. Khi Phase 5 cần inject TTS hoặc mix audio,
// background có thể truyền trực tiếp stream object qua chrome.tabCapture
// với cách khác (e.g. chrome.tabCapture.getMediaStreamId).
function startRecorderWithStream(stream) {
  try {
    audioStream = stream;

    audioContext  = new AudioContext();
    const source  = audioContext.createMediaStreamSource(audioStream);
    analyserNode  = audioContext.createAnalyser();
    analyserNode.fftSize = 256;
    source.connect(analyserNode);
    analyserNode.connect(audioContext.destination);

    const mimeType = pickMimeType();
    console.log("[Offscreen] Using MIME type:", mimeType || "(browser default)");

    mediaRecorder = new MediaRecorder(
      audioStream,
      mimeType ? { mimeType } : {}
    );

    mediaRecorder.ondataavailable = async (event) => {
      if (!event.data || event.data.size === 0) return;

      chunkCount++;
      const rms       = getRMS();
      const timestamp = Date.now();
      const buffer = await event.data.arrayBuffer();

      console.log(
        `[Offscreen] Chunk #${chunkCount} | size: ${buffer.byteLength}B` +
        ` | rms: ${rms.toFixed(4)} | ${new Date(timestamp).toISOString()}`
      );

      toBackground({
        type:    "AUDIO_CHUNK",
        payload: { buffer, rms, timestamp, chunkIndex: chunkCount },
      });
    };

    mediaRecorder.onerror = (event) => {
      console.error("[Offscreen] MediaRecorder error:", event.error);
      toBackground({
        type:    "CAPTURE_ERROR",
        payload: { message: event.error?.message ?? "MediaRecorder error" },
      });
    };

    mediaRecorder.onstart = () => {
      console.log("[Offscreen] ▶ Capture started (from tabCapture).");
      toBackground({ type: "CAPTURE_STARTED" });
    };

    mediaRecorder.onstop = () => {
      console.log("[Offscreen] ⏹ Capture stopped. Total chunks:", chunkCount);
      toBackground({ type: "CAPTURE_STOPPED" });
    };

    mediaRecorder.start(CHUNK_INTERVAL_MS);

  } catch (err) {
    console.error("[Offscreen] startRecorderWithStream failed:", err);
    toBackground({ type: "CAPTURE_ERROR", payload: { message: err.message } });
  }
}

// ── Dừng capture & dọn dẹp ───────────────────────────────────────────────────
function stopCapture() {
  // Dừng MediaRecorder (sẽ flush chunk cuối rồi fire onstop)
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
  mediaRecorder = null;

  // Dừng tất cả audio tracks — giải phóng capture
  if (audioStream) {
    audioStream.getTracks().forEach((t) => t.stop());
    audioStream = null;
  }

  // Đóng AudioContext
  if (audioContext && audioContext.state !== "closed") {
    audioContext.close();
  }
  audioContext  = null;
  analyserNode  = null;
  chunkCount    = 0;
}

// ── Message listener ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {

    // NOTE: START_TAB_CAPTURE is intentionally NOT handled here.
    // chrome.tabCapture API is only available in the Service Worker (background.js).
    // background.js calls tabCapture.capture(), gets the stream ID, then sends
    // START_CAPTURE (with streamId) to this offscreen document.

    case "START_CAPTURE":
      startCapture(message.streamId);
      sendResponse({ ok: true });
      break;

    case "STOP_CAPTURE":
      stopCapture();
      sendResponse({ ok: true });
      break;

    default:
      break;
  }
  return true; // giữ channel mở cho async
});

console.log("[Offscreen] Document ready — waiting for START_CAPTURE.");