/* Phaedra DS: original LV2 de-esser DSP. */
#include <lv2/core/lv2.h>
#include <math.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#define DS_URI "https://phaedra.arcanumgames.es/plugins/ds"
#define TAU 6.2831853071795864769f

enum {
    IN_L, IN_R, OUT_L, OUT_R, THRESHOLD, RANGE, FREQUENCY, ATTACK,
    RELEASE, LOOKAHEAD, LINK, MIX, MODE, PROCESSING, AUDITION, BYPASS,
    REDUCTION, LATENCY, PORT_COUNT
};

typedef struct {
    const float* in[2];
    float* out[2];
    const float *threshold, *range, *frequency, *attack, *release, *lookahead;
    const float *link, *mix, *mode, *processing, *audition, *bypass;
    float *reduction, *latency;
    float detector_low[2], detector_low2[2], split_low[2], env[2], full_env[2];
    float* delay[2];
    uint32_t delay_size, write_index;
    float rate;
} DS;

static float clampf(float x, float lo, float hi) {
    return x < lo ? lo : (x > hi ? hi : x);
}
static float control(const float* port, float fallback, float lo, float hi) {
    const float x = port ? *port : fallback;
    return isfinite(x) ? clampf(x, lo, hi) : fallback;
}
static void clear_state(DS* self) {
    memset(self->detector_low, 0, sizeof(self->detector_low));
    memset(self->detector_low2, 0, sizeof(self->detector_low2));
    memset(self->split_low, 0, sizeof(self->split_low));
    memset(self->env, 0, sizeof(self->env));
    memset(self->full_env, 0, sizeof(self->full_env));
    for (int ch = 0; ch < 2; ++ch)
        memset(self->delay[ch], 0, self->delay_size * sizeof(float));
    self->write_index = 0;
}
static LV2_Handle instantiate(const LV2_Descriptor* descriptor, double rate,
                              const char* bundle_path, const LV2_Feature* const* features) {
    (void)descriptor; (void)bundle_path; (void)features;
    if (rate < 8000.0 || rate > 384000.0) return NULL;
    DS* self = (DS*)calloc(1, sizeof(DS));
    if (!self) return NULL;
    self->rate = (float)rate;
    self->delay_size = (uint32_t)ceil(rate * 0.020) + 2;
    for (int ch = 0; ch < 2; ++ch) {
        self->delay[ch] = (float*)calloc(self->delay_size, sizeof(float));
        if (!self->delay[ch]) {
            free(self->delay[0]); free(self->delay[1]); free(self);
            return NULL;
        }
    }
    return (LV2_Handle)self;
}
static void connect_port(LV2_Handle instance, uint32_t port, void* data) {
    DS* self = (DS*)instance;
    if (!self || port >= PORT_COUNT) return;
    switch (port) {
    case IN_L: self->in[0] = (const float*)data; break;
    case IN_R: self->in[1] = (const float*)data; break;
    case OUT_L: self->out[0] = (float*)data; break;
    case OUT_R: self->out[1] = (float*)data; break;
    case THRESHOLD: self->threshold = (const float*)data; break;
    case RANGE: self->range = (const float*)data; break;
    case FREQUENCY: self->frequency = (const float*)data; break;
    case ATTACK: self->attack = (const float*)data; break;
    case RELEASE: self->release = (const float*)data; break;
    case LOOKAHEAD: self->lookahead = (const float*)data; break;
    case LINK: self->link = (const float*)data; break;
    case MIX: self->mix = (const float*)data; break;
    case MODE: self->mode = (const float*)data; break;
    case PROCESSING: self->processing = (const float*)data; break;
    case AUDITION: self->audition = (const float*)data; break;
    case BYPASS: self->bypass = (const float*)data; break;
    case REDUCTION: self->reduction = (float*)data; break;
    case LATENCY: self->latency = (float*)data; break;
    }
}
static void activate(LV2_Handle instance) {
    DS* self = (DS*)instance;
    if (self) clear_state(self);
}
static void run(LV2_Handle instance, uint32_t count) {
    DS* self = (DS*)instance;
    if (!self || !self->in[0] || !self->in[1] || !self->out[0] || !self->out[1]) return;
    const float threshold_db = control(self->threshold, -28, -60, 0);
    const float range_db = control(self->range, 10, 0, 24);
    const float frequency = fminf(control(self->frequency, 6500, 2000, 16000), self->rate * 0.43f);
    const float attack_ms = control(self->attack, 1, 0.1f, 20);
    const float release_ms = control(self->release, 70, 5, 400);
    const float lookahead_ms = control(self->lookahead, 2, 0, 20);
    const float link = control(self->link, 100, 0, 100) * 0.01f;
    const float mix = control(self->mix, 100, 0, 100) * 0.01f;
    const int voice = control(self->mode, 0, 0, 1) < 0.5f;
    const int split = control(self->processing, 0, 0, 1) >= 0.5f;
    const int audition = (int)(control(self->audition, 0, 0, 2) + 0.5f);
    const int bypass = control(self->bypass, 0, 0, 1) >= 0.5f;
    const float pole = expf(-TAU * frequency / self->rate);
    const float atk = expf(-1.0f / (self->rate * attack_ms * 0.001f));
    const float rel = expf(-1.0f / (self->rate * release_ms * 0.001f));
    const float full_pole = expf(-1.0f / (self->rate * 0.012f));
    const float threshold = expf(threshold_db * 0.11512925464970229f);
    const uint32_t delay = (uint32_t)lroundf(lookahead_ms * 0.001f * self->rate);
    float peak_reduction = 0.0f;
    if (self->latency) *self->latency = (float)delay;
    for (uint32_t i = 0; i < count; ++i) {
        const float raw[2] = { self->in[0][i], self->in[1][i] };
        float x[2], high[2], sensed[2], delayed[2], y[2];
        const uint32_t read = (self->write_index + self->delay_size - delay) % self->delay_size;
        for (int ch = 0; ch < 2; ++ch) {
            x[ch] = isfinite(raw[ch]) ? raw[ch] : 0.0f;
            self->detector_low[ch] = (1.0f-pole)*x[ch] + pole*self->detector_low[ch];
            const float first_high = x[ch] - self->detector_low[ch];
            self->detector_low2[ch] = (1.0f-pole)*first_high + pole*self->detector_low2[ch];
            high[ch] = first_high - self->detector_low2[ch];
            const float magnitude = fabsf(high[ch]);
            self->env[ch] = (magnitude > self->env[ch] ? atk : rel)*self->env[ch]
                          + (1.0f-(magnitude > self->env[ch] ? atk : rel))*magnitude;
            self->full_env[ch] = full_pole*self->full_env[ch] + (1.0f-full_pole)*fabsf(x[ch]);
            const float emphasis = voice
                ? clampf(self->env[ch]/(self->full_env[ch]+0.0001f)-0.25f, 0, 1) : 1.0f;
            sensed[ch] = self->env[ch]*emphasis;
            delayed[ch] = delay == 0 ? x[ch] : self->delay[ch][read];
            self->delay[ch][self->write_index] = x[ch];
        }
        const float linked = fmaxf(sensed[0], sensed[1]);
        for (int ch = 0; ch < 2; ++ch) {
            const float detected = sensed[ch]*(1.0f-link) + linked*link;
            const float db = detected > threshold
                ? fminf(range_db, 20.0f*log10f(detected/threshold)) : 0.0f;
            peak_reduction = fmaxf(peak_reduction, db);
            const float gain = expf(-db*0.11512925464970229f);
            self->split_low[ch] = (1.0f-pole)*delayed[ch] + pole*self->split_low[ch];
            const float wet = split ? self->split_low[ch]
                + (delayed[ch]-self->split_low[ch])*gain : delayed[ch]*gain;
            y[ch] = bypass ? delayed[ch] : audition == 1 ? high[ch]
                : audition == 2 ? delayed[ch]-wet : delayed[ch]+mix*(wet-delayed[ch]);
        }
        self->out[0][i] = y[0];
        self->out[1][i] = y[1];
        self->write_index = (self->write_index+1) % self->delay_size;
    }
    if (self->reduction) *self->reduction = bypass ? 0.0f : peak_reduction;
}
static void cleanup(LV2_Handle instance) {
    DS* self = (DS*)instance;
    if (!self) return;
    free(self->delay[0]); free(self->delay[1]); free(self);
}
static const LV2_Descriptor descriptor = {
    DS_URI, instantiate, connect_port, activate, run, NULL, cleanup, NULL
};
LV2_SYMBOL_EXPORT const LV2_Descriptor* lv2_descriptor(uint32_t index) {
    return index == 0 ? &descriptor : NULL;
}