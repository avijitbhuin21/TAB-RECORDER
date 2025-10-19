//go:build windows
// +build windows

package main

import (
	"syscall"
	"unsafe"

	webview "github.com/webview/webview_go"
)

var (
	kernel32         = syscall.NewLazyDLL("kernel32.dll")
	user32           = syscall.NewLazyDLL("user32.dll")
	shell32          = syscall.NewLazyDLL("shell32.dll")
	getModuleHandle  = kernel32.NewProc("GetModuleHandleW")
	getModuleFileName = kernel32.NewProc("GetModuleFileNameW")
	loadImage        = user32.NewProc("LoadImageW")
	sendMessage      = user32.NewProc("SendMessageW")
	getWindow        = user32.NewProc("GetWindow")
	findWindow       = user32.NewProc("FindWindowW")
	enumWindows      = user32.NewProc("EnumWindows")
	getWindowThreadProcessId = user32.NewProc("GetWindowThreadProcessId")
	getCurrentProcessId = kernel32.NewProc("GetCurrentProcessId")
	extractIcon      = shell32.NewProc("ExtractIconW")
)

const (
	IMAGE_ICON     = 1
	LR_DEFAULTSIZE = 0x0040
	LR_LOADFROMFILE = 0x0010
	WM_SETICON     = 0x0080
	ICON_SMALL     = 0
	ICON_BIG       = 1
	GW_OWNER       = 4
)

func setWindowIcon(w webview.WebView) {
	hwnd := findWebViewWindowByTitle("Recording Server")
	if hwnd == 0 {
		hwnd = findWebViewWindow()
	}
	
	if hwnd == 0 {
		return
	}

	hInstance, _, _ := getModuleHandle.Call(0)
	if hInstance == 0 {
		return
	}

	exePath := make([]uint16, 260)
	getModuleFileName.Call(hInstance, uintptr(unsafe.Pointer(&exePath[0])), 260)

	hIcon, _, _ := extractIcon.Call(hInstance, uintptr(unsafe.Pointer(&exePath[0])), 0)
	if hIcon != 0 && hIcon != 1 {
		sendMessage.Call(hwnd, WM_SETICON, ICON_SMALL, hIcon)
		sendMessage.Call(hwnd, WM_SETICON, ICON_BIG, hIcon)
		return
	}

	iconPath, _ := syscall.UTF16PtrFromString("ui/favicon.ico")
	hIconFromFile, _, _ := loadImage.Call(
		0,
		uintptr(unsafe.Pointer(iconPath)),
		IMAGE_ICON,
		32,
		32,
		LR_LOADFROMFILE|LR_DEFAULTSIZE,
	)
	if hIconFromFile != 0 {
		sendMessage.Call(hwnd, WM_SETICON, ICON_SMALL, hIconFromFile)
		sendMessage.Call(hwnd, WM_SETICON, ICON_BIG, hIconFromFile)
	}
}

func findWebViewWindowByTitle(title string) uintptr {
	titlePtr, _ := syscall.UTF16PtrFromString(title)
	hwnd, _, _ := findWindow.Call(0, uintptr(unsafe.Pointer(titlePtr)))
	return hwnd
}

func findWebViewWindow() uintptr {
	currentPID, _, _ := getCurrentProcessId.Call()
	
	var targetHwnd uintptr
	
	cb := syscall.NewCallback(func(hwnd, lparam uintptr) uintptr {
		var pid uint32
		getWindowThreadProcessId.Call(hwnd, uintptr(unsafe.Pointer(&pid)))
		
		if uintptr(pid) == currentPID {
			owner, _, _ := getWindow.Call(hwnd, GW_OWNER)
			if owner == 0 {
				targetHwnd = hwnd
				return 0
			}
		}
		return 1
	})
	
	enumWindows.Call(cb, 0)
	
	return targetHwnd
}