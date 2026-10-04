"""Sera Relay: Ctrl+Alt+T to start, then stop and transcribe."""
import ctypes
from ctypes import wintypes
import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path
import queue
import threading
import time
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

from capture import Recording, whatsapp_pid
from engine import Transcriber

BASE = Path(__file__).resolve().parent
HOTKEY_ID = 0x571
MAX_SECONDS = 20 * 60
user32 = ctypes.WinDLL("user32", use_last_error=True)
kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
user32.RegisterHotKey.argtypes = [wintypes.HWND, ctypes.c_int, wintypes.UINT, wintypes.UINT]
user32.RegisterHotKey.restype = wintypes.BOOL
user32.UnregisterHotKey.argtypes = [wintypes.HWND, ctypes.c_int]
user32.PeekMessageW.argtypes = [ctypes.POINTER(wintypes.MSG), wintypes.HWND, wintypes.UINT, wintypes.UINT, wintypes.UINT]
user32.PeekMessageW.restype = wintypes.BOOL
kernel32.CreateMutexW.argtypes = [ctypes.c_void_p, wintypes.BOOL, wintypes.LPCWSTR]
kernel32.CreateMutexW.restype = wintypes.HANDLE
kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
kernel32.GetCurrentThreadId.restype = wintypes.DWORD


class App:
    def __init__(self, root):
        self.root = root
        self.events = queue.Queue()
        self.state = "loading"
        self.recording = None
        self.transcriber = None
        self.closing = threading.Event()
        self.started_at = 0
        self.hotkey = False
        self.hotkey_thread_id = None
        root.title("Sera Relay")
        root.geometry("620x510")
        root.minsize(500, 400)
        root.configure(bg="#f4f7f5")
        root.protocol("WM_DELETE_WINDOW", self.close)
        style = ttk.Style(root)
        style.theme_use("clam")
        style.configure("TFrame", background="#f4f7f5")
        style.configure("TLabel", background="#f4f7f5", foreground="#20372c", font=("Segoe UI", 10))
        style.configure("Title.TLabel", font=("Segoe UI", 20, "bold"))
        style.configure("TButton", font=("Segoe UI", 10), padding=(14, 9))
        style.configure("Record.TButton", background="#18794e", foreground="white")
        style.map("Record.TButton", background=[("active", "#11633e"), ("disabled", "#cddbd3")])
        frame = ttk.Frame(root, padding=22)
        frame.pack(fill="both", expand=True)
        ttk.Label(frame, text="Voice message to text", style="Title.TLabel").pack(anchor="w")
        ttk.Label(frame, text="Local transcription. Your audio stays on this computer.").pack(anchor="w", pady=(5, 16))
        ttk.Label(frame, text="1. Start recording, then play the message in WhatsApp.\n2. Stop recording when it finishes. Your transcript appears here.").pack(anchor="w")
        self.shortcut = tk.StringVar(value="Setting up Ctrl + Alt + T...")
        ttk.Label(frame, textvariable=self.shortcut).pack(anchor="w", pady=(8, 14))
        controls = ttk.Frame(frame)
        controls.pack(fill="x")
        self.record_button = ttk.Button(controls, text="Start recording", style="Record.TButton", command=self.toggle, state="disabled")
        self.record_button.pack(side="left")
        self.file_button = ttk.Button(controls, text="Open audio file", command=self.open_file, state="disabled")
        self.file_button.pack(side="left", padx=10)
        self.status = tk.StringVar(value="Loading the local speech model...")
        ttk.Label(frame, textvariable=self.status, wraplength=565).pack(anchor="w", pady=(14, 6))
        self.level = ttk.Progressbar(frame, maximum=60, mode="determinate")
        self.level.pack(fill="x", pady=(0, 12))
        text_frame = ttk.Frame(frame)
        text_frame.pack(fill="both", expand=True)
        self.text = tk.Text(text_frame, wrap="word", font=("Segoe UI", 11), relief="flat", padx=12, pady=12,
                            bg="white", fg="#20372c", insertbackground="#18794e", undo=True)
        self.text.pack(side="left", fill="both", expand=True)
        scrollbar = ttk.Scrollbar(text_frame, command=self.text.yview)
        scrollbar.pack(side="right", fill="y")
        self.text.configure(yscrollcommand=scrollbar.set)
        bottom = ttk.Frame(frame)
        bottom.pack(fill="x", pady=(12, 0))
        self.copy_button = ttk.Button(bottom, text="Copy text", command=self.copy, state="disabled")
        self.copy_button.pack(side="left")
        self.save_button = ttk.Button(bottom, text="Save text", command=self.save, state="disabled")
        self.save_button.pack(side="left", padx=10)
        ttk.Label(bottom, text="Language detected automatically").pack(side="right")
        self._poll_job = self.root.after(60, self.poll)
        self.worker(self.hotkey_loop)
        self.worker(self.load_model)

    def hotkey_loop(self):
        # Tk consumes thread messages, so the hotkey needs its own message queue.
        self.hotkey_thread_id = kernel32.GetCurrentThreadId()
        registered = bool(user32.RegisterHotKey(None, HOTKEY_ID, 0x4003, ord("T")))
        self.events.put(("shortcut", registered))
        if not registered:
            return
        try:
            msg = wintypes.MSG()
            while not self.closing.wait(0.03):
                while user32.PeekMessageW(ctypes.byref(msg), None, 0x0312, 0x0312, 1):
                    if msg.wParam == HOTKEY_ID:
                        self.events.put(("hotkey", None))
        finally:
            user32.UnregisterHotKey(None, HOTKEY_ID)

    def worker(self, operation):
        def run():
            try:
                operation()
            except Exception as error:
                logging.exception("Operation failed")
                self.events.put(("error", str(error)))
        threading.Thread(target=run, daemon=True).start()

    def load_model(self):
        transcriber = Transcriber()
        self.events.put(("loaded", transcriber))

    def set_state(self, state, status):
        self.state = state
        self.status.set(status)
        enabled = state in {"ready", "recording"}
        self.record_button.configure(state="normal" if enabled else "disabled",
                                     text="Stop and transcribe" if state == "recording" else "Start recording")
        self.file_button.configure(state="normal" if state == "ready" else "disabled")
        if state != "recording":
            self.level["value"] = 0

    def toggle(self):
        if self.state == "ready":
            self.set_state("starting", "Connecting to WhatsApp audio...")
            self.worker(self.start_recording)
        elif self.state == "recording":
            self.set_state("transcribing", "Transcribing locally. Please wait...")
            self.worker(self.finish_recording)

    def start_recording(self):
        recording = Recording(whatsapp_pid())
        try:
            recording.start()
            if self.closing.is_set():
                recording.close()
                self.events.put(("closed", None))
                return
            self.events.put(("recording", recording))
        except Exception:
            recording.close()
            raise

    def finish_recording(self):
        recording = self.recording
        try:
            path = recording.stop()
            if not self.closing.is_set():
                self.events.put(("transcript", self.transcriber.transcribe(path)))
        finally:
            recording.close()
            self.events.put(("capture_closed", None))

    def open_file(self):
        if self.state != "ready":
            return
        path = filedialog.askopenfilename(title="Choose a saved voice message", filetypes=[
            ("Audio and video", "*.ogg *.opus *.wav *.mp3 *.m4a *.aac *.flac *.mp4 *.webm *.mkv"), ("All files", "*.*")])
        if path:
            self.set_state("transcribing", "Transcribing locally. Please wait...")
            self.worker(lambda: self.events.put(("transcript", self.transcriber.transcribe(Path(path)))))

    def show_transcript(self, text):
        self.text.delete("1.0", "end")
        self.text.insert("1.0", text)
        self.copy_button.configure(state="normal")
        self.save_button.configure(state="normal")
        self.set_state("ready", "Transcript ready. You can edit, copy, or save it.")
        self.root.deiconify()
        self.root.lift()

    def copy(self):
        text = self.text.get("1.0", "end-1c").strip()
        if text:
            self.root.clipboard_clear()
            self.root.clipboard_append(text)
            self.root.update_idletasks()
            self.status.set("Copied to clipboard.")

    def save(self):
        path = filedialog.asksaveasfilename(title="Save transcript", defaultextension=".txt",
                                          initialfile="Voice message.txt", filetypes=[("Text", "*.txt")])
        if path:
            try:
                Path(path).write_text(self.text.get("1.0", "end-1c"), encoding="utf-8")
                self.status.set("Transcript saved.")
            except OSError as error:
                self.status.set(f"Could not save the transcript: {error}")

    def poll(self):
        while not self.events.empty():
            kind, value = self.events.get_nowait()
            if kind == "shortcut":
                self.hotkey = value
                self.shortcut.set("Ctrl + Alt + T starts and stops recording" if value else
                                  "Shortcut unavailable. Use the recording button below.")
            elif kind == "hotkey" and not self.closing.is_set():
                self.toggle()
            elif kind == "recording":
                self.recording = value
                if self.closing.is_set():
                    self.worker(self.stop_for_close)
                else:
                    self.started_at = time.monotonic()
                    self.set_state("recording", "Recording WhatsApp. Play the message, then press Ctrl + Alt + T again.")
            elif kind == "loaded":
                self.transcriber = value
                self.set_state("ready", "Ready. Start recording before you play the voice message.")
            elif kind == "transcript" and not self.closing.is_set():
                self.show_transcript(value)
            elif kind == "capture_closed":
                self.recording = None
            elif kind == "closed":
                self.destroy()
                return
            elif kind == "error":
                if self.closing.is_set():
                    self.destroy()
                    return
                self.set_state("ready" if self.transcriber else "error", value)
                self.root.deiconify()
                self.root.lift()
        if self.state == "recording" and self.recording:
            elapsed = int(time.monotonic() - self.started_at)
            self.status.set(f"Recording WhatsApp  {elapsed // 60:02}:{elapsed % 60:02}. Stop when the message finishes.")
            self.level["value"] = max(0, min(60, self.recording.level + 60))
            if elapsed >= MAX_SECONDS or not self.recording.active:
                self.toggle()
        if self.closing.is_set() and self.recording is None and self.state != "starting":
            self.destroy()
            return
        self._poll_job = self.root.after(60, self.poll)

    def destroy(self):
        try:
            self.root.after_cancel(self._poll_job)
        except tk.TclError:
            pass
        self.root.destroy()

    def stop_for_close(self):
        try:
            self.recording.close()
        finally:
            self.events.put(("closed", None))

    def close(self):
        if self.closing.is_set():
            return
        self.closing.set()
        self.root.withdraw()
        if self.recording and self.state == "recording":
            self.worker(self.stop_for_close)
        elif self.recording is None and self.state != "starting":
            self.destroy()


def main():
    log = RotatingFileHandler(BASE / "app.log", maxBytes=200_000, backupCount=1, encoding="utf-8")
    logging.basicConfig(handlers=[log], level=logging.WARNING,
                        format="%(asctime)s %(levelname)s %(message)s")
    # A second launch restores the first window instead of registering another shortcut.
    mutex = kernel32.CreateMutexW(None, False, "Local\\SeraRelay-2026")
    if ctypes.get_last_error() == 183:
        user32.FindWindowW.argtypes = [wintypes.LPCWSTR, wintypes.LPCWSTR]
        user32.FindWindowW.restype = wintypes.HWND
        hwnd = user32.FindWindowW(None, "Sera Relay")
        if hwnd:
            user32.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
            user32.SetForegroundWindow.argtypes = [wintypes.HWND]
            user32.ShowWindow(hwnd, 9)
            user32.SetForegroundWindow(hwnd)
        kernel32.CloseHandle(mutex)
        return
    root = tk.Tk()
    application = None
    try:
        application = App(root)
        root.mainloop()
    except Exception:
        logging.exception("Application failed")
        messagebox.showerror("Sera Relay", "The app could not start. Details are in app.log.")
    finally:
        if application:
            application.closing.set()
        if mutex:
            kernel32.CloseHandle(mutex)


if __name__ == "__main__":
    main()
