package handlers

import (
	"encoding/json"
	"net/http"
	"recorder/services"
)

type StatsHandler struct {
	recorder   *services.RecorderService
	fileWriter *services.FileWriterService
}

func NewStatsHandler(recorder *services.RecorderService, fileWriter *services.FileWriterService) *StatsHandler {
	return &StatsHandler{
		recorder:   recorder,
		fileWriter: fileWriter,
	}
}

func (sh *StatsHandler) Handle(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	activeRecordings := sh.recorder.GetActiveRecordings()
	totalSize := sh.fileWriter.GetTotalRecordedSize()
	
	stats := map[string]interface{}{
		"activeRecordings": len(activeRecordings),
		"activeTabs":       activeRecordings,
		"totalSizeMB":      float64(totalSize) / (1024 * 1024),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}