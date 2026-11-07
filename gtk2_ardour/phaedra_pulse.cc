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
 *
 * You should have received a copy of the GNU General Public License along
 * with this program; if not, write to the Free Software Foundation, Inc.,
 * 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
 */

#ifdef WAF_BUILD
#include "gtk2ardour-config.h"
#endif

#include <sstream>
#include <vector>

#include <glib.h>
#include <glibmm/main.h>

#ifdef PLATFORM_WINDOWS
#include <windows.h>
#include <ydk/gdkwin32.h>
#endif

#include "phaedra_pulse.h"

#include "pbd/i18n.h"

PhaedraPulse::PhaedraPulse ()
	: _status (_("Pulse | Select Phaedra's output device in Pulse settings"))
{
	set_size_request (-1, 220);
	_status.set_alignment (0.0, 0.5);
	pack_start (_status, false, false, 4);
	pack_start (_surface, true, true);
	_surface.set_size_request (-1, 180);
	_status.show ();
	_surface.show ();
	_timer = Glib::signal_timeout ().connect (sigc::mem_fun (*this, &PhaedraPulse::tick), 100);
}

PhaedraPulse::~PhaedraPulse ()
{
	_timer.disconnect ();
	geometry ("EXIT");
#ifdef PLATFORM_WINDOWS
	/* The bridge owns Pulse's Job Object and also watches this
	 * application's PID. Do not block the GTK shutdown path waiting
	 * for another process. */
	if (_process) {
		CloseHandle (static_cast<HANDLE> (_process));
	}
#endif
}

void
PhaedraPulse::geometry (std::string const& value)
{
	if (_geometry_file.empty () || value == _last_geometry) {
		return;
	}
	if (g_file_set_contents (_geometry_file.c_str (), value.c_str (), value.size (), nullptr)) {
		_last_geometry = value;
	}
}

bool
PhaedraPulse::tick ()
{
#ifdef PLATFORM_WINDOWS
	if (_failed) {
		return false;
	}

	if (!gtk_widget_get_mapped (GTK_WIDGET (_surface.gobj ()))) {
		/* hidden dock: park the visualizer */
		geometry ("0,0,0,0");
		return true;
	}

	HWND surface = static_cast<HWND> (gdk_win32_drawable_get_handle (_surface.get_window ()->gobj ()));
	if (!surface) {
		return true;
	}

	if (!_process) {
		/* long-path aware: up to 32767 wide characters */
		std::vector<wchar_t> exe (32768);
		DWORD                length = GetModuleFileNameW (nullptr, exe.data (), (DWORD) exe.size ());
		if (!length || length >= exe.size ()) {
			return false;
		}

		/* the application lives in bin/, alongside the bundled bridge */
		std::wstring directory (exe.data (), length);
		directory.erase (directory.find_last_of (L"\\/"));
		const std::wstring bridge = directory + L"\\PulseHost.exe";
		const std::wstring pulse  = directory + L"\\Pulse\\pulse-visualizer.exe";

		if (GetFileAttributesW (bridge.c_str ()) == INVALID_FILE_ATTRIBUTES || GetFileAttributesW (pulse.c_str ()) == INVALID_FILE_ATTRIBUTES) {
			_status.set_text (_("Pulse is not installed: this package needs bin/PulseHost.exe and bin/Pulse."));
			_failed = true;
			return false;
		}

		gchar* filename = g_strdup_printf ("phaedra-pro-pulse-%lu.txt", (unsigned long) GetCurrentProcessId ());
		gchar* path     = g_build_filename (g_get_tmp_dir (), filename, nullptr);
		_geometry_file  = path;
		g_free (path);
		g_free (filename);
		geometry ("0,0,0,0");

		gunichar2* wide = g_utf8_to_utf16 (_geometry_file.c_str (), -1, nullptr, nullptr, nullptr);
		if (!wide) {
			return false;
		}

		/* PulseHost.exe <parent pid> <geometry file> <pulse.exe> <surface hwnd> */
		std::wostringstream command;
		command << L'"' << bridge << L"\" " << GetCurrentProcessId () << L" \""
		        << reinterpret_cast<wchar_t*> (wide) << L"\" \"" << pulse << L"\" "
		        << reinterpret_cast<uintptr_t> (surface);
		g_free (wide);

		std::wstring        line    = command.str ();
		STARTUPINFOW        startup = {};
		PROCESS_INFORMATION process = {};
		startup.cb                  = sizeof (startup);

		if (!CreateProcessW (bridge.c_str (), &line[0], nullptr, nullptr, FALSE, CREATE_NO_WINDOW, nullptr, directory.c_str (), &startup, &process)) {
			_status.set_text (_("Pulse could not start. Check the bundled Pulse installation."));
			_failed = true;
			return false;
		}
		CloseHandle (process.hThread);
		_process = process.hProcess;
	}

	if (WaitForSingleObject (static_cast<HANDLE> (_process), 0) == WAIT_OBJECT_0) {
		_status.set_text (_("Pulse stopped. Reopen Phaedra to restart the visualizer."));
		_failed = true;
		return false;
	}

	RECT bounds;
	if (GetClientRect (surface, &bounds)) {
		std::ostringstream value;
		value << "0,0," << bounds.right << ',' << bounds.bottom;
		geometry (value.str ());
	}
	return true;
#else
	_status.set_text (_("Pulse integration is available in the Windows build."));
	return false;
#endif
}
