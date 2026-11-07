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

#pragma once

#include <string>

#include <sigc++/connection.h>

#include <ytkmm/box.h>
#include <ytkmm/drawingarea.h>
#include <ytkmm/label.h>

/** Dock that hosts the Pulse visualizer.
 *
 * Pulse runs as a separate process (bin/Pulse, started through
 * bin/PulseHost.exe) and is re-parented into this widget's native
 * window. The host reads the surface geometry from a small file that
 * this widget keeps up to date; writing "EXIT" asks it to quit.
 * Windows only; other platforms show a notice.
 */
class PhaedraPulse : public Gtk::VBox
{
public:
	PhaedraPulse ();
	~PhaedraPulse ();

private:
	bool tick ();
	void geometry (std::string const&);

	Gtk::Label       _status;
	Gtk::DrawingArea _surface;
	sigc::connection _timer;
	std::string      _geometry_file;
	std::string      _last_geometry;
	void*            _process = nullptr; /* HANDLE of PulseHost.exe */
	bool             _failed  = false;
};
