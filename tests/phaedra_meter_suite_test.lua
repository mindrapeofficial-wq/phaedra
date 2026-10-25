-- SPDX-License-Identifier: MIT
-- Native Lua DSP smoke tests with intentionally small Ardour/Cairo mock objects.
-- These tests cover syntax, parameter/configuration shape, pass-through,
-- mono/stereo shared memory, and every rendering mode. They do NOT test
-- actual audio-host ABI, calibrated loudness, GPU output or realtime timing.

local function expect (ok, msg)
    if not ok then error (msg or "assertion failed", 2) end
end

local function pointer (mem, index)
    local p = { mem = mem, index = index }
    function p:array ()
        return setmetatable ({}, {
            __index = function (_, i) return mem[index + i - 1] or 0 end,
            __newindex = function (_, i, v) mem[index + i - 1] = v end
        })
    end
    return p
end

local function new_shm (size)
    local s = { m = {}, ints = {}, n = size }
    function s:allocate (n) self.n = n; self.m = {}; self.ints = {} end
    function s:clear () self.m = {}; self.ints = {} end
    function s:atomic_set_int (i, v) self.ints[i] = v end
    function s:atomic_get_int (i) return self.ints[i] or 0 end
    function s:to_int (i) return pointer (self.ints, i) end
    function s:to_float (i) return pointer (self.m, i) end
    return s
end

local function copy (dst, src, n)
    for i = 0, n - 1 do
        dst.mem[dst.index + i] = src.mem[src.index + i] or 0
    end
end

ARDOUR = {
    ChanMapping = { Invalid = -1 },
    DataType = function (typ) expect (typ == "audio"); return typ end,
    DSP = {
        copy_vector = copy,
        memset = function (dst, value, n)
            for i = 0, n - 1 do dst.mem[dst.index + i] = value end
        end,
        DspShm = new_shm,
        peaks = function (p, lo, hi, n)
            for i = 0, n - 1 do
                local v = p.mem[p.index + i] or 0
                lo = math.min (lo, v)
                hi = math.max (hi, v)
            end
            return {0, lo, hi}
        end,
        FFTSpectrum = function (size, rate)
            expect (size >= 512 and size <= 4096)
            expect (rate >= 8000)
            return {
                set_data_hann = function () end,
                execute = function () end,
                power_at_bin = function (_, index)
                    return -24 - index * .003
                end
            }
        end
    }
}

Cairo = {
    PangoLayout = function ()
        return {
            set_text = function () end,
            get_pixel_size = function () return 20, 9 end,
            show_in_cairo_context = function () end
        }
    end
}

ardour = function (desc) _G.descriptor = desc end
local knobs = { 0, 2, -72, .4, 1 }
CtrlPorts = { array = function () return knobs end }

local shared = new_shm (0)
self = {
    shmem = function () return shared end,
    queue_draw = function (obj) obj.n_draws = (obj.n_draws or 0) + 1 end
}
local context = setmetatable ({ calls = 0 }, {
    __index = function (t, name)
        if name == "set_source_rgba" or name == "rectangle" or
           name == "fill" or name == "line_to" or name == "move_to" or
           name == "stroke" or name == "save" or name == "restore" or
           name == "clip" or name == "set_line_width" then
            return function (obj) obj.calls = obj.calls + 1 end
        end
        error ("unsupported Cairo call: " .. tostring (name))
    end
})

dofile ("share/scripts/phaedra_meter_suite.lua")

expect (descriptor.name == "Phaedra Meter Suite")
expect (descriptor.license == "MIT")
expect (#dsp_ioconfig () == 2)
expect (#dsp_params () == 5)

local function channel_count (n)
    return { n_audio = function () return n end }
end
local function audio (samples)
    local buffer = { mem = samples }
    function buffer:data (i) return pointer (self.mem, i) end
    function buffer:silence (n, offset)
        for i = offset, offset + n - 1 do self.mem[i] = 0 end
    end
    return buffer
end
local function buffers (items)
    return { get_audio = function (_, i) return items[i + 1] end }
end
local function channel_map (keys)
    return { get = function (_, _, c) return keys[c + 1] or -1 end }
end

dsp_init (48000)
dsp_configure (channel_count (2), channel_count (2))

local left, right = {}, {}
local left_out, right_out = {}, {}
for i = 0, 511 do
    left[i] = math.sin (2 * math.pi * i / 32) * .75
    right[i] = math.sin (2 * math.pi * i / 24) * .5
    left_out[i] = 9
    right_out[i] = 9
end

dsp_runmap (
    buffers ({audio (left), audio (right), audio (left_out), audio (right_out)}),
    channel_map ({0, 1}), channel_map ({2, 3}), 512, 0)

local ring_frames = shared.ints[2]
local sh_data = shared.m
expect (shared.ints[0] == 512, "audio write pointer mismatch")
expect (shared.ints[1] == 48000, "wrong sample rate")
expect (shared.ints[3] == 2, "wrong stereo count")
for i = 0, 511 do
    expect (math.abs (left[i] - left_out[i]) < .0001,
            "L audio changed by analyzer")
    expect (math.abs (right[i] - right_out[i]) < .0001,
            "R audio changed by analyzer")
    expect (math.abs ((sh_data[4 + i] or 0) - left[i]) < .0001,
            "L ring sample mismatch")
    expect (math.abs ((sh_data[4 + ring_frames + i] or 0) - right[i]) < .0001,
            "R ring sample mismatch")
end

for mode = 0, 6 do
    knobs[1] = mode
    local dims = render_inline (context, 240, 160)
    expect (dims[1] == 240 and dims[2] > 0 and dims[2] <= 160,
            "invalid renderer dimensions for mode " .. mode)
end
expect (context.calls > 250, "renderers did not draw")

-- Mono clips are mirrored in the display ring, not in output audio.
dsp_configure (channel_count (1), channel_count (1))
local mono, mono_out = {}, {}
for i = 0, 63 do mono[i] = i / 80; mono_out[i] = 7 end
dsp_runmap (buffers ({audio (mono), audio (mono_out)}),
            channel_map ({0}), channel_map ({1}), 64, 0)
for i = 0, 63 do
    expect (math.abs (mono_out[i] - mono[i]) < .0001, "mono output modified")
    expect (math.abs ((shared.m[4 + i] or 0) - mono[i]) < .0001, "mono L ring")
    expect (math.abs ((shared.m[4 + ring_frames + i] or 0) - mono[i]) < .0001,
            "mono R ring not mirrored")
end

print ("PASS: Phaedra Meter Suite Lua syntax, 7 views, stereo/mono and audio passthrough")
