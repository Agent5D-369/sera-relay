"""Local multilingual Whisper, using existing models and hidden audio decoding."""
from pathlib import Path
import os
import sys
import shutil
import subprocess
import numpy as np

from platform_support import NO_WINDOW

RATE = 16000


class SilentAudio(RuntimeError):
    """The audio decoded fine but holds no sound, so there is nothing to transcribe."""


def resample(audio: np.ndarray, rate: int) -> np.ndarray:
    """Band-limit, then interpolate to 16 kHz. WhatsApp notes decode at 48 kHz, an exact 3:1 step."""
    if rate == RATE or not audio.size:
        return audio
    if rate > RATE:
        # Windowed-sinc low-pass just under the new Nyquist frequency, so nothing aliases into speech.
        cutoff = 0.45 * RATE / rate
        taps = np.arange(-64, 65)
        kernel = 2 * cutoff * np.sinc(2 * cutoff * taps) * np.blackman(taps.size)
        audio = np.convolve(audio, kernel / kernel.sum(), mode='same')
    times = np.arange(int(audio.size * RATE / rate)) * (rate / RATE)
    return np.interp(times, np.arange(audio.size), audio).astype(np.float32)


def decode(path: Path) -> np.ndarray:
    """16 kHz mono float32. libsndfile reads Ogg Opus, WAV, FLAC and MP3; FFmpeg is only a fallback."""
    try:
        import soundfile
        data, rate = soundfile.read(str(path), dtype='float32', always_2d=True)
        return resample(data.mean(axis=1), rate)
    except Exception:
        ffmpeg = os.environ.get('VOICE_FFMPEG') or shutil.which('ffmpeg')
        if not ffmpeg:
            raise RuntimeError("The audio could not be read. Try opening a saved voice message instead.") from None
    result = subprocess.run(
        [ffmpeg, "-nostdin", "-v", "error", "-i", str(path), "-f", "f32le",
         "-ac", "1", "-ar", str(RATE), "pipe:1"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False,
        creationflags=NO_WINDOW, timeout=120,
    )
    if result.returncode:
        raise RuntimeError("The audio could not be read. Try opening a saved voice message instead.")
    return np.frombuffer(result.stdout, dtype="<f4").copy()


def load_audio(path: Path) -> np.ndarray:
    audio = decode(path)
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
