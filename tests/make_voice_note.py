"""Turn a text-to-speech recording into a WhatsApp-style voice note (mono Ogg Opus at 48 kHz).

Used by the release smoke test: python tests/make_voice_note.py speech.wav note.ogg
"""
import sys

import numpy as np
import soundfile

source, target = sys.argv[1:3]
audio, rate = soundfile.read(source, dtype='float32', always_2d=True)
audio = audio.mean(axis=1)
times = np.arange(int(audio.size * 48000 / rate)) * (rate / 48000)
soundfile.write(target, np.interp(times, np.arange(audio.size), audio).astype(np.float32), 48000,
                format='OGG', subtype='OPUS')
print(target, soundfile.info(target).subtype, soundfile.info(target).samplerate)
