import sys
import unittest
if sys.platform != 'win32':
    raise unittest.SkipTest('Playback capture and global hotkeys are Windows-only.')
import ctypes
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
import wave

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from capture import Recording, whatsapp_pid
from engine import load_audio, Transcriber


def write_tone(path, frequency, seconds=1.6):
    samples = (np.sin(np.arange(int(48000 * seconds)) * (2 * np.pi * frequency / 48000)) * 0.12)
    pcm = (samples * 32767).astype("<i2")
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(48000)
        wav.writeframes(pcm.tobytes())


def player(path):
    return subprocess.Popen(
        [sys.executable, "-c", "import sys,winsound; print('ready',flush=True); sys.stdin.readline(); winsound.PlaySound(sys.argv[1],winsound.SND_FILENAME); print('done',flush=True); sys.stdin.readline()", str(path)],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, creationflags=subprocess.CREATE_NO_WINDOW,
    )


class AudioTests(unittest.TestCase):
    def test_silence_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "silent.wav"
            with wave.open(str(path), "wb") as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(16000)
                wav.writeframes(bytes(32000))
            with self.assertRaisesRegex(RuntimeError, "No audio was heard"):
                load_audio(path)

    @unittest.skipIf(os.environ.get('CI') == 'true', 'Requires an interactive Windows audio device; run locally')
    def test_only_target_process_audio_is_captured(self):
        with tempfile.TemporaryDirectory() as folder:
            target_file = Path(folder) / "target.wav"
            other_file = Path(folder) / "other.wav"
            write_tone(target_file, 440)
            write_tone(other_file, 1100)
            target = player(target_file)
            other = player(other_file)
            recording = None
            try:
                self.assertEqual(target.stdout.readline().strip(), "ready")
                self.assertEqual(other.stdout.readline().strip(), "ready")
                recording = Recording(target.pid)
                recording.start()
                time.sleep(0.25)
                target.stdin.write("go\n")
                target.stdin.flush()
                other.stdin.write("go\n")
                other.stdin.flush()
                self.assertEqual(target.stdout.readline().strip(), "done")
                self.assertEqual(other.stdout.readline().strip(), "done")
                time.sleep(0.2)
                audio = load_audio(recording.stop())
                spectrum = np.abs(np.fft.rfft(audio))
                frequencies = np.fft.rfftfreq(audio.size, 1 / 16000)
                intended = spectrum[np.abs(frequencies - 440) < 10].max()
                excluded = spectrum[np.abs(frequencies - 1100) < 10].max()
                self.assertGreater(intended, 20)
                self.assertLess(excluded / intended, 0.02, "Other app's audio leaked into capture")
                path = recording.path
                recording.close()
                self.assertFalse(path.exists(), "Temporary voice recording was retained")
            finally:
                if recording:
                    recording.close()
                for process in (target, other):
                    if process.poll() is None:
                        process.stdin.write("exit\n")
                        process.stdin.flush()
                        process.wait(timeout=5)
                    for stream in (process.stdin, process.stdout, process.stderr):
                        stream.close()


if __name__ == "__main__":
    unittest.main()
