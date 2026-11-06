"""Deterministic audio/MIDI fixtures for local Pro GUI validation."""
from pathlib import Path
import math
import struct
import wave

root = Path(__file__).resolve().parents[1] / "build" / "lite-port-qa" / "fixtures"
root.mkdir(parents=True, exist_ok=True)
rate = 48000
with wave.open(str(root / "tone-stereo-minus20.wav"), "wb") as output:
    output.setnchannels(2)
    output.setsampwidth(2)
    output.setframerate(rate)
    # 1 s silence, 6 s -20 dBFS sample-peak tone, 1 s silence.
    frames = bytearray()
    for frame in range(rate * 8):
        sample = round(32767 * 0.1 * math.sin(2 * math.pi * 1000 * frame / rate)) if rate <= frame < rate * 7 else 0
        frames.extend(struct.pack("<hh", sample, sample))
    output.writeframes(frames)


def vlq(value):
    result = [value & 0x7f]
    while value >> 7:
        value >>= 7
        result.insert(0, 0x80 | (value & 0x7f))
    return bytes(result)


track = bytearray(b"\x00\xff\x51\x03\x07\xa1\x20")  # 120 BPM
for note in (60, 64, 67, 72):
    track.extend(b"\x00\x90" + bytes([note, 96]))
    track.extend(vlq(480) + b"\x80" + bytes([note, 0]))
track.extend(b"\x00\xff\x2f\x00")
(root / "four-notes.mid").write_bytes(b"MThd" + struct.pack(">IHHH", 6, 0, 1, 480) + b"MTrk" + struct.pack(">I", len(track)) + track)
print(root)
