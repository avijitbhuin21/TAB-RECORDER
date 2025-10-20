package services

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"
)

const (
	statsSaveInterval = 5 * time.Second
)

type Stats struct {
	TotalSizeBytes int64 `json:"totalSizeBytes"`
	TotalSessions  int   `json:"totalSessions"`
	mu             sync.Mutex
	filePath       string
	dirty          bool
	lastSave       time.Time
	stopChan       chan struct{}
}

func NewStats(downloadDir string) *Stats {
	statsPath := filepath.Join(downloadDir, "stats.json")
	stats := &Stats{
		filePath: statsPath,
		stopChan: make(chan struct{}),
	}
	stats.Load()
	stats.startPeriodicSave()
	return stats
}

func (s *Stats) Load() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := os.ReadFile(s.filePath)
	if err != nil {
		if os.IsNotExist(err) {
			LogInfo("[STATS] No existing stats file, starting fresh")
			return nil
		}
		LogError("[STATS] Failed to read stats file: %v", err)
		return err
	}

	if err := json.Unmarshal(data, s); err != nil {
		LogError("[STATS] Failed to parse stats file: %v", err)
		return err
	}

	LogInfo("[STATS] Loaded stats - Sessions: %d, Size: %d bytes", s.TotalSessions, s.TotalSizeBytes)
	return nil
}

func (s *Stats) save() error {
	if !s.dirty {
		return nil
	}

	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		LogError("[STATS] Failed to marshal stats: %v", err)
		return err
	}

	if err := os.WriteFile(s.filePath, data, 0644); err != nil {
		LogError("[STATS] Failed to write stats file: %v", err)
		return err
	}

	s.dirty = false
	s.lastSave = time.Now()
	return nil
}

func (s *Stats) Save() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.save()
}

func (s *Stats) startPeriodicSave() {
	go func() {
		ticker := time.NewTicker(statsSaveInterval)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				s.mu.Lock()
				s.save()
				s.mu.Unlock()
			case <-s.stopChan:
				s.mu.Lock()
				s.save()
				s.mu.Unlock()
				return
			}
		}
	}()
}

func (s *Stats) Stop() {
	close(s.stopChan)
}

func (s *Stats) AddSize(bytes int64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.TotalSizeBytes += bytes
	s.dirty = true
}

func (s *Stats) IncrementSession() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.TotalSessions++
	s.dirty = true
}

func (s *Stats) GetTotalSize() int64 {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.TotalSizeBytes
}

func (s *Stats) GetTotalSessions() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.TotalSessions
}