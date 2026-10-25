-- SPDX-License-Identifier: MIT
--
-- Phaedra Meter Suite
-- Copyright (c) 2026 Phaedra contributors.
-- Shared-memory and Cairo rendering patterns adapted from Ardour Community's
-- MIT-licensed ACE Inline Scope and ACE Inline Spectrogram Lua examples.
--
-- A native, source-available visual audio analyzer for Phaedra.  It does not
-- contain any code, resources, presets or trademarks from MiniMeters.
--
-- This is a transparent audio effect: it copies samples to its outputs and
-- feeds an analysis ring buffer. All FFT and display calculations take place
-- in the GUI interpreter, never in the real-time audio callback.
--
-- Scope: sample peak, approximate RMS, stereo phase, waveform, oscilloscope,
-- FFT spectrum and a scrolling spectrogram.  It does NOT report EBU R128 LUFS,
-- true peak or calibrated VU. Those require separate verified DSP.
--
ardour {
    ["type"] = "dsp",
    name = "Phaedra Meter Suite",
    category = "Visualization",
    license = "MIT",
    author = "Phaedra contributors",
    description = [[Free, native multiview audio analyzer: waveform, oscilloscope,
spectrum, spectrogram, stereo image and peak/RMS meters. Insert after the master
fader. Monitoring only; output audio is unmodified.]]
}

function dsp_ioconfig ()
    return {
        { audio_in = 1, audio_out = 1 },
        { audio_in = 2, audio_out = 2 }
    }
end

function dsp_params ()
    return {
        { ["type"] = "input", name = "View", min = 0, max = 6, default = 0,
          enum = true, scalepoints = {
              ["Quad"] = 0, ["Levels"] = 1, ["Waveform"] = 2,
              ["Spectrum"] = 3, ["Spectrogram"] = 4,
              ["Stereo"] = 5, ["Oscilloscope"] = 6
          }
        },
        { ["type"] = "input", name = "FFT Size", min = 0, max = 3, default = 2,
          enum = true, scalepoints = {
              ["512"] = 0, ["1024"] = 1, ["2048"] = 2, ["4096"] = 3
          }
        },
        { ["type"] = "input", name = "Floor", min = -120, max = -20,
          default = -72, unit = "dB" },
        { ["type"] = "input", name = "Waveform Span", min = 0.05, max = 1.8,
          default = 0.4, unit = "sec" },
        { ["type"] = "input", name = "Height", min = 0, max = 2, default = 1,
          enum = true, scalepoints = {
              ["Compact"] = 0, ["Normal"] = 1, ["Max"] = 2
          }
        }
    }
end

local SH_WRITE = 0
local SH_RATE = 1
local SH_FRAMES = 2
local SH_CHANNELS = 3
local SH_AUDIO = 4
local RATE_LIMIT_HZ = 25

local sample_rate = 48000
local ring_frames = 96000
local channels = 2
local since_draw = 0
local samples_per_draw = 1920

function dsp_init (rate)
    sample_rate = math.max (8000, math.floor (rate))
    ring_frames = math.max (8192, math.floor (sample_rate * 2))
    samples_per_draw = math.max (64, math.floor (sample_rate / RATE_LIMIT_HZ))
    since_draw = 0
    local sh = self:shmem ()
    sh:allocate (SH_AUDIO + 2 * ring_frames)
    sh:clear ()
    sh:atomic_set_int (SH_WRITE, 0)
    local cfg = sh:to_int (SH_RATE):array ()
    cfg[1] = sample_rate
    cfg[2] = ring_frames
    cfg[3] = 2
end

function dsp_configure (ins, outs)
    channels = math.min (2, math.max (1, ins:n_audio ()))
    local sh = self:shmem ()
    local cfg = sh:to_int (SH_RATE):array ()
    cfg[1] = sample_rate
    cfg[2] = ring_frames
    cfg[3] = channels
    sh:atomic_set_int (SH_WRITE, 0)
end

-- Copy a contiguous audio interval into two parts of a circular buffer.
-- No allocations, FFT, disk accesses, or UI calls occur in the audio loop.
local function store_audio (sh, dest, input, num, offset, write_pos)
    local first = math.min (num, ring_frames - write_pos)
    if input then
        ARDOUR.DSP.copy_vector (sh:to_float (dest + write_pos),
                                input:data (offset), first)
        if first < num then
            ARDOUR.DSP.copy_vector (sh:to_float (dest),
                                    input:data (offset + first), num - first)
        end
    else
        ARDOUR.DSP.memset (sh:to_float (dest + write_pos), 0, first)
        if first < num then
            ARDOUR.DSP.memset (sh:to_float (dest), 0, num - first)
        end
    end
end

function dsp_runmap (bufs, in_map, out_map, n_samples, offset)
    local sh = self:shmem ()
    local write_pos = sh:atomic_get_int (SH_WRITE)
    -- Typical engine buffers are far shorter than the two-second ring.
    -- Handle unexpectedly large blocks without overrunning the ring.
    local skip = math.max (0, n_samples - ring_frames)
    local kept = n_samples - skip
    local ring_start = (write_pos + skip) % ring_frames

    for channel = 1, channels do
        local ib = in_map:get (ARDOUR.DataType ("audio"), channel - 1)
        local ob = out_map:get (ARDOUR.DataType ("audio"), channel - 1)
        local input = ib ~= ARDOUR.ChanMapping.Invalid and bufs:get_audio (ib) or nil

        store_audio (sh, SH_AUDIO + (channel - 1) * ring_frames,
                     input, kept, offset + skip, ring_start)

        if ob ~= ARDOUR.ChanMapping.Invalid then
            if not input then
                bufs:get_audio (ob):silence (n_samples, offset)
            elseif ib ~= ob then
                ARDOUR.DSP.copy_vector (bufs:get_audio (ob):data (offset),
                                        input:data (offset), n_samples)
            end
        end
    end

    -- Mono: mirror channel L to R so Lissajous/phase remain meaningful.
    if channels == 1 then
        local first = math.min (kept, ring_frames - ring_start)
        ARDOUR.DSP.copy_vector (
            sh:to_float (SH_AUDIO + ring_frames + ring_start),
            sh:to_float (SH_AUDIO + ring_start), first)
        if first < kept then
            ARDOUR.DSP.copy_vector (
                sh:to_float (SH_AUDIO + ring_frames),
                sh:to_float (SH_AUDIO), kept - first)
        end
    end

    sh:atomic_set_int (SH_WRITE, (write_pos + n_samples) % ring_frames)

    since_draw = since_draw + n_samples
    if since_draw >= samples_per_draw then
        since_draw = since_draw % samples_per_draw
        self:queue_draw ()
    end
end

------------------------------------------------------------------
-- Below this line, code runs ONLY in the graphical Lua interpreter.
------------------------------------------------------------------

local fft = nil
local fft_mem = nil
local fft_size = 0
local fft_rate = 0
local history = {}
local history_pos = 0
local HISTORY_FRAMES = 64
local HISTORY_BANDS = 52
local fft_levels = {}
local font = nil

local function clamp (x, a, b)
    return math.max (a, math.min (b, x))
end

local function db_of (linear)
    if linear <= 0 then return -120 end
    return 20 * math.log (linear) / math.log (10)
end

local function channel_sample (mem, frames, channel, pos)
    return mem[1 + (channel - 1) * frames + (pos % frames)] or 0
end

local function span_peaks (sh, frames, channel, start_pos, count)
    -- ARDOUR.DSP.peaks executes in optimized native DSP (not per-sample Lua).
    local offset = SH_AUDIO + (channel - 1) * frames
    local pos = start_pos % frames
    local first = math.min (count, frames - pos)
    if first <= 0 then return 0, 0 end
    local _, lo, hi = table.unpack (ARDOUR.DSP.peaks (
        sh:to_float (offset + pos), 0, 0, first))
    if first < count then
        _, lo, hi = table.unpack (ARDOUR.DSP.peaks (
            sh:to_float (offset), lo, hi, count - first))
    end
    return lo, hi
end

local function panel_bg (ctx, x, y, width, height)
    ctx:set_source_rgba (0.035, 0.047, 0.072, 1)
    ctx:rectangle (x, y, width, height)
    ctx:fill ()
    ctx:set_line_width (1)
    ctx:set_source_rgba (0.18, 0.22, 0.29, 0.9)
    ctx:rectangle (x + .5, y + .5, width - 1, height - 1)
    ctx:stroke ()
end

local function label (ctx, x, y, text, r, g, b)
    if not font then
        font = Cairo.PangoLayout (ctx, "Mono 8px")
    end
    font:set_text (text)
    ctx:set_source_rgba (r or .7, g or .75, b or .8, 1)
    ctx:move_to (x, y)
    font:show_in_cairo_context (ctx)
end

local function layout_panel (ctx, x, y, width, height, title, drawer)
    if width < 4 or height < 4 then return end
    ctx:save ()
    ctx:rectangle (x, y, width, height)
    ctx:clip ()
    panel_bg (ctx, x, y, width, height)
    if height > 28 and width > 55 then
        label (ctx, x + 6, y + 3, title)
    end
    local top = (height > 28 and width > 55) and 14 or 3
    drawer (ctx, x + 5, y + top, width - 10, height - top - 5)
    ctx:restore ()
end

local function draw_waveform (ctx, x, y, width, height, sh, frames, write, rate, span_sec)
    if width <= 3 or height <= 3 then return end
    local span = clamp (math.floor (span_sec * rate), 16, frames - 1)
    local spp = math.max (1, math.floor (span / width))
    local start = (write - spp * width + frames * 2) % frames
    ctx:set_source_rgba (.24, .28, .36, 1)
    ctx:set_line_width (1)
    ctx:move_to (x, y + height * .5)
    ctx:line_to (x + width, y + height * .5)
    ctx:stroke ()
    for channel = 1, 2 do
        if channel == 1 then
            ctx:set_source_rgba (.12, .88, .86, .86)
        else
            ctx:set_source_rgba (.98, .34, .55, .68)
        end
        for px = 0, math.floor (width) - 1 do
            local pos = (start + px * spp) % frames
            local mn, mx = span_peaks (sh, frames, channel, pos, spp)
            local yy1 = y + height * (.5 - .47 * clamp (mx, -1, 1))
            local yy2 = y + height * (.5 - .47 * clamp (mn, -1, 1))
            ctx:move_to (x + px + .5, yy1)
            ctx:line_to (x + px + .5, yy2)
        end
        ctx:stroke ()
    end
end

local function draw_oscilloscope (ctx, x, y, width, height, mem, frames, write, rate)
    if width <= 4 or height <= 4 then return end
    local count = math.max (16, math.floor (rate * .035))
    local step = math.max (1, math.floor (count / width))
    ctx:set_line_width (1)
    ctx:set_source_rgba (.20, .23, .3, 1)
    ctx:move_to (x, y + height * .5)
    ctx:line_to (x + width, y + height * .5)
    ctx:stroke ()
    ctx:set_source_rgba (.3, .96, .78, 1)
    for px = 0, math.floor (width) - 1 do
        local v = .5 * (
            channel_sample (mem, frames, 1, write - count + px * step) +
            channel_sample (mem, frames, 2, write - count + px * step))
        local sy = y + height * (.5 - .46 * clamp (v, -1, 1))
        if px == 0 then ctx:move_to (x, sy)
        else ctx:line_to (x + px, sy) end
    end
    ctx:stroke ()
end

local function ensure_fft (size, rate)
    if fft and fft_size == size and fft_rate == rate then return end
    fft_size = size
    fft_rate = rate
    fft = ARDOUR.DSP.FFTSpectrum (size, rate)
    fft_mem = ARDOUR.DSP.DspShm (size)
    history = {}
    history_pos = 0
    fft_levels = {}
end

local function update_fft (mem, frames, write, rate, size, floor_db)
    ensure_fft (size, rate)
    local arr = fft_mem:to_float (0):array ()
    for i = 0, size - 1 do
        arr[i + 1] = .5 * (
            channel_sample (mem, frames, 1, write - size + i) +
            channel_sample (mem, frames, 2, write - size + i))
    end
    fft:set_data_hann (fft_mem:to_float (0), size, 0)
    fft:execute ()

    local nyquist = rate * .5
    local maxf = math.min (20000, nyquist * .98)
    local floor_span = math.max (12, -floor_db)

    for band = 1, HISTORY_BANDS do
        local f = 20 * (maxf / 20) ^ ((band - 1) / (HISTORY_BANDS - 1))
        local bin = clamp (math.floor (f * size / rate + .5), 1, size / 2 - 1)
        local db = fft:power_at_bin (bin, 1, false)
        if db ~= db or db > 12 then db = -120 end
        fft_levels[band] = clamp ((db - floor_db) / floor_span, 0, 1)
    end

    history_pos = history_pos % HISTORY_FRAMES + 1
    local dest = history[history_pos] or {}
    for i = 1, HISTORY_BANDS do dest[i] = fft_levels[i] end
    history[history_pos] = dest
end

local function draw_spectrum (ctx, x, y, width, height)
    if width <= 4 or height <= 4 then return end
    local bw = width / HISTORY_BANDS
    ctx:set_source_rgba (.19, .23, .31, 1)
    ctx:move_to (x, y + height * .5)
    ctx:line_to (x + width, y + height * .5)
    ctx:stroke ()
    for i = 1, HISTORY_BANDS do
        local v = fft_levels[i] or 0
        if v > 0 then
            ctx:set_source_rgba (.12 + .63 * v, .72 + .12 * v, .90 - .48 * v, .92)
            ctx:rectangle (x + (i - 1) * bw + .5, y + height * (1 - v), math.max (.5, bw - .5), height * v)
            ctx:fill ()
        end
    end
end

local function draw_spectrogram (ctx, x, y, width, height)
    if width <= 4 or height <= 4 then return end
    local bwidth = width / HISTORY_FRAMES
    local bheight = height / HISTORY_BANDS
    for t = 0, HISTORY_FRAMES - 1 do
        local idx = (history_pos - (HISTORY_FRAMES - 1 - t) - 1 + HISTORY_FRAMES * 2) % HISTORY_FRAMES + 1
        local row = history[idx]
        if row then
            for b = 1, HISTORY_BANDS do
                local p = row[b] or 0
                if p > .05 then
                    ctx:set_source_rgba (.12 + .83 * p, .03 + .65 * p * p, .25 + .43 * (1 - p), .94)
                    ctx:rectangle (x + t * bwidth, y + (HISTORY_BANDS - b) * bheight,
                                   math.max (1, bwidth + .2), math.max (1, bheight + .2))
                    ctx:fill ()
                end
            end
        end
    end
end

local function draw_stereo (ctx, x, y, width, height, mem, frames, write)
    if width <= 4 or height <= 4 then return end
    local cx, cy = x + width * .5, y + height * .5
    local radius = math.min (width, height) * .46
    ctx:set_line_width (1)
    ctx:set_source_rgba (.22, .30, .39, 1)
    ctx:move_to (cx - radius, cy)
    ctx:line_to (cx + radius, cy)
    ctx:move_to (cx, cy - radius)
    ctx:line_to (cx, cy + radius)
    ctx:stroke ()

    local sumll, sumrr, sumlr = 0, 0, 0
    for i = 1, 256 do
        local pos = write - i * 8
        local l = channel_sample (mem, frames, 1, pos)
        local r = channel_sample (mem, frames, 2, pos)
        sumll = sumll + l * l
        sumrr = sumrr + r * r
        sumlr = sumlr + l * r
        local vx = clamp ((l - r) * .7071, -1, 1)
        local vy = clamp ((l + r) * .7071, -1, 1)
        ctx:set_source_rgba (.24, .92, .78, .18 + .56 * (1 - i / 256))
        ctx:rectangle (cx + vx * radius, cy - vy * radius, 1.4, 1.4)
        ctx:fill ()
    end
    local correlation = 0
    if sumll * sumrr > 1e-14 then
        correlation = clamp (sumlr / math.sqrt (sumll * sumrr), -1, 1)
    end
    if height > 34 and width > 80 then
        label (ctx, x + 3, y + height - 12, string.format ("PHASE %+.2f", correlation),
               correlation < -.15 and 1 or .55,
               correlation < -.15 and .42 or .9, .78)
    end
end

local function draw_levels (ctx, x, y, width, height, sh, mem, frames, write, rate)
    if width <= 4 or height <= 4 then return end
    local window = clamp (math.floor (.3 * rate), 16, frames - 1)
    local start = (write - window + 2 * frames) % frames
    local bar_height = (height - 4) * .35
    if bar_height < 3 then bar_height = 3 end

    for channel = 1, 2 do
        local low, high = span_peaks (sh, frames, channel, start, window)
        local peak = math.max (math.abs (low), math.abs (high))
        local db = db_of (peak)
        -- Sample 512 uniformly spaced points: a level *estimate*, not LUFS.
        local sum = 0
        local samples = 512
        local step = math.max (1, math.floor (window / samples))
        for i = 1, samples do
            local v = channel_sample (mem, frames, channel, start + (i - 1) * step)
            sum = sum + v * v
        end
        local rms = db_of (math.sqrt (sum / samples))
        local fy = y + (channel - 1) * (bar_height + 6) + 1
        local plot_width = width > 110 and width - 50 or width - 5
        ctx:set_source_rgba (.11, .14, .19, 1)
        ctx:rectangle (x, fy, plot_width, bar_height)
        ctx:fill ()
        local norm = clamp ((db + 60) / 60, 0, 1)
        if db > -1 then ctx:set_source_rgba (.99, .27, .38, 1)
        elseif db > -8 then ctx:set_source_rgba (.99, .75, .28, 1)
        else ctx:set_source_rgba (.20, .85, .72, 1) end
        ctx:rectangle (x + 1, fy + 1, (plot_width - 2) * norm, bar_height - 2)
        ctx:fill ()
        if width > 110 and height > 25 then
            label (ctx, x + plot_width + 5, fy - 1,
                   string.format ("%s%4.0f", channel == 1 and "L" or "R", db))
        end
        if channel == 1 and height > 57 and width > 105 then
            label (ctx, x, y + height - 12,
                   string.format ("Peak %.1f  RMS~ %.1f dBFS", db, rms), .7, .8, .88)
        end
    end
end

function render_inline (ctx, w, max_h)
    if w < 8 or max_h < 8 then return {w, max_h} end
    local sh = self:shmem ()
    local cfg = sh:to_int (SH_RATE):array ()
    local rate = cfg[1] or 0
    local frames = cfg[2] or 0
    if rate < 8000 or frames < 8192 then
        panel_bg (ctx, 0, 0, w, math.min (max_h, 30))
        return {w, math.min (max_h, 30)}
    end

    local ctrl = CtrlPorts:array ()
    local mode = math.floor ((ctrl[1] or 0) + .5)
    local fft_enum = math.floor ((ctrl[2] or 2) + .5)
    local size = 512 * 2 ^ clamp (fft_enum, 0, 3)
    local floor_db = clamp (ctrl[3] or -72, -120, -20)
    local span_sec = clamp (ctrl[4] or .4, .05, 1.8)
    local hmode = math.floor ((ctrl[5] or 1) + .5)
    local wanted = hmode == 0 and 72 or hmode == 2 and w * .8 or w * .52
    local h = math.max (8, math.min (max_h, math.floor (wanted)))

    local write = sh:atomic_get_int (SH_WRITE)
    local mem = sh:to_float (SH_AUDIO):array ()
    if mode == 0 or mode == 3 or mode == 4 then
        update_fft (mem, frames, write, rate, size, floor_db)
    end

    panel_bg (ctx, 0, 0, w, h)

    local function wave (ct, x, y, a, b)
        draw_waveform (ct, x, y, a, b, sh, frames, write, rate, span_sec)
    end
    local function scope (ct, x, y, a, b)
        draw_oscilloscope (ct, x, y, a, b, mem, frames, write, rate)
    end
    local function stereo (ct, x, y, a, b)
        draw_stereo (ct, x, y, a, b, mem, frames, write)
    end
    local function levels (ct, x, y, a, b)
        draw_levels (ct, x, y, a, b, sh, mem, frames, write, rate)
    end

    if mode == 0 then
        local hw = math.floor (w / 2)
        local hh = math.floor (h / 2)
        layout_panel (ctx, 0, 0, hw, hh, "WAVE", wave)
        layout_panel (ctx, hw, 0, w - hw, hh, "FFT", draw_spectrum)
        layout_panel (ctx, 0, hh, hw, h - hh, "STEREO", stereo)
        layout_panel (ctx, hw, hh, w - hw, h - hh, "PEAK", levels)
    elseif mode == 1 then
        layout_panel (ctx, 0, 0, w, h, "PEAK / RMS (dBFS)", levels)
    elseif mode == 2 then
        layout_panel (ctx, 0, 0, w, h, "WAVEFORM", wave)
    elseif mode == 3 then
        layout_panel (ctx, 0, 0, w, h, "SPECTRUM (FFT)", draw_spectrum)
    elseif mode == 4 then
        layout_panel (ctx, 0, 0, w, h, "SPECTROGRAM", draw_spectrogram)
    elseif mode == 5 then
        layout_panel (ctx, 0, 0, w, h, "STEREO / PHASE", stereo)
    elseif mode == 6 then
        layout_panel (ctx, 0, 0, w, h, "OSCILLOSCOPE", scope)
    end
    return {w, h}
end
