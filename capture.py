"""Capture only the selected process tree, with no system-wide fallback."""
from pathlib import Path
import tempfile
import psutil
from process_audio_capture import ProcessAudioCapture


def whatsapp_pid() -> int:
    names = {"whatsapp.exe", "whatsapp.root.exe", "whatsapp.beta.exe"}
    candidates = []
    for process in psutil.process_iter(["name", "ppid"]):
        try:
            if (process.info["name"] or "").lower() in names:
                candidates.append(process)
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    ids = {p.pid for p in candidates}
    roots = [p for p in candidates if p.info["ppid"] not in ids]
    if not roots:
        raise RuntimeError("Open WhatsApp Desktop, then try recording again.")
    if len(roots) != 1:
        raise RuntimeError("More than one WhatsApp app is running. Close the extra app and try again.")
    return roots[0].pid


class Recording:
    def __init__(self, pid: int):
        self.pid = pid
        self._directory = tempfile.TemporaryDirectory(prefix="whatsapp-transcriber-")
        self.path = Path(self._directory.name) / "message.wav"
        self._capture = ProcessAudioCapture(pid, output_path=str(self.path))

    def start(self):
        try:
            self._capture.start()
        except Exception:
            self.close()
            raise

    def stop(self):
        self._capture.stop()
        return self.path

    @property
    def level(self):
        return self._capture.level_db

    @property
    def active(self):
        return self._capture.is_capturing and psutil.pid_exists(self.pid)

    def close(self):
        try:
            self._capture.stop()
        finally:
            self._directory.cleanup()
