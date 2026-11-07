#include <windows.h>
#include <cstdio>
#include <cstring>
#include <cmath>
#include <algorithm>
#include <iterator>
#include "pluginterfaces/base/ipluginbase.h"
#include "pluginterfaces/vst/ivstcomponent.h"
#include "pluginterfaces/vst/ivstaudioprocessor.h"
#include "pluginterfaces/vst/ivsthostapplication.h"
#include "pluginterfaces/vst/ivstevents.h"

using namespace Steinberg;
using namespace Steinberg::Vst;

class TestHost : public IHostApplication {
public:
    tresult PLUGIN_API queryInterface (const TUID iid, void** object) override {
        *object = nullptr;
        if (!std::memcmp (iid, INLINE_UID_OF (IHostApplication), 16) || !std::memcmp (iid, INLINE_UID_OF (FUnknown), 16)) {
            *object = static_cast<IHostApplication*> (this); return kResultOk;
        }
        return kNoInterface;
    }
    uint32 PLUGIN_API addRef () override { return 1; }
    uint32 PLUGIN_API release () override { return 1; }
    tresult PLUGIN_API getName (String128 name) override {
        const char16_t text[] = u"Phaedra Pro QA";
        std::copy (std::begin (text), std::end (text), name); return kResultOk;
    }
    tresult PLUGIN_API createInstance (TUID, TUID, void** object) override { *object = nullptr; return kNoInterface; }
};

class NoteEvents : public IEventList {
public:
    bool enabled = true;
    tresult PLUGIN_API queryInterface (const TUID iid, void** object) override {
        *object = nullptr;
        if (!std::memcmp (iid, INLINE_UID_OF (IEventList), 16) || !std::memcmp (iid, INLINE_UID_OF (FUnknown), 16)) {
            *object = static_cast<IEventList*> (this); return kResultOk;
        }
        return kNoInterface;
    }
    uint32 PLUGIN_API addRef () override { return 1; }
    uint32 PLUGIN_API release () override { return 1; }
    int32 PLUGIN_API getEventCount () override { return enabled ? 1 : 0; }
    tresult PLUGIN_API getEvent (int32 index, Event& event) override {
        if (!enabled || index) return kInvalidArgument;
        event = {};
        event.type = Event::kNoteOnEvent;
        event.noteOn.pitch = 60;
        event.noteOn.velocity = 0.8f;
        event.noteOn.noteId = 1;
        return kResultOk;
    }
    tresult PLUGIN_API addEvent (Event&) override { return kNotImplemented; }
};

static bool render_instrument (IComponent* component, const char* name)
{
    auto check = [] (tresult result, const char* stage) {
        if (result == kResultOk) return true;
        std::fprintf (stderr, "%s failed: %ld\n", stage, static_cast<long> (result));
        return false;
    };
    TestHost host;
    if (!check (component->initialize (&host), "initialize")) return false;
    IAudioProcessor* processor = nullptr;
    if (component->queryInterface (INLINE_UID_OF (IAudioProcessor), reinterpret_cast<void**> (&processor)) != kResultOk) return false;
    SpeakerArrangement stereo = SpeakerArr::kStereo;
    ProcessSetup setup { kRealtime, kSample32, 512, 48000.0 };
    // NIH-plug requires a non-null arrangement pointer even with zero input buses.
    SpeakerArrangement unused_input = 0;
    if (!check (processor->setBusArrangements (&unused_input, 0, &stereo, 1), "setBusArrangements") || !check (processor->setupProcessing (setup), "setupProcessing")) return false;
    component->activateBus (kAudio, kOutput, 0, true);
    component->activateBus (kEvent, kInput, 0, true);
    if (!check (component->setActive (true), "setActive") || !check (processor->setProcessing (true), "setProcessing")) return false;
    float left[512] {}, right[512] {};
    float* channels[] = { left, right };
    AudioBusBuffers output {};
    output.numChannels = 2;
    output.channelBuffers32 = channels;
    NoteEvents events;
    ProcessData data {};
    data.processMode = kRealtime;
    data.symbolicSampleSize = kSample32;
    data.numSamples = 512;
    data.numOutputs = 1;
    data.outputs = &output;
    data.inputEvents = &events;
    float peak = 0.f;
    for (int block = 0; block < 48; ++block) {
        std::fill (left, left + 512, 0.f);
        std::fill (right, right + 512, 0.f);
        output.silenceFlags = 0;
        if (!check (processor->process (data), "process")) return false;
        events.enabled = false;
        for (auto channel : channels) for (int sample = 0; sample < 512; ++sample) {
            if (!std::isfinite (channel[sample])) return false;
            peak = std::max (peak, std::fabs (channel[sample]));
        }
    }
    processor->setProcessing (false);
    component->setActive (false);
    processor->release ();
    component->terminate ();
    std::printf ("Render: %s | 48 stereo blocks | peak %.6f\n", name, peak);
    return std::strcmp (name, "Phaedra FM6") ? peak == 0.f : peak > 0.00001f;
}

int wmain (int argc, wchar_t** argv)
{
    if (argc < 2) return 2;
    for (int arg = 1; arg < argc; ++arg) {
        HMODULE module = LoadLibraryW (argv[arg]);
        if (!module) { std::fprintf (stderr, "LoadLibrary failed: %lu\n", GetLastError ()); return 1; }
        auto init = reinterpret_cast<bool (*)()> (GetProcAddress (module, "InitDll"));
        auto finish = reinterpret_cast<bool (*)()> (GetProcAddress (module, "ExitDll"));
        auto get_factory = reinterpret_cast<IPluginFactory* (*)()> (GetProcAddress (module, "GetPluginFactory"));
        if (!init || !finish || !get_factory || !init ()) return 1;
        IPluginFactory* factory = get_factory ();
        if (!factory) return 1;
        PFactoryInfo vendor {};
        if (factory->getFactoryInfo (&vendor) != kResultOk) return 1;
        int instruments = 0;
        for (int i = 0; i < factory->countClasses (); ++i) {
            PClassInfo info {};
            if (factory->getClassInfo (i, &info) != kResultOk) return 1;
            if (std::strcmp (info.category, "Audio Module Class")) continue;
            IComponent* component = nullptr;
            if (factory->createInstance (info.cid, INLINE_UID_OF (IComponent), reinterpret_cast<void**> (&component)) != kResultOk || !component) return 1;
            if (std::strncmp (info.name, "Phaedra ", 8)) return 1;
            if (!render_instrument (component, info.name)) { std::fprintf (stderr, "VST3 render failed: %s\n", info.name); return 1; }
            std::printf ("PASS: %s | vendor %s | native VST3 component created | CID ", info.name, vendor.vendor);
            for (unsigned char byte : info.cid) std::printf ("%02X", byte);
            std::printf ("\n");
            component->release ();
            ++instruments;
        }
        factory->release ();
        finish ();
        FreeLibrary (module);
        if (instruments != 1) return 1;
    }
    return 0;
}
