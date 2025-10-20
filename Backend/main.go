package main

import (
	"embed"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"recorder/handlers"
	"recorder/services"

	"github.com/sqweek/dialog"
	webview "github.com/webview/webview_go"
)

//go:embed ui/*
var uiFiles embed.FS

const (
	downloadDir = "./recordings"
	logDir      = "./logs"
)

func getServerPort() string {
	if port := os.Getenv("SERVER_PORT"); port != "" {
		return port
	}
	return "8080"
}

var (
	serverStarted = make(chan bool, 1)
	fileWriter    *services.FileWriterService
)

func main() {
	if err := services.InitLogger(logDir); err != nil {
		log.Fatalf("Failed to initialize logger: %v", err)
	}
	defer services.CloseLogger()

	serverPort := getServerPort()
	services.LogInfo("Application starting...")
	services.LogInfo("Server port: %s", serverPort)
	services.LogInfo("Log directory: %s", logDir)
	services.LogInfo("Recordings directory: %s", downloadDir)

	stats := services.NewStats(downloadDir)
	fileWriter = services.NewFileWriterService(downloadDir, stats)
	recorder := services.NewRecorderService(fileWriter, stats)

	recordingsHandler := handlers.NewRecordingsHandler(recorder)
	configHandler := handlers.NewConfigHandler(fileWriter)
	statsHandler := handlers.NewStatsHandler(recorder, fileWriter)

	http.Handle("/ui/", http.FileServer(http.FS(uiFiles)))
	http.HandleFunc("/api/health", handlers.CORSMiddleware(handlers.HealthHandler))
	http.HandleFunc("/api/recordings", handlers.CORSMiddleware(recordingsHandler.Handle))
	http.HandleFunc("/api/config", handlers.CORSMiddleware(configHandler.Handle))
	http.HandleFunc("/api/stats", handlers.CORSMiddleware(statsHandler.Handle))

	go startServer(serverPort)

	launchUI(serverPort)
}

func startServer(port string) {
	log.Printf("Server starting on http://localhost:%s", port)
	serverStarted <- true

	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatal(err)
	}
}

func launchUI(port string) {
	<-serverStarted
	time.Sleep(100 * time.Millisecond)

	w := webview.New(false)
	if w == nil {
		log.Fatal("Failed to create webview instance")
	}
	defer w.Destroy()

	w.SetTitle("Recording Server")
	w.SetSize(1200, 800, webview.HintNone)

	setWindowIcon(w)

	w.Bind("selectDirectory", func() string {
		dir, err := dialog.Directory().Title("Select Download Directory").Browse()
		if err != nil {
			log.Printf("Directory selection error: %v", err)
			return ""
		}
		if dir != "" {
			fileWriter.SetDownloadDir(dir)
			log.Printf("Download directory changed to: %s", dir)
		}
		return dir
	})

	w.Bind("getServerStatus", func() map[string]interface{} {
		return map[string]interface{}{
			"port":        port,
			"downloadDir": downloadDir,
			"running":     true,
		}
	})

	w.Navigate(fmt.Sprintf("http://localhost:%s/ui/index.html", port))
	w.Run()
}