package models

type RecordingData struct {
	Name      string `json:"name"`
	TabID     int    `json:"tabId"`
	Timestamp int64  `json:"timestamp"`
	Data      string `json:"data"`
	Status    string `json:"status"`
}

type ServerConfig struct {
	Port        string `json:"port"`
	DownloadDir string `json:"downloadDir"`
}

type HealthResponse struct {
	Status string `json:"status"`
	Time   string `json:"time"`
}