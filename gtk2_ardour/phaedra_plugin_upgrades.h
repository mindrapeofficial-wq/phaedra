/*
 * Phaedra's plugin selection policy.
 * This file changes only the new-plugin browser. Existing session plugin IDs
 * and legacy LV2 binaries are intentionally untouched for project recovery.
 *
 * No third-party DSP code or binary is included by this policy.
 */
#pragma once

#include <cstdlib>
#include <string>

#include "ardour/plugin_manager.h"
#include "pbd/convert.h"

namespace PhaedraPlugins {

struct UpgradeRule {
    const char* old_name;
    const char* better_name;
    const char* alternate_name;
};

inline bool
matching_available_plugin (const ARDOUR::PluginInfoList& plugs,
                           ARDOUR::PluginManager& manager,
                           const char* wanted)
{
    if (!wanted || !*wanted) {
        return false;
    }

    for (ARDOUR::PluginInfoList::const_iterator i = plugs.begin(); i != plugs.end(); ++i) {
        if (PBD::downcase ((*i)->name) != PBD::downcase (std::string (wanted))) {
            continue;
        }
        ARDOUR::PluginManager::PluginStatusType status = manager.get_status (*i);
        if (status != ARDOUR::PluginManager::Hidden &&
            status != ARDOUR::PluginManager::Concealed) {
            return true;
        }
    }
    return false;
}

inline bool
has_replacement (ARDOUR::PluginManager& manager, const char* wanted)
{
#ifdef VST3_SUPPORT
    if (matching_available_plugin (manager.vst3_plugin_info (), manager, wanted)) {
        return true;
    }
#endif
#ifdef WINDOWS_VST_SUPPORT
    if (matching_available_plugin (manager.windows_vst_plugin_info (), manager, wanted)) {
        return true;
    }
#endif
#ifdef LXVST_SUPPORT
    if (matching_available_plugin (manager.lxvst_plugin_info (), manager, wanted)) {
        return true;
    }
#endif
#ifdef MACVST_SUPPORT
    if (matching_available_plugin (manager.mac_vst_plugin_info (), manager, wanted)) {
        return true;
    }
#endif
#ifdef AUDIOUNIT_SUPPORT
    if (matching_available_plugin (manager.au_plugin_info (), manager, wanted)) {
        return true;
    }
#endif
    return matching_available_plugin (manager.lv2_plugin_info (), manager, wanted);
}

inline bool
hide_legacy_in_browser (ARDOUR::PluginManager& manager,
                        const ARDOUR::PluginInfoPtr& plugin)
{
    if (plugin->type != ARDOUR::LV2) {
        return false;
    }
    // Escape hatch for power users and troubleshooting:
    // set PHAEDRA_SHOW_LEGACY_PLUGINS=1 before launching.
    const char* show_legacy = std::getenv ("PHAEDRA_SHOW_LEGACY_PLUGINS");
    if (show_legacy && std::string (show_legacy) == "1") {
        return false;
    }
    if (manager.get_status (plugin) == ARDOUR::PluginManager::Favorite) {
        return false;
    }

    static const UpgradeRule rules[] = {
        {"ACE Reasonable Synth", "Vital",                 "Surge XT"},
        {"ACE Fluid Synth",      "Shortcircuit XT",       "ShortcircuitXT"},
        {"ACE EQ",               "ZamDynamicEQ",          "ZamEQ2"},
        {"ACE Compressor",       "ZamCompX2",             "ZamComp"},
        {"ACE Expander",         "ZamGateX2",             "ZamGate"},
        {"ACE Reverb",           "Dragonfly Hall Reverb", "ZamVerb"},
        {"ACE Delay",            "ZamDelay",              "ZamEcho"},
        {"ACE Vapor",            "BinauralDecoder",       "StereoEncoder"}
    };

    for (const UpgradeRule& rule : rules) {
        if (PBD::downcase (plugin->name) == PBD::downcase (std::string (rule.old_name))) {
            return has_replacement (manager, rule.better_name) ||
                   has_replacement (manager, rule.alternate_name);
        }
    }
    return false;
}
}
