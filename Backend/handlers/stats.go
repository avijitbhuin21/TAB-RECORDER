package handlers

import (
	"encoding/json"
	"net/http"
	"recorder/services"
	"time"
)

type StatsHandler struct {
	recorder   *services.RecorderService
	fileWriter *services.FileWriterService
}

// NewStatsHandler creates a new StatsHandler with the specified RecorderService and FileWriterService.
func NewStatsHandler(recorder *services.RecorderService, fileWriter *services.FileWriterService) *StatsHandler {
	return &StatsHandler{
		recorder:   recorder,
		fileWriter: fileWriter,
	}
}

// Handle responds to GET requests with recording statistics including active sessions,
// total size, session count, and detailed information for each active recording session.
func (sh *StatsHandler) Handle(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	activeRecordings := sh.recorder.GetActiveRecordings()
	persistentStats := sh.fileWriter.GetStats()
	sessionInfos := sh.recorder.GetAllSessionInfo()
	
	sessions := make([]map[string]interface{}, 0, len(sessionInfos))
	for _, info := range sessionInfos {
		if info == nil {
			continue
		}
		duration := int64(time.Since(info.StartTime).Seconds())
		sessions = append(sessions, map[string]interface{}{
			"tabId":        info.TabID,
			"name":         info.Name,
			"startTime":    info.StartTime.Format("2006-01-02 15:04:05"),
			"durationSec":  duration,
			"bytesWritten": info.BytesWritten,
			"sizeMB":       float64(info.BytesWritten) / (1024 * 1024),
		})
	}
	
	stats := map[string]interface{}{
		"activeRecordings": len(activeRecordings),
		"activeTabs":       activeRecordings,
		"totalSizeMB":      float64(persistentStats.GetTotalSize()) / (1024 * 1024),
		"totalSessions":    persistentStats.GetTotalSessions(),
		"sessions":         sessions,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}