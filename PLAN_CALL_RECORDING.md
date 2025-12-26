# Kế Hoạch: Thêm Chức Năng Ghi Transcript Cuộc Gọi Với System Audio

## Tổng Quan

Thêm tính năng ghi lại transcript của cuộc gọi trực tiếp, hỗ trợ capture cả microphone và system audio (cho Zoom/Teams/etc), lưu transcript vào file và database persistent.

**Yêu cầu từ người dùng:**
- ✅ Ghi âm kết hợp microphone + system audio
- ✅ Lưu transcript vào file riêng (txt/json/markdown)
- ✅ Lưu metadata vào persistent storage (electron-store)
- ✅ Chỉ lưu transcript text (KHÔNG lưu audio file)
- ✅ Sẵn sàng cấp quyền Screen Recording cho macOS
- ✅ Hiển thị danh sách recordings trong main window

---

## Kiến Trúc Kỹ Thuật

### 1. System Audio Capture Strategy

**Phương pháp:** Sử dụng Electron desktopCapturer API với ScreenCaptureKit (macOS 13.2+)

**Lý do chọn:**
- API native của Electron, không cần thư viện bên ngoài
- Hỗ trợ loopback audio trên macOS 13.2+
- Không cần kernel extension hay virtual audio device
- Bảo trì dễ dàng, tương thích tốt

**Quyền cần thiết:**
- Microphone permission (đã có)
- Screen Recording permission (cần thêm)

### 2. Chunking Strategy cho Cuộc Gọi Dài

**Vấn đề:** API Whisper hiện tại gửi toàn bộ audio một lần, tối ưu cho đoạn ngắn (<1 phút). Cuộc gọi dài cần xử lý khác.

**Giải pháp: Chunked Recording với Real-time Transcription**

#### Option 1: Tự động Chunk Mỗi 30 Giây (RECOMMENDED)

**Logic:**
```
[Recording Start]
    ↓
[MediaRecorder với timeslice: 30000ms]
    ↓
[ondataavailable event mỗi 30s]
    ↓
[Gửi chunk đến API transcribe ngay lập tức]
    ↓
[Hiển thị partial transcript trên UI]
    ↓
[Tiếp tục recording...]
    ↓
[Recording Stop]
    ↓
[Gửi chunk cuối cùng]
    ↓
[Merge tất cả partial transcripts]
    ↓
[Lưu full transcript vào file]
```

**Implementation Details:**
- MediaRecorder.start() với `timeslice: 30000` (30 giây)
- Mỗi 30s trigger `ondataavailable` event
- Gửi chunk audio đến `/backend-api/transcribe`
- Accumulate partial transcripts trong array
- UI hiển thị streaming text (append mỗi lần có kết quả mới)
- Khi stop, merge all chunks thành full transcript

**UI Behavior:**
```
Recording Overlay:
┌─────────────────────────────┐
│ 🔴 Recording (Mic + System) │
│ 01:23 / Live Transcript...  │
│                             │
│ "Hello this is a test call" │
│ "We are discussing the..."  │
│ [Updating in real-time]     │
└─────────────────────────────┘
```

**Advantages:**
- ✅ Real-time feedback cho user
- ✅ API xử lý chunks nhỏ nhanh hơn
- ✅ Không giới hạn độ dài cuộc gọi
- ✅ Có thể review transcript trong khi đang gọi

**Disadvantages:**
- ⚠️ Nhiều API calls hơn (1 call mỗi 30s)
- ⚠️ Cần handle merging chunks
- ⚠️ Có thể bị cut ở giữa câu

#### Option 2: Manual Chunk với Pause/Resume

**Logic:**
- User bấm record để start
- User bấm pause để tạm dừng → transcribe chunk hiện tại
- User bấm resume để tiếp tục
- User bấm stop để kết thúc

**Advantages:**
- User control khi nào transcribe
- Ít API calls hơn
- Có thể phân đoạn theo ý nghĩa (từng topic trong meeting)

**Disadvantages:**
- Không tự động
- Cần thêm UI controls (pause/resume buttons)
- User phải nhớ pause/resume

#### **DECISION: Sử dụng Option 1 (Auto-chunk 30s) vì:**
1. Fully automatic, không cần user interaction
2. Real-time feedback tốt hơn
3. Tương thích với use case cuộc gọi dài
4. API Whisper handle 30s audio rất nhanh (<2s)

### 3. Audio Mixing Architecture

```
[Microphone Stream]     getUserMedia()
        |
        v
[System Audio Stream]   desktopCapturer.getSources() với audio: 'loopback'
        |
        v
[Web Audio API Mixing]
  - AudioContext
  - MediaStreamAudioSourceNode (x2)
  - GainNode (volume control)
  - MediaStreamDestination
        |
        v
[MediaRecorder]
  - WebM/Opus codec
  - 128kbps bitrate
        |
        v
[Transcription]
  - ChatGPT Whisper API
  - Dictionary + LLM correction
        |
        v
[Storage]
  - File: markdown/json/txt
  - Database: electron-store
```

### 3. Data Schema

**RecordingMetadata Interface:**
```typescript
interface RecordingMetadata {
  id: string;                      // UUID
  timestamp: string;                // ISO 8601
  duration: number;                 // seconds
  title?: string;                   // user-editable
  transcriptPath: string;           // relative path to file
  format: 'txt' | 'json' | 'md';    // file format
  recordingMode: 'mic' | 'mic+system';
  wordCount?: number;
  fileSize: number;                 // bytes
}
```

**StoreSchema Extension:**
```typescript
interface StoreSchema {
  // ... existing fields
  recordings: RecordingMetadata[];
  recordingsSettings: {
    mode: 'mic' | 'mic+system';
    format: 'txt' | 'json' | 'md';
    autoSave: boolean;
  };
}
```

### 4. File Storage Structure

```
~/Library/Application Support/open-claude/
├── config.json                    # electron-store
├── logs/
└── recordings/                    # NEW
    ├── 2025-12/
    │   ├── 2025-12-26_14-30-45_abc123.md
    │   └── 2025-12-26_15-20-10_def456.json
    └── 2025-01/
        └── ...
```

**File Naming:** `YYYY-MM-DD_HH-MM-SS_{uuid}.{ext}`

---

## Implementation Plan

### Phase 1: Setup & Dependencies

**1.1 Thêm Dependencies**
- File: `package.json`
- Thêm: `@karaggeorge/mac-screen-capture-permissions`

**1.2 Update Permissions**
- File: `package.json` (build.mac.extendInfo)
- Thêm `NSScreenRecordingUsageDescription`

**1.3 Update Type Definitions**
- File: `src/types/index.ts`
- Thêm: `RecordingMetadata`, `RecordingSettings` interfaces
- Extend: `StoreSchema` với `recordings` và `recordingsSettings`

---

### Phase 2: Audio Capture & Mixing

**2.1 Create Audio Source Manager**
- **NEW FILE:** `src/audio/sources.ts`
- Functions:
  - `checkScreenRecordingPermission()` - kiểm tra/request permission
  - `getMicrophoneStream()` - existing mic capture
  - `getSystemAudioStream()` - desktopCapturer với audio loopback
  - `hasDualAudioSupport()` - detect macOS version >= 13.2

**2.2 Create Audio Mixer**
- **NEW FILE:** `src/audio/mixer.ts`
- Class: `AudioMixer`
  - `createMixedStream(micStream, systemStream)` - mix 2 streams
  - `setMicVolume(volume)` - control mic gain
  - `setSystemVolume(volume)` - control system audio gain
  - `stop()` - cleanup resources

**2.3 Update Recording Overlay**
- File: `static/recording-overlay.html`
- Changes:
  - Replace `getUserMedia()` với audio source manager
  - Thêm logic để detect recording mode từ settings
  - **Implement chunked recording:**
    - `mediaRecorder.start(30000)` - chunk mỗi 30s
    - Handle `ondataavailable` để process chunk
    - Gửi chunk qua IPC `transcribe-chunk` (non-blocking)
    - Accumulate partial transcripts
    - Show live transcript trên overlay
  - **Expand overlay size** để hiển thị live transcript:
    - Width: 400px (từ 200px)
    - Height: 200px (từ 80px)
    - Scrollable transcript area
  - Show recording duration timer (MM:SS)
  - Show indicator cho dual-source (mic+system) recording
  - Update UI để hiển thị "Recording (Mic + System)"

**2.4 Create Chunk Processor**
- **NEW FILE:** `src/transcription/chunker.ts`
- Class: `TranscriptionChunker`
  - `processChunk(audioData, chunkIndex)` - transcribe 1 chunk
  - `accumulateTranscript(partialText)` - merge chunks
  - `getFinalTranscript()` - get complete text
  - `getPartialTranscript()` - get current text (for live display)
  - `reset()` - clear state for new recording

---

### Phase 3: Storage Layer

**3.1 Create Storage Manager**
- **NEW FILE:** `src/storage/recordings.ts`
- Functions:
  - `saveTranscriptToFile(metadata, content, format)` - write to file system
  - `loadTranscript(id)` - read from file
  - `deleteTranscript(id)` - remove file
  - `ensureRecordingsDirectory()` - create dirs if needed
  - `getStorageStats()` - total size, count

**3.2 Create Database Manager**
- **NEW FILE:** `src/storage/database.ts`
- Functions:
  - `addRecording(metadata)` - save to electron-store
  - `getRecording(id)` - load metadata
  - `listRecordings(limit, offset)` - paginated list
  - `updateRecording(id, updates)` - edit title
  - `deleteRecording(id)` - remove metadata
  - `getRecordingsCount()` - total count

**3.3 Migration từ localStorage**
- **NEW FILE:** `src/storage/migration.ts`
- Function: `migrateTranscriptionHistory()`
  - Read từ localStorage 'transcriptionHistory'
  - Convert sang RecordingMetadata format
  - Save to files + electron-store
  - Clear localStorage sau khi migrate thành công
  - Run once on app startup (check flag in electron-store)

---

### Phase 4: Main Process Integration

**4.1 Update IPC Handler**
- File: `src/main.ts` (lines 782-905)
- Modify: `global-recording-complete` handler
  - **RENAME to:** `call-recording-complete` (để phân biệt với quick recording)
  - Accept parameters: `fullTranscript`, `recordingMode`, `duration`, `chunks`
  - Input đã là full merged transcript (không cần transcribe lại)
  - Save to file system
  - Save metadata to electron-store
  - **SKIP auto-paste** (vì transcript đã hiển thị trong overlay)
  - Send event to main window để update UI

**4.2 Add New IPC Handler: Chunked Transcription**
- File: `src/main.ts`
- **NEW HANDLER:** `transcribe-chunk`
  - Input: `audioData` (ArrayBuffer), `chunkIndex` (number)
  - Call existing `transcribeAudio()` function
  - Return: `{ text: string, chunkIndex: number }`
  - Non-blocking (fire and forget from overlay perspective)
  - Overlay listens for response via IPC event `chunk-transcribed`

**4.3 Add Recording Management Handlers**
- File: `src/main.ts`
- Add handlers:
  - `get-recordings-list` - lấy danh sách recordings
  - `get-recording-detail` - lấy chi tiết 1 recording
  - `update-recording-title` - sửa title
  - `delete-recording` - xóa recording
  - `get-recordings-stats` - statistics
  - `check-screen-recording-permission` - kiểm tra permission
  - `request-screen-recording-permission` - request permission

**4.4 Update Preload API**
- File: `src/preload.ts`
- Expose new IPC methods:
  ```typescript
  // Chunked transcription
  transcribeChunk: (audioData, chunkIndex) => ipcRenderer.invoke('transcribe-chunk', audioData, chunkIndex),
  callRecordingComplete: (fullTranscript, recordingMode, duration, chunks) =>
    ipcRenderer.invoke('call-recording-complete', fullTranscript, recordingMode, duration, chunks),
  onChunkTranscribed: (callback) => ipcRenderer.on('chunk-transcribed', callback),

  // Recording management
  getRecordingsList: () => ipcRenderer.invoke('get-recordings-list'),
  getRecordingDetail: (id) => ipcRenderer.invoke('get-recording-detail', id),
  updateRecordingTitle: (id, title) => ipcRenderer.invoke('update-recording-title', id, title),
  deleteRecording: (id) => ipcRenderer.invoke('delete-recording', id),

  // Permissions
  checkScreenRecordingPermission: () => ipcRenderer.invoke('check-screen-recording-permission'),
  requestScreenRecordingPermission: () => ipcRenderer.invoke('request-screen-recording-permission'),
  ```

**4.4 Run Migration on Startup**
- File: `src/main.ts`
- In `app.whenReady()`:
  - Call `migrateTranscriptionHistory()` if not migrated
  - Set flag in electron-store: `migrationCompleted: true`

---

### Phase 5: UI Implementation

**5.1 Create Recordings List UI**
- File: `src/renderer/main.ts`
- Add section in main window:
  - Replace existing transcription history section
  - Show list of recordings (10 most recent)
  - Display: date/time, title (editable), duration, mode badge
  - Actions: view full transcript, delete
  - "View All" button to show modal with full list

**5.2 Create Transcript Viewer Modal**
- File: `static/index.html`
- Add modal element với:
  - Header: title (editable), date, duration, mode
  - Body: full transcript text
  - Footer: close button, delete button

**5.3 Update Settings UI**
- File: `src/renderer/settings.ts`
- Add "Recording" section:
  - Recording Mode dropdown: "Microphone only" / "Microphone + System Audio"
  - Transcript Format dropdown: "Markdown" / "JSON" / "Plain Text"
  - Auto-save toggle (default: true)
  - Permission status indicator for Screen Recording
  - Button to request Screen Recording permission
  - Storage stats display (X recordings, Y MB used)

**5.4 Update Recording Overlay UI**
- File: `static/recording-overlay.html`
- Changes:
  - Show "Recording (Mic + System)" khi ở dual mode
  - Show "Recording" khi ở mic-only mode
  - Thêm icon hoặc badge để phân biệt mode

---

### Phase 6: Error Handling & Edge Cases

**6.1 Permission Handling**
- Graceful fallback to mic-only nếu Screen Recording permission denied
- Show clear error message trong UI
- Link to System Settings để user grant permission manually

**6.2 macOS Version Detection**
- Runtime check cho macOS version
- Disable "Mic + System" option nếu < 13.2
- Show tooltip explaining requirement

**6.3 Storage Error Handling**
- Disk full scenario: show error, skip file save
- File write error: log error, save metadata anyway
- Directory permission error: fallback to temp directory

**6.4 Audio Mixing Errors**
- System audio stream unavailable: fallback to mic-only
- Mixing failed: fallback to mic-only
- Log errors for debugging

---

## Critical Files

### Files to Modify:
1. `src/types/index.ts` - Add new interfaces
2. `src/main.ts` (lines 782-905) - Update IPC handlers
3. `src/preload.ts` - Expose new APIs
4. `static/recording-overlay.html` (lines 93-107) - Update audio capture
5. `src/renderer/main.ts` (lines 1837-1858) - Replace localStorage with new storage
6. `src/renderer/settings.ts` - Add recording settings
7. `static/index.html` - Add recordings list UI
8. `package.json` - Add dependency & permissions

### New Files to Create:
1. `src/audio/sources.ts` - Audio source management
2. `src/audio/mixer.ts` - Web Audio API mixing
3. `src/transcription/chunker.ts` - Chunk processor & transcript accumulator
4. `src/storage/recordings.ts` - File system operations
5. `src/storage/database.ts` - electron-store operations
6. `src/storage/migration.ts` - localStorage migration

---

## Success Criteria

### Functional Requirements:
- ✅ Capture cả microphone và system audio
- ✅ Mix 2 audio sources thành 1 stream
- ✅ Transcribe audio thành text
- ✅ Save transcript to file (markdown/json/txt)
- ✅ Save metadata to electron-store
- ✅ Hiển thị danh sách recordings trong main window
- ✅ Cho phép xem full transcript
- ✅ Cho phép xóa recording
- ✅ Migrate existing localStorage data

### Quality Requirements:
- Audio sync latency < 50ms
- Transcription accuracy tương đương mic-only
- File save operation < 100ms
- UI responsive (no freezing during save)
- Graceful degradation nếu không có permission

### User Experience:
- Clear permission request flow
- Visual indicator cho recording mode
- Easy-to-use recordings management UI
- Smooth migration (no data loss)

---

## Phased Rollout

### MVP (Phase 1-3):
- System audio capture với desktopCapturer
- Basic audio mixing
- File storage với markdown format
- electron-store metadata tracking
- Migration từ localStorage

### Enhanced (Phase 4-5):
- Full recordings management UI
- Multiple format support (json/txt/md)
- Settings UI integration
- Permission management UI

### Polish (Phase 6):
- Comprehensive error handling
- macOS version detection
- Storage cleanup utilities
- Performance optimization

---

## Technical Notes

**Electron desktopCapturer Audio Loopback:**
- Requires macOS 13.2+ (Ventura or newer)
- Uses ScreenCaptureKit framework
- Needs `com.apple.security.device.screen-capture` entitlement
- Requires Screen Recording permission in System Settings

**Web Audio API Mixing:**
- AudioContext sample rate: 48000 Hz (match MediaRecorder)
- Use GainNode for independent volume control
- MediaStreamDestination for output stream
- Low-latency mixing guaranteed by API

**File Storage:**
- Use app.getPath('userData') + '/recordings'
- Organize by month: YYYY-MM/
- Atomic file writes để tránh corruption
- JSON format tốt cho structured data, Markdown tốt cho human-readable

**Performance:**
- Lazy loading cho transcript content (chỉ load khi user click xem)
- Metadata cache trong memory
- Pagination cho list view
- Index by date trong electron-store để query nhanh

---

## Potential Challenges

### Challenge 1: Screen Recording Permission
- User có thể deny permission
- **Mitigation:** Clear UI messaging, fallback to mic-only

### Challenge 2: macOS Version < 13.2
- ScreenCaptureKit không available
- **Mitigation:** Runtime detection, disable dual-audio option

### Challenge 3: Audio Sync
- Microphone và system audio có thể drift
- **Mitigation:** Web Audio API đảm bảo sync, extensive testing

### Challenge 4: Storage Growth
- Transcript files có thể tích lũy nhanh
- **Mitigation:** Show storage stats, manual cleanup, future: auto-cleanup policy

---

## Next Steps After Implementation

1. **Testing:**
   - Test với Zoom, Teams, Google Meet
   - Test trên macOS 13.2+, 14.x, 15.x
   - Test permission flows
   - Test migration with existing data
   - Test chunked recording với cuộc gọi dài (5min, 10min, 30min)
   - Test edge cases: network error giữa chunk, API timeout

2. **Documentation:**
   - User guide cho Screen Recording permission
   - Supported macOS versions
   - Troubleshooting guide
   - Explain chunking behavior (30s chunks)

3. **Future Enhancements:**
   - Speaker diarization (phân biệt người nói)
   - Auto-cleanup old recordings
   - Export multiple recordings
   - Cloud sync (optional)
   - Tags and search functionality
   - Configurable chunk duration (15s, 30s, 60s)
   - Offline mode (save audio, transcribe later)

---

## Appendix: Code Examples

### A. Recording Overlay với Chunking (Pseudo-code)

```javascript
// static/recording-overlay.html

let mediaRecorder = null;
let chunkIndex = 0;
let partialTranscripts = [];
let recordingStartTime = null;
let timerInterval = null;

async function startRecording() {
  const stream = await getAudioStream(); // mic + system audio mixed

  mediaRecorder = new MediaRecorder(stream, {
    mimeType: 'audio/webm;codecs=opus',
    audioBitsPerSecond: 128000
  });

  // Handle chunks mỗi 30s
  mediaRecorder.ondataavailable = async (event) => {
    if (event.data.size > 0) {
      const audioBlob = event.data;
      const arrayBuffer = await audioBlob.arrayBuffer();

      // Gửi chunk để transcribe (non-blocking)
      const currentChunkIndex = chunkIndex++;
      window.claude.transcribeChunk(arrayBuffer, currentChunkIndex);

      console.log(`[Chunk ${currentChunkIndex}] Sent for transcription, size: ${audioBlob.size} bytes`);
    }
  };

  // Listen for transcription results
  window.claude.onChunkTranscribed((event, result) => {
    const { text, chunkIndex: idx } = result;
    partialTranscripts[idx] = text;
    updateLiveTranscript();
    console.log(`[Chunk ${idx}] Transcribed: "${text}"`);
  });

  mediaRecorder.onstop = async () => {
    // Merge all chunks
    const fullTranscript = partialTranscripts.filter(Boolean).join(' ');
    const duration = Math.floor((Date.now() - recordingStartTime) / 1000);

    // Save to storage
    await window.claude.callRecordingComplete(
      fullTranscript,
      'mic+system',
      duration,
      partialTranscripts.length
    );

    // Cleanup
    stream.getTracks().forEach(track => track.stop());
    clearInterval(timerInterval);
  };

  // Start với timeslice 30s
  mediaRecorder.start(30000);
  recordingStartTime = Date.now();
  startTimer();
}

function updateLiveTranscript() {
  const transcriptEl = document.getElementById('live-transcript');
  const text = partialTranscripts.filter(Boolean).join(' ');
  transcriptEl.textContent = text;
  transcriptEl.scrollTop = transcriptEl.scrollHeight; // auto-scroll
}

function startTimer() {
  const timerEl = document.getElementById('timer');
  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    timerEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }, 1000);
}
```

### B. Main Process Chunk Handler

```typescript
// src/main.ts

ipcMain.handle('transcribe-chunk', async (event, audioData: ArrayBuffer, chunkIndex: number) => {
  try {
    console.log(`[Chunk ${chunkIndex}] Transcribing...`);
    const buffer = Buffer.from(audioData);
    const result = await transcribeAudio(buffer, `chunk-${chunkIndex}.webm`, 'auto');

    // Send result back to overlay
    if (recordingOverlay && !recordingOverlay.isDestroyed()) {
      recordingOverlay.webContents.send('chunk-transcribed', {
        text: result.text,
        chunkIndex
      });
    }

    console.log(`[Chunk ${chunkIndex}] Done: "${result.text}"`);
    return result;
  } catch (error) {
    console.error(`[Chunk ${chunkIndex}] Error:`, error);
    // Don't throw - allow recording to continue even if one chunk fails
    return { text: '', chunkIndex };
  }
});

ipcMain.handle('call-recording-complete', async (
  event,
  fullTranscript: string,
  recordingMode: 'mic' | 'mic+system',
  duration: number,
  chunksCount: number
) => {
  try {
    // Apply dictionary & LLM correction to full transcript
    const settings = getSettings();
    let finalTranscript = fullTranscript;

    if (settings.dictionary) {
      finalTranscript = applyDictionary(finalTranscript, settings.dictionary);
    }

    if (settings.llmCorrectionEnabled) {
      finalTranscript = await applyLLMCorrection(finalTranscript, settings.llmCorrectionPrompt);
    }

    // Save to file & database
    const metadata: RecordingMetadata = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      duration,
      transcriptPath: '', // will be set by saveTranscriptToFile
      format: settings.recordingsSettings.format || 'md',
      recordingMode,
      wordCount: finalTranscript.split(/\s+/).length,
      fileSize: 0 // will be set after file save
    };

    await saveTranscriptToFile(metadata, finalTranscript);
    await addRecording(metadata);

    // Notify main window
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('recording-saved', metadata);
    }

    console.log(`[Call Recording] Saved: ${chunksCount} chunks, ${duration}s, ${metadata.wordCount} words`);
    return { success: true, id: metadata.id };
  } catch (error) {
    console.error('[Call Recording] Save error:', error);
    throw error;
  }
});
```

### C. Updated Recording Overlay UI

```html
<!-- Expanded overlay with live transcript -->
<style>
  .recording-container {
    width: 400px;
    min-height: 200px;
    max-height: 400px;
    background: rgba(0, 0, 0, 0.9);
    backdrop-filter: blur(20px);
    border-radius: 16px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .status {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .timer {
    font-size: 14px;
    color: #888;
    font-variant-numeric: tabular-nums;
  }

  .live-transcript {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    color: #fff;
    font-size: 13px;
    line-height: 1.5;
    max-height: 300px;
  }

  .mode-badge {
    background: rgba(52, 199, 89, 0.2);
    color: #34C759;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
  }
</style>

<div class="recording-container">
  <div class="header">
    <div class="status">
      <div class="recording-dot"></div>
      <span>Recording</span>
      <span class="mode-badge">Mic + System</span>
    </div>
    <div class="timer" id="timer">00:00</div>
  </div>

  <div class="live-transcript" id="live-transcript">
    Waiting for audio...
  </div>
</div>
```

---

## Summary

Kế hoạch đã được cập nhật với:

1. ✅ **Chunking Strategy**: Auto-chunk mỗi 30s cho cuộc gọi dài
2. ✅ **Real-time Transcription**: Hiển thị partial transcript trong khi recording
3. ✅ **Expanded Overlay UI**: 400x200px với scrollable transcript area
4. ✅ **IPC Architecture**: `transcribe-chunk` handler + `chunk-transcribed` event
5. ✅ **Timer Display**: MM:SS counter trong overlay
6. ✅ **Non-blocking**: Chunks transcribe parallel, không block recording
7. ✅ **Error Handling**: Chunk failure không dừng recording

Giải pháp này đảm bảo:
- Không giới hạn độ dài cuộc gọi
- Real-time feedback cho user
- API xử lý chunks nhỏ nhanh hơn (30s < 2s transcription time)
- Scalable cho meetings dài (1h+ không vấn đề)
