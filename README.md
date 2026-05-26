# Hướng dẫn chi tiết: Tạo và đưa Chrome Extension lên Google Chrome

## Mục tiêu

Sau tài liệu này bạn sẽ:

* Hiểu cấu trúc cơ bản của Chrome Extension
* Tạo được extension đầu tiên
* Load extension vào Chrome để test
* Biết cách debug extension
* Hiểu các permission quan trọng
* Chuẩn bị nền tảng cho project AI realtime translation

---

# 1. Chrome Extension là gì?

Chrome Extension là một ứng dụng nhỏ chạy bên trong trình duyệt Google Chrome.

Extension có thể:

* Chỉnh sửa giao diện website
* Đọc nội dung trang
* Capture audio/video tab
* Gọi API
* Inject script vào trang web
* Thêm popup UI
* Tương tác với browser

Ví dụ:

* Grammarly
* Adblock
* Notion Web Clipper
* Google Translate
* AI Assistant Extensions

---

# 2. Kiến trúc cơ bản của Chrome Extension

Một extension thường gồm:

```text
my-extension/
│
├── manifest.json
├── background.js
├── popup.html
├── popup.js
├── content.js
└── assets/
```

## Thành phần

### manifest.json

File quan trọng nhất.

Dùng để:

* khai báo tên extension
* version
* permissions
* background script
* popup UI
* host permissions

Chrome sẽ đọc file này đầu tiên.

---

### background.js

Là "bộ não" của extension.

Dùng để:

* quản lý logic chính
* lắng nghe sự kiện
* gọi API
* websocket
* tab capture
* authentication

Trong Manifest V3:

```text
background.js = Service Worker
```

Service worker không chạy liên tục.
Chrome sẽ tự sleep/wakeup.

---

### popup.html

UI hiện khi user click icon extension.

Ví dụ:

* nút Start
* settings
* language selection
* login

---

### content.js

Script được inject vào website.

Ví dụ:

* đọc DOM
* detect video
* inject subtitle
* thay đổi giao diện

---

# 3. Tạo project đầu tiên

## Bước 1 — Tạo folder

```text
my-extension
```

---

## Bước 2 — Tạo manifest.json

```json
{
  "manifest_version": 3,
  "name": "My First Extension",
  "version": "1.0.0",
  "description": "My first chrome extension",

  "permissions": [
    "storage",
    "activeTab",
    "scripting"
  ],

  "background": {
    "service_worker": "background.js"
  },

  "action": {
    "default_popup": "popup.html"
  }
}
```

---

# 4. Tạo popup UI

## popup.html

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>My Extension</title>
</head>
<body>

  <h1>Hello Extension</h1>

  <button id="btn">
    Click me
  </button>

  <script src="popup.js"></script>

</body>
</html>
```

---

# 5. Thêm logic popup

## popup.js

```javascript
const btn = document.getElementById("btn");

btn.addEventListener("click", async () => {

  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  chrome.scripting.executeScript({
    target: {
      tabId: tab.id
    },
    func: () => {
      alert("Hello from extension!");
    }
  });

});
```

## Giải thích

### chrome.tabs.query()

Lấy tab hiện tại.

---

### chrome.scripting.executeScript()

Inject code vào trang hiện tại.

Ở đây extension sẽ hiện:

```text
Hello from extension!
```

---

# 6. Tạo background.js

```javascript
chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed");
});
```

## Giải thích

Event này chạy khi:

* extension được cài
* update extension
* reload extension

---

# 7. Load extension vào Chrome

## Mở trang extension

Mở:

```text
chrome://extensions
```

---

## Bật Developer Mode

Ở góc trên bên phải:

```text
Developer mode
```

Bật ON.

---

## Load extension

Click:

```text
Load unpacked
```

Sau đó chọn folder:

```text
my-extension
```

---

# 8. Test extension

Sau khi load:

* icon extension xuất hiện
* click icon
* popup mở
* click button
* alert xuất hiện trên website

Nếu alert hiện:

```text
Hello from extension!
```

=> extension hoạt động thành công.

---

# 9. Cách debug extension

## Debug popup

Right click popup:

```text
Inspect
```

Bạn sẽ thấy:

* Console
* Network
* Sources

Giống DevTools bình thường.

---

## Debug service worker

Mở:

```text
chrome://extensions
```

Tìm extension.

Click:

```text
service worker
```

Bạn sẽ thấy console của background.js.

---

# 10. Permissions quan trọng

Chrome Extension cần khai báo quyền.

Ví dụ:

```json
"permissions": [
  "storage",
  "activeTab",
  "scripting"
]
```

---

## storage

Cho phép lưu dữ liệu.

Ví dụ:

* settings
* token
* language

---

## activeTab

Cho phép truy cập tab hiện tại.

---

## scripting

Cho phép inject script vào website.

---

# 11. Host Permissions

Nếu muốn extension chạy trên YouTube:

```json
"host_permissions": [
  "https://*.youtube.com/*"
]
```

---

# 12. Permissions cho AI Translation Extension

Sau này project realtime translation của bạn sẽ cần:

```json
"permissions": [
  "storage",
  "activeTab",
  "scripting",
  "tabCapture",
  "offscreen"
]
```

---

## tabCapture

Cho phép capture audio/video của tab.

Dùng để:

* lấy audio YouTube
* stream audio realtime

---

## offscreen

Cho phép tạo offscreen document.

Dùng để:

* xử lý audio
* MediaRecorder
* Web Audio API
* streaming

---

# 13. Message Passing

Các thành phần extension giao tiếp bằng message.

Ví dụ:

```javascript
chrome.runtime.sendMessage({
  type: "HELLO"
});
```

---

## Receive message

```javascript
chrome.runtime.onMessage.addListener((msg) => {
  console.log(msg);
});
```

---

# 14. Kiến trúc project AI realtime translation

Bạn nên chia project thành:

```text
Chrome Extension
    ↓ websocket
Local AI Runtime
    ↓
ASR + Translate + TTS
```

---

# 15. Kiến trúc extension cho project của bạn

## Popup Layer

UI:

* Start
* Stop
* Language selection

---

## Background Layer

Quản lý:

* websocket
* tab capture
* state
* authentication

---

## Content Script Layer

Render:

* subtitle
* overlay UI
* translation

---

## Offscreen Layer

Xử lý:

* audio stream
* MediaRecorder
* audio chunking

---

# 16. APIs quan trọng cần học

## Chrome Extension APIs

* chrome.runtime
* chrome.tabs
* chrome.scripting
* chrome.storage
* chrome.tabCapture
* chrome.offscreen

---

# 17. Công nghệ khuyên dùng

## Frontend

* React
* Vite
* Tailwind

---

## Local AI Runtime

Prototype:

* Python
* FastAPI
* websockets

Production:

* Rust

---

## AI Models

### Speech-to-text

* faster-whisper

### Translation

* NLLB

### TTS

* Piper

---

# 18. Flow hoạt động hoàn chỉnh sau này

```text
YouTube Video
    ↓
Chrome tabCapture
    ↓
Audio chunks
    ↓ websocket localhost
Local AI Runtime
    ↓
Speech-to-text
    ↓
Translation
    ↓
TTS
    ↓
Translated audio
    ↓
Extension playback
```

---

# 19. Cách publish lên Chrome Web Store

## Bước 1

Đăng ký developer account.

Phí:

```text
$5 one-time
```

---

## Bước 2

Build extension.

Ví dụ:

```text
dist/
```

Zip toàn bộ folder.

---

## Bước 3

Upload lên Chrome Web Store.

---

## Bước 4

Điền:

* screenshots
* description
* icons
* privacy policy

---

## Bước 5

Google review.

Thông thường:

```text
1–3 ngày
```

AI/audio extension có thể lâu hơn.

---

# 20. Lưu ý cực kỳ quan trọng

Nếu extension của bạn:

* capture audio
* dùng microphone
* inject YouTube
* AI processing

thì bạn PHẢI:

* có privacy policy
* giải thích data usage
* xin consent rõ ràng

Nếu không Chrome rất dễ reject.

---

# 21. Roadmap khuyên dùng

## Phase 1

Làm extension cơ bản:

* popup
* inject script
* detect video

---

## Phase 2

Thêm:

* tabCapture
* websocket localhost

---

## Phase 3

Thêm realtime subtitle.

---

## Phase 4

Thêm AI dubbing.

---

# 22. Best Practices

## Không để toàn bộ logic trong popup

Popup có thể bị destroy bất cứ lúc nào.

Logic chính nên ở:

```text
background/service worker
```

---

## Không xử lý AI nặng trong browser

Browser sandbox:

* giới hạn RAM
* CPU throttling
* không tối ưu GPU

AI nên chạy local runtime.

---

## Tách rõ module

```text
extension/
runtime/
models/
shared/
```

---

# 23. Kết luận

Sau tài liệu này bạn đã có:

* nền tảng Chrome Extension
* hiểu kiến trúc MV3
* biết load extension
* biết inject script
* biết background/service worker
* chuẩn bị cho AI realtime translation extension

Bước tiếp theo nên làm:

1. Detect video YouTube
2. Capture audio tab
3. Stream websocket localhost
4. Hiển thị subtitle realtime
5. Thêm AI translation
