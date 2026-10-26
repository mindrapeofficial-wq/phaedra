/* Phaedra Air: original two-band dynamic high-frequency enhancer. */
#include <lv2/core/lv2.h>
#include <math.h>
#include <stdint.h>
#include <stdlib.h>

#define AIR_URI "https://phaedra.arcanumgames.es/plugins/air"
#define PI 3.14159265358979323846

enum { IN_L, IN_R, OUT_L, OUT_R, MID, HIGH, LINK, TRIM, BYPASS, PORT_COUNT };

typedef struct {
    const float* in[2];
    float* out[2];
    const float *mid, *high, *link, *trim, *bypass;
    float low_mid[2], low_high[2], env_mid[2], env_high[2];
    float smooth_mid, smooth_high, smooth_trim;
    float mid_a, high_a, attack_a, release_a, smooth_a;
} Air;

static float clampf(float value, float low, float high) {
    return value < low ? low : (value > high ? high : value);
}

static LV2_Handle instantiate(const LV2_Descriptor* descriptor, double rate,
                              const char* bundle_path, const LV2_Feature* const* features) {
    (void)descriptor; (void)bundle_path; (void)features;
    if (rate < 8000.0 || rate > 384000.0) return NULL;
    Air* self = (Air*)calloc(1, sizeof(Air));
    if (!self) return NULL;
    self->mid_a = 1.0f - expf((float)(-2.0 * PI * 2600.0 / rate));
    self->high_a = 1.0f - expf((float)(-2.0 * PI * 9500.0 / rate));
    self->attack_a = 1.0f - expf((float)(-1.0 / (0.005 * rate)));
    self->release_a = 1.0f - expf((float)(-1.0 / (0.080 * rate)));
    self->smooth_a = 1.0f - expf((float)(-1.0 / (0.010 * rate)));
    return (LV2_Handle)self;
}

static void connect_port(LV2_Handle instance, uint32_t port, void* data) {
    Air* self = (Air*)instance;
    if (!self || port >= PORT_COUNT) return;
    switch (port) {
    case IN_L: self->in[0] = (const float*)data; break;
    case IN_R: self->in[1] = (const float*)data; break;
    case OUT_L: self->out[0] = (float*)data; break;
    case OUT_R: self->out[1] = (float*)data; break;
    case MID: self->mid = (const float*)data; break;
    case HIGH: self->high = (const float*)data; break;
    case LINK: self->link = (const float*)data; break;
    case TRIM: self->trim = (const float*)data; break;
    case BYPASS: self->bypass = (const float*)data; break;
    }
}

static void activate(LV2_Handle instance) {
    Air* self = (Air*)instance;
    for (int ch = 0; ch < 2; ++ch) {
        self->low_mid[ch] = self->low_high[ch] = 0.0f;
        self->env_mid[ch] = self->env_high[ch] = 0.0f;
    }
    self->smooth_mid = self->smooth_high = self->smooth_trim = 0.0f;
}

static void run(LV2_Handle instance, uint32_t count) {
    Air* self = (Air*)instance;
    if (!self || !self->in[0] || !self->in[1] || !self->out[0] || !self->out[1]) return;
    const float target_mid = clampf(self->mid ? *self->mid : 0.0f, 0.0f, 100.0f) * 0.01f;
    const float raw_high = clampf(self->high ? *self->high : 0.0f, 0.0f, 100.0f) * 0.01f;
    const float target_high = self->link && *self->link >= 0.5f ? target_mid : raw_high;
    const float target_trim = clampf(self->trim ? *self->trim : 0.0f, -18.0f, 6.0f);
    const int bypass = self->bypass && *self->bypass >= 0.5f;
    for (uint32_t i = 0; i < count; ++i) {
        self->smooth_mid += self->smooth_a * (target_mid - self->smooth_mid);
        self->smooth_high += self->smooth_a * (target_high - self->smooth_high);
        self->smooth_trim += self->smooth_a * (target_trim - self->smooth_trim);
        const float gain = expf(self->smooth_trim * 0.11512925465f);
        for (int ch = 0; ch < 2; ++ch) {
            const float x = self->in[ch][i];
            const float safe_x = isfinite(x) ? x : 0.0f;
            self->low_mid[ch] += self->mid_a * (safe_x - self->low_mid[ch]);
            self->low_high[ch] += self->high_a * (safe_x - self->low_high[ch]);
            const float mid_band = self->low_high[ch] - self->low_mid[ch];
            const float high_band = safe_x - self->low_high[ch];
            const float mid_level = fabsf(mid_band);
            const float high_level = fabsf(high_band);
            const float am = mid_level > self->env_mid[ch] ? self->attack_a : self->release_a;
            const float ah = high_level > self->env_high[ch] ? self->attack_a : self->release_a;
            self->env_mid[ch] += am * (mid_level - self->env_mid[ch]);
            self->env_high[ch] += ah * (high_level - self->env_high[ch]);
            const float dynamic_mid = 1.0f / (1.0f + 4.0f * self->env_mid[ch]);
            const float dynamic_high = 1.0f / (1.0f + 6.0f * self->env_high[ch]);
            const float wet = safe_x
                + 0.90f * self->smooth_mid * dynamic_mid * mid_band
                + 1.20f * self->smooth_high * dynamic_high * high_band;
            self->out[ch][i] = bypass ? safe_x : wet * gain;
        }
    }
}

static void cleanup(LV2_Handle instance) { free(instance); }

static const LV2_Descriptor descriptor = {
    AIR_URI, instantiate, connect_port, activate, run, NULL, cleanup, NULL
};

LV2_SYMBOL_EXPORT const LV2_Descriptor* lv2_descriptor(uint32_t index) {
    return index == 0 ? &descriptor : NULL;
}
