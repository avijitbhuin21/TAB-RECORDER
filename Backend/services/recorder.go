package services

import (
	"fmt"
	"sync"
)

type RecorderService struct {
	fileWriter        *FileWriterService
	activeRecordings  sync.Map
	stoppedRecordings sync.Map
}

func NewRecorderService(fileWriter *FileWriterService) *RecorderService {
	return &RecorderService{
		fileWriter:        fileWriter,
		activeRecordings:  sync.Map{},
		stoppedRecordings: sync.Map{},
	}
}

func (rs *RecorderService) HandleRecording(tabID int, name string, timestamp int64, data []byte, status string) error {
	LogInfo("[RECORDER] HandleRecording called - TabID: %d, Name: %s, Status: %s, DataSize: %d",
		tabID, name, status, len(data))
	
	switch status {
	case "stream":
		if _, stopped := rs.stoppedRecordings.Load(tabID); stopped {
			LogInfo("[RECORDER] ⚠️ Rejecting chunk for stopped recording (tab %d)", tabID)
			return fmt.Errorf("recording already stopped for tab %d", tabID)
		}
		
		LogInfo("[RECORDER] Processing stream chunk for tab %d", tabID)
		rs.activeRecordings.Store(tabID, true)
		LogInfo("[RECORDER] Active recordings count: %d", len(rs.GetActiveRecordings()))
		
		if err := rs.fileWriter.WriteChunk(tabID, name, timestamp, data); err != nil {
			LogError("[RECORDER] Failed to write chunk for tab %d: %v", tabID, err)
			return fmt.Errorf("failed to write recording chunk: %w", err)
		}
		LogInfo("[RECORDER] ✅ Chunk written successfully for tab %d", tabID)
		return nil

	case "stopped":
		LogInfo("[RECORDER] Stopping recording for tab %d", tabID)
		rs.stoppedRecordings.Store(tabID, true)
		rs.activeRecordings.Delete(tabID)
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

func (rs *RecorderService) GetActiveRecordings() []int {
	var recordings []int
	rs.activeRecordings.Range(func(key, value interface{}) bool {
		recordings = append(recordings, key.(int))
		return true
	})
	return recordings
}

func (rs *RecorderService) IsRecording(tabID int) bool {
	_, exists := rs.activeRecordings.Load(tabID)
	return exists
}