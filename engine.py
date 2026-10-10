"""Local multilingual Whisper, using existing models and hidden audio decoding."""
from pathlib import Path
import os
import sys
import subprocess
import numpy as np


class SilentAudio(RuntimeError):
    """The audio decoded fine but holds no sound, so there is nothing to transcribe."""


def load_audio(path: Path) -> np.ndarray:
    result = subprocess.run(
        [os.environ.get('VOICE_FFMPEG', 'ffmpeg'), "-nostdin", "-v", "error", "-i", str(path), "-f", "f32le",
         "-ac", "1", "-ar", "16000", "pipe:1"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False,
        creationflags=subprocess.CREATE_NO_WINDOW, timeout=120,
    )
    if result.returncode:
        raise RuntimeError("The audio could not be read. Try opening a saved voice message instead.")
    audio = np.frombuffer(result.stdout, dtype="<f4").copy()
    if audio.size < 4800 or not np.isfinite(audio).all():
        raise SilentAudio("No usable audio was recorded. Start recording before playing the message.")
    # Reject silence before Whisper can turn it into an invented transcript.
    blocks = audio[:audio.size // 1600 * 1600].reshape(-1, 1600)
    audible = np.flatnonzero(np.sqrt(np.mean(blocks ** 2, axis=1)) > 0.0003)
    if not audible.size:
        raise SilentAudio("No audio was heard. Play the voice message while recording, with WhatsApp unmuted.")
    first = max(0, int(audible[0]) * 1600 - 4800)
    last = min(audio.size, (int(audible[-1]) + 1) * 1600 + 4800)
    return audio[first:last]


class Transcriber:
    def __init__(self):
        import torch
        import whisper
        torch.set_num_threads(8)
        # Never fetch a model or upload voice messages during app use.
        model = Path.home() / ".cache" / "whisper" / "small.pt"
        if getattr(sys, 'frozen', False):
            model = Path(sys._MEIPASS) / 'models' / 'small.pt'
        if not model.is_file():
            raise RuntimeError("The local small Whisper model is missing. Restore small.pt in the Whisper cache.")
        self._gpu = torch.cuda.is_available()
        self._model = whisper.load_model(str(model), device="cuda" if self._gpu else "cpu")

    def transcribe(self, path: Path) -> str:
        audio = load_audio(path)
        result = self._model.transcribe(
            audio, fp16=self._gpu, task="transcribe", verbose=None,
            condition_on_previous_text=False,
        )
        text = result.get("text", "").strip()
        if not text:
            raise RuntimeError("No speech was recognized. Try the saved audio file or replay the message.")
        return text
