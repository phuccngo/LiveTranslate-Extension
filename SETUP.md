# Hướng dẫn Load Extension vào Chrome

## Cấu trúc Project

```
.
├── manifest.json
├── background.js
├── popup.html
├── popup.js
└── assets/
```

## Các bước load extension vào Chrome

### Bước 1: Mở trang quản lý Extension
1. Mở Chrome
2. Gõ URL: `chrome://extensions/`
3. Hoặc vào Menu > More Tools > Extensions

### Bước 2: Bật Developer Mode
- Ở góc trên bên phải, tìm toggle "Developer mode"
- Click để bật ON (màu xanh)

### Bước 3: Load Extension
1. Click nút "Load unpacked"
2. Chọn thư mục `/workspaces/LiveTranslate-Extension`
3. Click "Open"

### Bước 4: Xác nhận Extension hoạt động
- Icon extension xuất hiện trên thanh công cụ
- Click icon extension
- Click nút "Click me"
- Một alert sẽ hiện: "Hello from extension!"

## Cách Debug

### Debug Popup UI
1. Right-click vào popup
2. Chọn "Inspect"
3. Xem Console, Network, Sources

### Debug Service Worker (Background)
1. Mở `chrome://extensions/`
2. Tìm extension của bạn
3. Click vào "service worker"
4. Xem console của background.js

## Cách Reload Extension
1. Mở `chrome://extensions/`
2. Tìm extension
3. Click icon reload (mũi tên tròn)

## Cách Xóa Extension
1. Mở `chrome://extensions/`
2. Tìm extension
3. Click "Remove"

## Các Permissions trong Extension

- **storage**: Lưu dữ liệu (settings, tokens, language)
- **activeTab**: Truy cập tab hiện tại
- **scripting**: Inject script vào website

## Bước tiếp theo

Để phát triển thành AI Real-time Translation Extension, bạn cần thêm:

- **tabCapture**: Capture audio/video từ tab
- **offscreen**: Xử lý audio background
- WebSocket: Kết nối Local AI Runtime

Xem README.md để biết thêm chi tiết.
