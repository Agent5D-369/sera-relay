import sys
import unittest
if sys.platform != 'win32':
    raise unittest.SkipTest('Playback capture and global hotkeys are Windows-only.')
import ctypes
from ctypes import wintypes
from pathlib import Path
import sys
import tempfile
import time
import tkinter as tk
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import App, HOTKEY_ID, user32


class FakeModel:
    def transcribe(self, path):
        return "The meeting is tomorrow."


class FakeRecording:
    level = -20
    active = True
    closed = False

    def __init__(self, pid):
        self.pid = pid

    def start(self):
        pass

    def stop(self):
        return Path("test.wav")

    def close(self):
        self.closed = True


class AppTests(unittest.TestCase):
    def wait_for(self, condition):
        deadline = time.monotonic() + 5
        while not condition() and time.monotonic() < deadline:
            self.root.update()
            time.sleep(0.02)
        self.assertTrue(condition())

    def setUp(self):
        register = user32.RegisterHotKey
        # The installed companion may own Ctrl+Alt+T; isolate the test shortcut.
        self.patches = [patch("app.Transcriber", return_value=FakeModel()),
                        patch("app.whatsapp_pid", return_value=123),
                        patch("app.Recording", FakeRecording),
                        patch("app.user32.RegisterHotKey", side_effect=lambda hwnd, identifier, modifiers, key:
                              register(hwnd, identifier, modifiers, 0x87))]
        for item in self.patches:
            item.start()
        self.root = tk.Tk()
        self.root.withdraw()
        self.app = App(self.root)
        self.wait_for(lambda: self.app.state == "ready")

    def tearDown(self):
        self.app.close()
        time.sleep(0.06)  # Let the hotkey thread release its Windows registration.
        for item in self.patches:
            item.stop()

    def test_hotkey_record_transcribe_copy_save_and_cleanup(self):
        self.assertTrue(self.app.hotkey, "Ctrl+Alt+T is already registered by another app")
        native_kernel = ctypes.WinDLL("kernel32")
        native_kernel.GetCurrentThreadId.restype = wintypes.DWORD
        user32.PostThreadMessageW.argtypes = [wintypes.DWORD, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]
        # Exercise the real Windows hotkey message and Tk event loop.
        user32.PostThreadMessageW(self.app.hotkey_thread_id, 0x0312, HOTKEY_ID, 0)
        self.wait_for(lambda: self.app.state == "recording")
        recording = self.app.recording
        user32.PostThreadMessageW(self.app.hotkey_thread_id, 0x0312, HOTKEY_ID, 0)
        self.wait_for(lambda: self.app.state == "ready" and self.app.recording is None)
        self.assertEqual(self.app.text.get("1.0", "end-1c"), "The meeting is tomorrow.")
        self.assertTrue(recording.closed)
        self.app.copy()
        self.assertEqual(self.root.clipboard_get(), "The meeting is tomorrow.")
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "transcript.txt"
            with patch("app.filedialog.asksaveasfilename", return_value=str(path)):
                self.app.save()
            self.assertEqual(path.read_text(encoding="utf-8"), "The meeting is tomorrow.")

    def test_recording_error_allows_retry_and_keeps_previous_text(self):
        self.app.show_transcript("Previous transcript")
        with patch("app.whatsapp_pid", side_effect=RuntimeError("Open WhatsApp Desktop")):
            self.app.toggle()
            self.wait_for(lambda: self.app.state == "ready")
        self.assertEqual(self.app.status.get(), "Open WhatsApp Desktop")
        self.assertEqual(self.app.text.get("1.0", "end-1c"), "Previous transcript")
        self.assertEqual(str(self.app.record_button["state"]), "normal")


if __name__ == "__main__":
    unittest.main()
