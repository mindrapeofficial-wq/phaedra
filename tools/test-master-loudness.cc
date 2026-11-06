// Synthetic checks for the production momentary-only master meter path.
#include "ardour/lufs_meter.h"
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <new>
#include <vector>

namespace ARDOUR { class RCConfiguration; RCConfiguration* Config = nullptr; }
static bool processing = false;
static size_t allocations = 0;
void* operator new (std::size_t size) {
    if (processing) ++allocations;
    if (void* pointer = std::malloc (size)) return pointer;
    throw std::bad_alloc ();
}
void operator delete (void* pointer) noexcept { std::free (pointer); }
void operator delete (void* pointer, std::size_t) noexcept { std::free (pointer); }

static float measure (unsigned rate, unsigned block, unsigned channels, float amplitude) {
    ARDOUR::LUFSMeter meter (rate, channels);
    std::vector<float> audio (rate * 2);
    for (size_t i = 0; i < audio.size (); ++i) audio[i] = amplitude * std::sin (2.0 * 3.141592653589793 * 1000.0 * i / rate);
    for (size_t offset = 0; offset < audio.size (); offset += block) {
        float const* data[] = {audio.data () + offset, audio.data () + offset};
        processing = true;
        meter.run (data, std::min<size_t> (block, audio.size () - offset), true);
        processing = false;
    }
    return meter.momentary ();
}

int main () {
    unsigned checks = 0;
    auto check = [&checks](bool value, char const* message) {
        if (!value) { std::fprintf (stderr, "FAIL: %s\n", message); std::exit (1); }
        ++checks;
    };
    for (unsigned rate : {44100u, 48000u, 96000u}) {
        const float mono = measure (rate, 64, 1, 0.1f);
        const float stereo = measure (rate, 64, 2, 0.1f);
        std::printf ("%u Hz: mono %.3f, stereo %.3f LUFS M\n", rate, mono, stereo);
        check (mono > -24.f && mono < -22.f, "1 kHz mono calibration");
        check (std::fabs ((stereo - mono) - 3.0103f) < 0.02f, "stereo power summation");
        check (std::fabs (measure (rate, 4096, 2, 0.1f) - stereo) < 0.03f, "block partition invariance");
        check (std::fabs (measure (rate, 257, 2, 0.05f) - stereo + 6.0206f) < 0.03f, "gain calibration");
        check (measure (rate, 512, 2, 0.f) < -100.f, "silence");
        ARDOUR::LUFSMeter meter (rate, 2);
        std::vector<float> signal (rate, 0.1f), silence (rate, 0.f);
        for (size_t i=0; i<signal.size (); ++i) signal[i] *= std::sin (2.0 * 3.141592653589793 * 1000.0 * i / rate);
        float const* data[] = {signal.data (), signal.data ()};
        meter.run (data, rate, true);
        float const* zero[] = {silence.data (), silence.data ()};
        meter.run (zero, rate / 2, true);
        check (meter.momentary () < -60.f, "400 ms window clears after silence");
    }
    check (allocations == 0, "audio processing allocated memory");
    std::printf ("%u production loudness checks passed; no processing allocations.\n", checks);
}
