package services

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

type fileHandle struct {
	file   *os.File
	writer *bufio.Writer
	mu     sync.Mutex
}

type FileWriterService struct {
	activeFiles  sync.Map
	downloadDir  string
	totalSize    int64
	totalSizeMu  sync.Mutex
}

func NewFileWriterService(downloadDir string) *FileWriterService {
	fws := &FileWriterService{
		activeFiles: sync.Map{},
		downloadDir: downloadDir,
		totalSize:   0,
	}
	if err := fws.ensureDirectory(downloadDir); err != nil {
		LogError("Failed to create download directory: %v", err)
	}
	return fws
}

func (fws *FileWriterService) ensureDirectory(directory string) error {
	if err := os.MkdirAll(directory, 0755); err != nil {
		return fmt.Errorf("failed to create directory: %w", err)
	}
	return nil
}

func (fws *FileWriterService) WriteChunk(tabID int, name string, timestamp int64, data []byte) error {
	LogInfo("[FILEWRITER] WriteChunk called - TabID: %d, Name: %s, DataSize: %d bytes", tabID, name, len(data))
	
	handle, err := fws.getOrCreateHandle(tabID, name, timestamp)
	if err != nil {
		LogError("[FILEWRITER] Failed to get file handle: %v", err)
		return fmt.Errorf("failed to get file handle: %w", err)
	}

	handle.mu.Lock()
	defer handle.mu.Unlock()

	LogInfo("[FILEWRITER] Writing %d bytes to file for tab %d", len(data), tabID)
	bytesWritten, err := handle.writer.Write(data)
	if err != nil {
		LogError("[FILEWRITER] Write failed for tab %d: %v", tabID, err)
		return fmt.Errorf("disk write failed: %w", err)
	}
	LogInfo("[FILEWRITER] Successfully wrote %d bytes", bytesWritten)
	
	fws.totalSizeMu.Lock()
	fws.totalSize += int64(bytesWritten)
	fws.totalSizeMu.Unlock()

	LogInfo("[FILEWRITER] Flushing buffer to disk for tab %d", tabID)
	if err := handle.writer.Flush(); err != nil {
		LogError("[FILEWRITER] Flush failed for tab %d: %v", tabID, err)
		return fmt.Errorf("disk flush failed: %w", err)
	}
	LogInfo("[FILEWRITER] ✅ Chunk written and flushed successfully for tab %d", tabID)

	return nil
}

func (fws *FileWriterService) CloseFile(tabID int) error {
	LogInfo("[FILEWRITER] CloseFile called for tab %d", tabID)
	
	val, ok := fws.activeFiles.LoadAndDelete(tabID)
	if !ok {
		LogInfo("[FILEWRITER] No active file found for tab %d (already closed or never started)", tabID)
		return nil
	}

	handle := val.(*fileHandle)
	handle.mu.Lock()
	defer handle.mu.Unlock()

	LogInfo("[FILEWRITER] Performing final flush for tab %d", tabID)
	if err := handle.writer.Flush(); err != nil {
		LogError("[FILEWRITER] Final flush failed for tab %d: %v", tabID, err)
	}

	LogInfo("[FILEWRITER] Closing file for tab %d", tabID)
	if err := handle.file.Close(); err != nil {
		LogError("[FILEWRITER] File close failed for tab %d: %v", tabID, err)
		return fmt.Errorf("failed to close file: %w", err)
	}

	LogInfo("[FILEWRITER] ✅ Recording stopped successfully for tab %d", tabID)
	return nil
}

func (fws *FileWriterService) SetDownloadDir(dir string) {
	fws.downloadDir = dir
	if err := fws.ensureDirectory(dir); err != nil {
		LogError("Failed to create directory %s: %v", dir, err)
	}
}

func (fws *FileWriterService) getOrCreateHandle(tabID int, name string, timestamp int64) (*fileHandle, error) {
	val, exists := fws.activeFiles.Load(tabID)
	if exists {
		LogInfo("[FILEWRITER] Using existing file handle for tab %d", tabID)
		return val.(*fileHandle), nil
	}

	LogInfo("[FILEWRITER] Creating new file handle for tab %d", tabID)
	handle, err := fws.createFile(tabID, name, timestamp)
	if err != nil {
		LogError("[FILEWRITER] Failed to create file: %v", err)
		return nil, err
	}

	fws.activeFiles.Store(tabID, handle)
	LogInfo("[FILEWRITER] File handle created and stored for tab %d", tabID)
	return handle, nil
}

func (fws *FileWriterService) createFile(tabID int, name string, timestamp int64) (*fileHandle, error) {
	LogInfo("[FILEWRITER] createFile called - TabID: %d, Name: %s, Timestamp: %d", tabID, name, timestamp)
	LogInfo("[FILEWRITER] Download directory: %s", fws.downloadDir)
	
	if err := fws.ensureDirectory(fws.downloadDir); err != nil {
		LogError("[FILEWRITER] Failed to ensure directory: %v", err)
		return nil, err
	}

	filename := filepath.Join(fws.downloadDir,
		fmt.Sprintf("%s_%d_%d.webm", name, tabID, timestamp))
	
	LogInfo("[FILEWRITER] Creating file: %s", filename)

	file, err := os.Create(filename)
	if err != nil {
		LogError("[FILEWRITER] Failed to create file %s: %v", filename, err)
		return nil, fmt.Errorf("failed to create file: %w", err)
	}

	LogInfo("[FILEWRITER] ✅ Started recording: %s", filename)

	return &fileHandle{
		file:   file,
		writer: bufio.NewWriter(file),
	}, nil
}

func (fws *FileWriterService) GetTotalRecordedSize() int64 {
	fws.totalSizeMu.Lock()
	defer fws.totalSizeMu.Unlock()
	return fws.totalSize
}