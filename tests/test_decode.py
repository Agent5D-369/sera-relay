from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
import soundfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from engine import RATE, SilentAudio, load_audio, resample


def tone(seconds=2.0, rate=48000, frequency=440.0, level=0.2):
    times = np.arange(int(rate * seconds)) / rate
    return (np.sin(2 * np.pi * frequency * times) * level).astype(np.float32)


class DecodeWithoutFfmpegTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        # No FFmpeg anywhere: the bundled libsndfile must be enough.
        self.no_ffmpeg = patch('engine.shutil.which', return_value=None)
        self.no_ffmpeg.start()
        self.env = patch.dict('os.environ', {'VOICE_FFMPEG': ''})
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.no_ffmpeg.stop()
        self.folder.cleanup()

    def write(self, name, audio, rate, **format):
        path = Path(self.folder.name) / name
        soundfile.write(str(path), audio, rate, **format)
        return path

    def test_whatsapp_style_opus_note_decodes_to_16k_mono(self):
        path = self.write('note.ogg', tone(), 48000, format='OGG', subtype='OPUS')
        audio = load_audio(path)
        self.assertEqual(audio.dtype, np.float32)
        self.assertAlmostEqual(audio.size / RATE, 2.0, delta=0.15)
        # The 440 Hz tone survives resampling at the right pitch.
        spectrum = np.abs(np.fft.rfft(audio[:RATE]))
        self.assertAlmostEqual(int(np.argmax(spectrum)), 440, delta=3)

    def test_stereo_wav_is_mixed_down(self):
        stereo = np.stack([tone(rate=44100), tone(rate=44100)], axis=1)
        audio = load_audio(self.write('note.wav', stereo, 44100))
        self.assertEqual(audio.ndim, 1)
        self.assertAlmostEqual(audio.size / RATE, 2.0, delta=0.15)

    def test_silent_opus_note_is_reported_as_silent(self):
        path = self.write('silent.ogg', np.zeros(48000 * 2, dtype=np.float32), 48000, format='OGG', subtype='OPUS')
        with self.assertRaises(SilentAudio):
            load_audio(path)

    def test_unreadable_file_explains_itself(self):
        path = Path(self.folder.name) / 'broken.ogg'
        path.write_bytes(b'not audio')
        with self.assertRaisesRegex(RuntimeError, 'could not be read'):
            load_audio(path)

    def test_resample_removes_content_above_new_nyquist(self):
        high = resample(tone(frequency=12000), 48000)
        self.assertLess(np.abs(high[RATE // 4:-RATE // 4]).max(), 0.01)


if __name__ == '__main__':
    unittest.main()
