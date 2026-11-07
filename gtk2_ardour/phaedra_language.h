/*
 * Copyright (C) 2026 Phaedra contributors
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 */

#pragma once

#include <string>
#include <glib.h>
#include <glibmm/miscutils.h>
#include "ardour/ardour.h"
#include "ardour/filesystem_paths.h"

// Store interface language separately from session and window-layout state.
namespace PhaedraLanguage {
inline std::string path ()
{
	return Glib::build_filename (ARDOUR::user_config_directory (), ".interface-language");
}

inline std::string get ()
{
	gchar* contents = nullptr;
	gsize length = 0;
	if (!g_file_get_contents (path ().c_str (), &contents, &length, nullptr)) return "";
	std::string value (contents, length);
	g_free (contents);
	return value == "es" || value == "en" ? value : "";
}

inline bool set (std::string value)
{
	if (!value.empty () && value != "es" && value != "en") return false;
	if (value == get ()) return true;
	if (!g_file_set_contents (path ().c_str (), value.c_str (), value.size (), nullptr)) return false;
	return ARDOUR::set_translations_enabled (true);
}

inline void apply ()
{
	std::string value = get ();
	if (!value.empty ()) g_setenv ("LANGUAGE", value.c_str (), true);
}
}
