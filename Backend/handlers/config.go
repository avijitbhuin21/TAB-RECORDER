package handlers

import (
	"encoding/json"
	"log"
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
	if r.Method == "POST" {
		var config struct {
			Path string `json:"path"`
		}

		if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
			log.Printf("ERROR: Failed to decode config request: %v", err)
			http.Error(w, "Invalid request format", http.StatusBadRequest)
			return
		}

		if config.Path != "" {
			h.fileWriter.SetDownloadDir(config.Path)
			log.Printf("Download directory updated to: %s", config.Path)
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "updated"})
		return
	}

	http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
}