package services

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type LogLevel int

const (
	DEBUG LogLevel = iota
	INFO
	ERROR
)

type Logger struct {
	file       *os.File
	mu         sync.Mutex
	logDir     string
	maxSize    int64
	currentSize int64
}

var globalLogger *Logger
var loggerOnce sync.Once

func InitLogger(logDir string) error {
	var err error
	loggerOnce.Do(func() {
		globalLogger = &Logger{
			logDir:  logDir,
			maxSize: 10 * 1024 * 1024,
		}
		err = globalLogger.initialize()
	})
	return err
}

func (l *Logger) initialize() error {
	if err := os.MkdirAll(l.logDir, 0755); err != nil {
		return fmt.Errorf("failed to create log directory: %v", err)
	}

	logFileName := fmt.Sprintf("app_%s.log", time.Now().Format("2006-01-02"))
	logPath := filepath.Join(l.logDir, logFileName)

	file, err := os.OpenFile(logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return fmt.Errorf("failed to open log file: %v", err)
	}

	l.file = file

	info, err := file.Stat()
	if err == nil {
		l.currentSize = info.Size()
	}

	l.log(INFO, "Logger initialized successfully")
	return nil
}

func (l *Logger) log(level LogLevel, message string) {
	l.mu.Lock()
	defer l.mu.Unlock()

	if l.file == nil {
		return
	}

	timestamp := time.Now().Format("2006-01-02 15:04:05.000")
	levelStr := ""
	switch level {
	case DEBUG:
		levelStr = "DEBUG"
	case INFO:
		levelStr = "INFO"
	case ERROR:
		levelStr = "ERROR"
	}

	logLine := fmt.Sprintf("[%s] [%s] %s\n", timestamp, levelStr, message)
	
	n, err := l.file.WriteString(logLine)
	if err != nil {
		return
	}
	
	l.file.Sync()
	l.currentSize += int64(n)

	if l.currentSize > l.maxSize {
		l.rotate()
	}
}

func (l *Logger) rotate() {
	if l.file != nil {
		l.file.Close()
	}

	timestamp := time.Now().Format("2006-01-02_15-04-05")
	oldLogName := fmt.Sprintf("app_%s.log", timestamp)
	oldLogPath := filepath.Join(l.logDir, oldLogName)

	currentLogPath := filepath.Join(l.logDir, fmt.Sprintf("app_%s.log", time.Now().Format("2006-01-02")))
	os.Rename(currentLogPath, oldLogPath)

	file, err := os.OpenFile(currentLogPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return
	}

	l.file = file
	l.currentSize = 0
}

func (l *Logger) Close() {
	l.mu.Lock()
	defer l.mu.Unlock()

	if l.file != nil {
		l.file.Close()
		l.file = nil
	}
}

func LogDebug(format string, args ...interface{}) {
	if globalLogger != nil {
		message := fmt.Sprintf(format, args...)
		globalLogger.log(DEBUG, message)
	}
}

func LogInfo(format string, args ...interface{}) {
	if globalLogger != nil {
		message := fmt.Sprintf(format, args...)
		globalLogger.log(INFO, message)
	}
	fmt.Printf(format+"\n", args...)
}

func LogError(format string, args ...interface{}) {
	if globalLogger != nil {
		message := fmt.Sprintf(format, args...)
		globalLogger.log(ERROR, message)
	}
	fmt.Printf("[ERROR] "+format+"\n", args...)
}

func CloseLogger() {
	if globalLogger != nil {
		globalLogger.Close()
	}
}