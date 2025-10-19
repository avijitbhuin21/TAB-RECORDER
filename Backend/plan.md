# Go Recording Server - Implementation Plan

## 🎯 Project Overview

Building a standalone Go application with embedded UI for managing Chrome extension recordings. The server will handle concurrent streaming file writes from multiple browser tabs, with a native embedded UI for configuration and monitoring.

---

## 📋 Prerequisites

### Installing Go on Windows

#### Option 1: Using winget (Recommended)

```powershell
winget install GoLang.Go
```

After installation, verify:
```powershell
go version
```

You should see something like: `go version go1.21.5 windows/amd64`

#### Option 2: Manual Installation

1. Download from: https://go.dev/dl/
2. Run the MSI installer
3. Restart terminal
4. Verify: `go version`

### Required Tools

```powershell
go install github.com/webview/webview@latest
```

---

## 🏗️ Project Structure

```
Backend/
├── main.go              # Main application entry point
├── go.mod              # Go module definition
├── go.sum              # Dependency checksums
├── handlers/           # HTTP request handlers
│   ├── health.go       # Health check endpoint
│   ├── recordings.go   # Recording data handler
│   └── config.go       # Configuration endpoint
├── models/             # Data structures
│   └── recording.go    # Recording data types
├── services/           # Business logic
│   ├── filewriter.go   # File writing service
│   └── recorder.go     # Recording management
├── ui/                 # Embedded web UI
│   ├── index.html     # Main UI page
│   ├── styles.css     # UI styling
│   └── app.js         # UI JavaScript
├── build.ps1          # Build script for Windows/macOS
└── plan.md            # This file
```

---

## 📝 Implementation Steps

### Phase 1: Project Initialization (Day 1)

#### Step 1.1: Initialize Go Module

```powershell
cd Backend
go mod init recorder
```

#### Step 1.2: Install Dependencies

```powershell
go get github.com/webview/webview
go get github.com/sqweek/dialog
```

#### Step 1.3: Create Project Structure

```powershell
New-Item -ItemType Directory -Path handlers,models,services,ui
```

---

### Phase 2: Core Backend Implementation (Day 1-2)

#### Step 2.1: Define Data Models (`models/recording.go`)

```go
package models

import "encoding/json"

type RecordingData struct {
    Name      string          `json:"name"`
    TabID     int             `json:"tabId"`
    Timestamp int64           `json:"timestamp"`
    Data      json.RawMessage `json:"data"`
    Status    string          `json:"status"`
}

type ServerConfig struct {
    Port        string `json:"port"`
    DownloadDir string `json:"downloadDir"`
}

type HealthResponse struct {
    Status string `json:"status"`
    Time   string `json:"time"`
}
```

**Time estimate**: 30 minutes

---

#### Step 2.2: Implement File Writer Service (`services/filewriter.go`)

```go
package services

import (
    "bufio"
    "fmt"
    "log"
    "os"
    "path/filepath"
    "sync"
)

type FileWriterService struct {
    activeFiles   *sync.Map
    downloadDir   string
}

func NewFileWriterService(downloadDir string) *FileWriterService {
    os.MkdirAll(downloadDir, 0755)
    return &FileWriterService{
        activeFiles:   &sync.Map{},
        downloadDir:   downloadDir,
    }
}

func (fws *FileWriterService) WriteChunk(tabID int, name string, timestamp int64, data []byte) error {
    file, exists := fws.activeFiles.Load(tabID)
    
    if !exists {
        filename := filepath.Join(fws.downloadDir, 
            fmt.Sprintf("%s_%d_%d.webm", name, tabID, timestamp))
        
        f, err := os.Create(filename)
        if err != nil {
            return err
        }
        
        writer := bufio.NewWriter(f)
        fws.activeFiles.Store(tabID, writer)
        file = writer
        log.Printf("Started recording: %s", filename)
    }
    
    go func(w *bufio.Writer, chunk []byte) {
        w.Write(chunk)
        w.Flush()
    }(file.(*bufio.Writer), data)
    
    return nil
}

func (fws *FileWriterService) CloseFile(tabID int) error {
    if file, exists := fws.activeFiles.LoadAndDelete(tabID); exists {
        writer := file.(*bufio.Writer)
        writer.Flush()
        log.Printf("Recording stopped for tab %d", tabID)
    }
    return nil
}

func (fws *FileWriterService) SetDownloadDir(dir string) {
    fws.downloadDir = dir
    os.MkdirAll(dir, 0755)
}
```

**Time estimate**: 1 hour

---

#### Step 2.3: Implement Recording Service (`services/recorder.go`)

```go
package services

import (
    "recorder/models"
    "sync"
)

type RecorderService struct {
    fileWriter    *FileWriterService
    activeRecordings *sync.Map
}

func NewRecorderService(fileWriter *FileWriterService) *RecorderService {
    return &RecorderService{
        fileWriter:    fileWriter,
        activeRecordings: &sync.Map{},
    }
}

func (rs *RecorderService) HandleRecording(data models.RecordingData) error {
    switch data.Status {
    case "stream":
        rs.activeRecordings.Store(data.TabID, true)
        return rs.fileWriter.WriteChunk(data.TabID, data.Name, data.Timestamp, data.Data)
    case "stopped":
        rs.activeRecordings.Delete(data.TabID)
        return rs.fileWriter.CloseFile(data.TabID)
    }
    return nil
}

func (rs *RecorderService) GetActiveRecordings() []int {
    var recordings []int
    rs.activeRecordings.Range(func(key, value interface{}) bool {
        recordings = append(recordings, key.(int))
        return true
    })
    return recordings
}
```

**Time estimate**: 45 minutes

---

#### Step 2.4: Implement HTTP Handlers (`handlers/*.go`)

**handlers/health.go**:
```go
package handlers

import (
    "encoding/json"
    "net/http"
    "recorder/models"
    "time"
)

func HealthHandler(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Content-Type", "application/json")
    w.Header().Set("Access-Control-Allow-Origin", "*")
    
    response := models.HealthResponse{
        Status: "ok",
        Time:   time.Now().Format(time.RFC3339),
    }
    
    json.NewEncoder(w).Encode(response)
}
```

**handlers/recordings.go**:
```go
package handlers

import (
    "encoding/json"
    "net/http"
    "recorder/models"
    "recorder/services"
)

type RecordingsHandler struct {
    recorder *services.RecorderService
}

func NewRecordingsHandler(recorder *services.RecorderService) *RecordingsHandler {
    return &RecordingsHandler{recorder: recorder}
}

func (h *RecordingsHandler) Handle(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Access-Control-Allow-Origin", "*")
    w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
    w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

    if r.Method == "OPTIONS" {
        w.WriteHeader(http.StatusOK)
        return
    }

    var data models.RecordingData
    if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }

    if err := h.recorder.HandleRecording(data); err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }

    w.WriteHeader(http.StatusAccepted)
    json.NewEncoder(w).Encode(map[string]string{"status": "received"})
}
```

**handlers/config.go**:
```go
package handlers

import (
    "encoding/json"
    "net/http"
    "recorder/services"
)

type ConfigHandler struct {
    fileWriter *services.FileWriterService
}

func NewConfigHandler(fileWriter *services.FileWriterService) *ConfigHandler {
    return &ConfigHandler{fileWriter: fileWriter}
}

func (h *ConfigHandler) Handle(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Access-Control-Allow-Origin", "*")
    
    if r.Method == "POST" {
        var config struct {
            Path string `json:"path"`
        }
        json.NewDecoder(r.Body).Decode(&config)
        
        if config.Path != "" {
            h.fileWriter.SetDownloadDir(config.Path)
        }
    }
    
    w.WriteHeader(http.StatusOK)
}
```

**Time estimate**: 1.5 hours

---

### Phase 3: UI Implementation (Day 2)

#### Step 3.1: Create HTML UI (`ui/index.html`)

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Recording Server</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <div class="container">
        <header>
            <h1>🎥 Recording Server</h1>
            <div class="status">
                <span class="status-dot"></span>
                <span id="status-text">Server Running</span>
            </div>
        </header>

        <section class="config-panel">
            <h2>Configuration</h2>
            <div class="config-item">
                <label>Server Port:</label>
                <span id="port">8080</span>
            </div>
            <div class="config-item">
                <label>Download Directory:</label>
                <span id="downloadDir">./recordings</span>
            </div>
            <button id="change-dir-btn" onclick="selectDirectory()">
                Change Directory
            </button>
        </section>

        <section class="recordings-panel">
            <h2>Active Recordings</h2>
            <div id="recordings-list" class="recordings-list">
                <p class="empty-state">No active recordings</p>
            </div>
        </section>

        <section class="stats-panel">
            <h2>Statistics</h2>
            <div class="stats-grid">
                <div class="stat-item">
                    <span class="stat-label">Total Recordings</span>
                    <span class="stat-value" id="total-recordings">0</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Active Sessions</span>
                    <span class="stat-value" id="active-sessions">0</span>
                </div>
            </div>
        </section>
    </div>
    <script src="app.js"></script>
</body>
</html>
```

**Time estimate**: 1 hour

---

#### Step 3.2: Create CSS Styling (`ui/styles.css`)

```css
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    min-height: 100vh;
    padding: 20px;
}

.container {
    max-width: 1200px;
    margin: 0 auto;
}

header {
    background: white;
    padding: 30px;
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.1);
    margin-bottom: 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

h1 {
    color: #2d3748;
    font-size: 2em;
}

.status {
    display: flex;
    align-items: center;
    gap: 10px;
}

.status-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #22c55e;
    animation: pulse 2s infinite;
}

@keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
}

section {
    background: white;
    padding: 25px;
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.1);
    margin-bottom: 20px;
}

h2 {
    color: #2d3748;
    margin-bottom: 20px;
    font-size: 1.5em;
}

.config-item {
    display: flex;
    justify-content: space-between;
    padding: 15px;
    background: #f7fafc;
    border-radius: 8px;
    margin-bottom: 10px;
}

.config-item label {
    font-weight: 600;
    color: #4a5568;
}

button {
    background: #667eea;
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    transition: all 0.3s;
    margin-top: 10px;
}

button:hover {
    background: #5568d3;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.recordings-list {
    min-height: 100px;
}

.empty-state {
    color: #a0aec0;
    text-align: center;
    padding: 40px;
    font-style: italic;
}

.recording-item {
    padding: 15px;
    background: #f7fafc;
    border-radius: 8px;
    margin-bottom: 10px;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.recording-item .tab-id {
    font-weight: 600;
    color: #667eea;
}

.stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 20px;
}

.stat-item {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    padding: 25px;
    border-radius: 12px;
    color: white;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.stat-label {
    font-size: 0.9em;
    opacity: 0.9;
}

.stat-value {
    font-size: 2em;
    font-weight: 700;
}
```

**Time estimate**: 1 hour

---

#### Step 3.3: Create JavaScript Logic (`ui/app.js`)

```javascript
const API_BASE = 'http://localhost:8080/api';

async function checkHealth() {
    try {
        const response = await fetch(`${API_BASE}/health`);
        const data = await response.json();
        document.getElementById('status-text').textContent = `Server Running (${new Date(data.time).toLocaleTimeString()})`;
    } catch (error) {
        document.getElementById('status-text').textContent = 'Server Error';
        console.error('Health check failed:', error);
    }
}

async function loadServerInfo() {
    if (window.getServerStatus) {
        try {
            const status = await getServerStatus();
            document.getElementById('port').textContent = status.port;
            document.getElementById('downloadDir').textContent = status.downloadDir;
        } catch (error) {
            console.error('Failed to load server info:', error);
        }
    }
}

async function selectDirectory() {
    if (window.selectDirectory) {
        try {
            const dir = await selectDirectory();
            if (dir) {
                const response = await fetch(`${API_BASE}/config`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: dir })
                });
                
                if (response.ok) {
                    document.getElementById('downloadDir').textContent = dir;
                    alert('Directory updated successfully!');
                }
            }
        } catch (error) {
            console.error('Failed to select directory:', error);
        }
    } else {
        alert('Directory selection not available in this environment');
    }
}

function init() {
    checkHealth();
    loadServerInfo();
    setInterval(checkHealth, 5000);
}

document.addEventListener('DOMContentLoaded', init);
```

**Time estimate**: 45 minutes

---

### Phase 4: Main Application (`main.go`) (Day 3)

```go
package main

import (
    "embed"
    "fmt"
    "log"
    "net/http"
    "time"

    "recorder/handlers"
    "recorder/services"

    "github.com/sqweek/dialog"
    "github.com/webview/webview"
)

//go:embed ui/*
var uiFiles embed.FS

const (
    serverPort  = "8080"
    downloadDir = "./recordings"
)

var (
    serverStarted = make(chan bool)
)

func main() {
    fileWriter := services.NewFileWriterService(downloadDir)
    recorder := services.NewRecorderService(fileWriter)
    
    recordingsHandler := handlers.NewRecordingsHandler(recorder)
    configHandler := handlers.NewConfigHandler(fileWriter)
    
    http.Handle("/ui/", http.FileServer(http.FS(uiFiles)))
    http.HandleFunc("/api/health", handlers.HealthHandler)
    http.HandleFunc("/api/recordings", recordingsHandler.Handle)
    http.HandleFunc("/api/config", configHandler.Handle)
    
    go startServer()
    
    launchUI(fileWriter)
}

func startServer() {
    log.Printf("Server starting on http://localhost:%s", serverPort)
    serverStarted <- true
    
    if err := http.ListenAndServe(":"+serverPort, nil); err != nil {
        log.Fatal(err)
    }
}

func launchUI(fileWriter *services.FileWriterService) {
    <-serverStarted
    time.Sleep(100 * time.Millisecond)
    
    w := webview.New(false)
    defer w.Destroy()
    
    w.SetTitle("Recording Server")
    w.SetSize(1200, 800, webview.HintNone)
    
    w.Bind("selectDirectory", func() string {
        dir, err := dialog.Directory().Title("Select Download Directory").Browse()
        if err != nil {
            return ""
        }
        fileWriter.SetDownloadDir(dir)
        return dir
    })
    
    w.Bind("getServerStatus", func() map[string]interface{} {
        return map[string]interface{}{
            "port":        serverPort,
            "downloadDir": downloadDir,
            "running":     true,
        }
    })
    
    w.Navigate(fmt.Sprintf("http://localhost:%s/ui/index.html", serverPort))
    w.Run()
}
```

**Time estimate**: 1.5 hours

---

### Phase 5: Build & Distribution (Day 3)

#### Step 5.1: Create Build Script (`build.ps1`)

```powershell
Write-Host "Building Recording Server..." -ForegroundColor Green

$ErrorActionPreference = "Stop"

New-Item -ItemType Directory -Force -Path "dist"

Write-Host "Building for Windows (AMD64)..." -ForegroundColor Cyan
$env:GOOS="windows"
$env:GOARCH="amd64"
go build -ldflags="-s -w -H windowsgui" -o "dist/recorder-windows-amd64.exe"

Write-Host "Building for macOS (Intel)..." -ForegroundColor Cyan
$env:GOOS="darwin"
$env:GOARCH="amd64"
go build -ldflags="-s -w" -o "dist/recorder-macos-intel"

Write-Host "Building for macOS (Apple Silicon)..." -ForegroundColor Cyan
$env:GOOS="darwin"
$env:GOARCH="arm64"
go build -ldflags="-s -w" -o "dist/recorder-macos-arm64"

Write-Host "`nBuilds complete! Check the 'dist' folder." -ForegroundColor Green
Write-Host "Executable sizes:" -ForegroundColor Yellow
Get-ChildItem dist/* | Select-Object Name, @{Name="Size (MB)";Expression={[math]::Round($_.Length / 1MB, 2)}}
```

**Time estimate**: 30 minutes

---

## 🚀 Running the Application

### Development Mode

```powershell
cd Backend
go run main.go
```

### Production Build

```powershell
.\build.ps1
```

Run the executable:
```powershell
.\dist\recorder-windows-amd64.exe
```

---

## 📊 Timeline Summary

| Phase | Tasks | Time Estimate | Status |
|-------|-------|--------------|--------|
| 1. Initialization | Go setup, project structure | 1 hour | ⏳ Pending |
| 2. Backend | Models, services, handlers | 3 hours | ⏳ Pending |
| 3. UI | HTML, CSS, JavaScript | 2.5 hours | ⏳ Pending |
| 4. Integration | Main app, webview setup | 1.5 hours | ⏳ Pending |
| 5. Build & Test | Build scripts, testing | 1 hour | ⏳ Pending |

**Total Estimated Time**: 9 hours (~1-2 days)

---

## ✅ Testing Checklist

### Server Testing
- [ ] Health endpoint responds
- [ ] CORS headers present
- [ ] Server starts on correct port

### Recording Testing
- [ ] New recording creates file
- [ ] Concurrent recordings work
- [ ] File closes on stop
- [ ] Chunks written incrementally

### UI Testing
- [ ] UI loads correctly
- [ ] Status updates work
- [ ] Directory selection works
- [ ] Statistics display correctly

### Platform Testing
- [ ] Windows executable works
- [ ] macOS Intel build works
- [ ] macOS ARM build works
- [ ] WebView2 check on Windows

---

## 🐛 Common Issues & Solutions

### Issue 1: WebView2 Not Found (Windows)
**Solution**: 
```powershell
winget install Microsoft.EdgeWebView2Runtime
```

### Issue 2: CGO Required Error
**Solution**: Install MinGW-w64
```powershell
winget install mingw
```

### Issue 3: Port Already in Use
**Solution**: Change port in `main.go`:
```go
const serverPort = "8081"
```

### Issue 4: File Permission Denied
**Solution**: Run as administrator or change download directory

---

## 📚 Resources

- **Go Documentation**: https://go.dev/doc/
- **Webview Package**: https://github.com/webview/webview
- **Go HTTP Server**: https://pkg.go.dev/net/http
- **Go Concurrency**: https://go.dev/tour/concurrency/1

---

## 🎯 Next Steps After Implementation

1. Add authentication for security
2. Implement recording metadata storage (SQLite)
3. Add video player in UI
4. Create installer (NSIS for Windows, DMG for macOS)
5. Add auto-update capability
6. Implement recording compression
7. Add cloud storage integration

---

## 📝 Notes

- All times are estimates for a developer familiar with Go
- Testing time not included in estimates
- Binary size will be ~10-15 MB
- WebView2 is required on Windows (built-in on Windows 10 1803+)
- WKWebView is built into all modern macOS versions

---

## 🤝 Support

For issues or questions:
1. Check the Go documentation
2. Review the Webview package issues
3. Test with curl for API debugging
4. Use Chrome DevTools for UI debugging (right-click in webview)

---

**Created**: 2025-10-19  
**Status**: Ready for Implementation  
**Estimated Completion**: 2-3 days