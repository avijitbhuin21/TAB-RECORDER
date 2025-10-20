package services

import (
	"fmt"
	"sync"
	"time"
)

// SessionInfo holds information about an active recording session
type SessionInfo struct {
	TabID       int
	Name        string
	StartTime   time.Time
	BytesWritten int64
}

// RecorderService manages recording sessions and coordinates file writing and stats tracking
type RecorderService struct {
	fileWriter        *FileWriterService
	activeRecordings  sync.Map
	stoppedRecordings sync.Map
	stats             *Stats
	sessionInfo       sync.Map
}

// NewRecorderService creates a new recorder service instance
func NewRecorderService(fileWriter *FileWriterService, stats *Stats) *RecorderService {
	return &RecorderService{
		fileWriter:        fileWriter,
		activeRecordings:  sync.Map{},
		stoppedRecordings: sync.Map{},
		stats:             stats,
		sessionInfo:       sync.Map{},
	}
}

// HandleRecording processes incoming recording data based on status.
// For "stream" status, writes chunks to disk and tracks session info.
// For "stopped" status, closes the file and cleans up session data.
func (rs *RecorderService) HandleRecording(tabID int, name string, timestamp int64, data []byte, status string) error {
	LogInfo("[RECORDER] HandleRecording called - TabID: %d, Name: %s, Status: %s, DataSize: %d",
		tabID, name, status, len(data))
	
	switch status {
	case "stream":
		if _, stopped := rs.stoppedRecordings.Load(tabID); stopped {
			return fmt.Errorf("recording already stopped for tab %d", tabID)
		}
		
		if _, exists := rs.activeRecordings.Load(tabID); !exists {
			rs.stats.IncrementSession()
			rs.sessionInfo.Store(tabID, &SessionInfo{
				TabID:        tabID,
				Name:         name,
				StartTime:    time.Now(),
				BytesWritten: 0,
			})
			LogInfo("[RECORDER] New recording session started for tab %d", tabID)
		}
		
		rs.activeRecordings.Store(tabID, true)
		
		if err := rs.fileWriter.WriteChunk(tabID, name, timestamp, data); err != nil {
			LogError("[RECORDER] Failed to write chunk for tab %d: %v", tabID, err)
			return fmt.Errorf("failed to write recording chunk: %w", err)
		}
		
		if info, ok := rs.sessionInfo.Load(tabID); ok {
			sessionInfo, ok := info.(*SessionInfo)
			if !ok {
				LogError("[RECORDER] Invalid session type for tab %d", tabID)
				return fmt.Errorf("invalid session type")
			}
			sessionInfo.BytesWritten += int64(len(data))
		}
		
		return nil

	case "stopped":
		rs.stoppedRecordings.Store(tabID, true)
		rs.activeRecordings.Delete(tabID)
		rs.sessionInfo.Delete(tabID)
		LogInfo("[RECORDER] Removed tab %d from active recordings", tabID)
		
		if err := rs.fileWriter.CloseFile(tabID); err != nil {
			LogError("[RECORDER] Failed to close file for tab %d: %v", tabID, err)
			return fmt.Errorf("failed to stop recording: %w", err)
		}
		LogInfo("[RECORDER] ✅ Recording stopped successfully for tab %d", tabID)
		
		rs.stoppedRecordings.Delete(tabID)
		return nil

	default:
		LogError("[RECORDER] Unknown status received: %s", status)
		return fmt.Errorf("unknown status: %s", status)
	}
}

// GetActiveRecordings returns a list of all currently active recording tab IDs
func (rs *RecorderService) GetActiveRecordings() []int {
	var recordings []int
	rs.activeRecordings.Range(func(key, value interface{}) bool {
		recordings = append(recordings, key.(int))
		return true
	})
	return recordings
}

// IsRecording checks if a given tab ID has an active recording
func (rs *RecorderService) IsRecording(tabID int) bool {
	_, exists := rs.activeRecordings.Load(tabID)
	return exists
}

// GetSessionInfo retrieves session information for a specific tab ID.
// Returns nil if no session exists for the given tab.
func (rs *RecorderService) GetSessionInfo(tabID int) *SessionInfo {
	if info, ok := rs.sessionInfo.Load(tabID); ok {
		return info.(*SessionInfo)
	}
	return nil
}

// GetAllSessionInfo retrieves session information for all active recordings
func (rs *RecorderService) GetAllSessionInfo() []*SessionInfo {
	var sessions []*SessionInfo
	rs.sessionInfo.Range(func(key, value interface{}) bool {
		sessions = append(sessions, value.(*SessionInfo))
		return true
	})
	return sessions
}