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
	activeFiles sync.Map
	downloadDir string
	stats       *Stats
}

func NewFileWriterService(downloadDir string, stats *Stats) *FileWriterService {
	fws := &FileWriterService{
		activeFiles: sync.Map{},
		downloadDir: downloadDir,
		stats:       stats,
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
	handle, err := fws.getOrCreateHandle(tabID, name, timestamp)
	if err != nil {
		LogError("[FILEWRITER] Failed to get file handle: %v", err)
		return fmt.Errorf("failed to get file handle: %w", err)
	}

	handle.mu.Lock()
	defer handle.mu.Unlock()

	bytesWritten, err := handle.writer.Write(data)
	if err != nil {
		LogError("[FILEWRITER] Write failed for tab %d: %v", tabID, err)
		return fmt.Errorf("disk write failed: %w", err)
	}
	
	fws.stats.AddSize(int64(bytesWritten))
	return nil
}

func (fws *FileWriterService) CloseFile(tabID int) error {
	val, ok := fws.activeFiles.LoadAndDelete(tabID)
	if !ok {
		return nil
	}

	handle := val.(*fileHandle)
	handle.mu.Lock()
	defer handle.mu.Unlock()

	if err := handle.writer.Flush(); err != nil {
		LogError("[FILEWRITER] Final flush failed for tab %d: %v", tabID, err)
	}

	if err := handle.file.Close(); err != nil {
		LogError("[FILEWRITER] File close failed for tab %d: %v", tabID, err)
		return fmt.Errorf("failed to close file: %w", err)
	}

	LogInfo("[FILEWRITER] Recording stopped for tab %d", tabID)
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
		return val.(*fileHandle), nil
	}

	handle, err := fws.createFile(tabID, name, timestamp)
	if err != nil {
		LogError("[FILEWRITER] Failed to create file: %v", err)
		return nil, err
	}

	fws.activeFiles.Store(tabID, handle)
	return handle, nil
}

func (fws *FileWriterService) createFile(tabID int, name string, timestamp int64) (*fileHandle, error) {
	if err := fws.ensureDirectory(fws.downloadDir); err != nil {
		LogError("[FILEWRITER] Failed to ensure directory: %v", err)
		return nil, err
	}

	filename := filepath.Join(fws.downloadDir,
		fmt.Sprintf("%s_%d_%d.webm", name, tabID, timestamp))

	file, err := os.Create(filename)
	if err != nil {
		LogError("[FILEWRITER] Failed to create file %s: %v", filename, err)
		return nil, fmt.Errorf("failed to create file: %w", err)
	}

	LogInfo("[FILEWRITER] Started recording: %s", filename)

	return &fileHandle{
		file:   file,
		writer: bufio.NewWriter(file),
	}, nil
}

func (fws *FileWriterService) GetTotalRecordedSize() int64 {
	return fws.stats.GetTotalSize()
}

func (fws *FileWriterService) GetStats() *Stats {
	return fws.stats
}