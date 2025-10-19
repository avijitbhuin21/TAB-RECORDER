package services

import (
	"fmt"
	"log"
	"sync"
)

type RecorderService struct {
	fileWriter       *FileWriterService
	activeRecordings sync.Map
}

func NewRecorderService(fileWriter *FileWriterService) *RecorderService {
	return &RecorderService{
		fileWriter:       fileWriter,
		activeRecordings: sync.Map{},
	}
}

func (rs *RecorderService) HandleRecording(tabID int, name string, timestamp int64, data []byte, status string) error {
	switch status {
	case "stream":
		rs.activeRecordings.Store(tabID, true)
		if err := rs.fileWriter.WriteChunk(tabID, name, timestamp, data); err != nil {
			log.Printf("ERROR: Failed to write chunk for tab %d: %v", tabID, err)
			return fmt.Errorf("failed to write recording chunk: %w", err)
		}
		return nil

	case "stopped":
		rs.activeRecordings.Delete(tabID)
		if err := rs.fileWriter.CloseFile(tabID); err != nil {
			log.Printf("ERROR: Failed to close file for tab %d: %v", tabID, err)
			return fmt.Errorf("failed to stop recording: %w", err)
		}
		return nil

	default:
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