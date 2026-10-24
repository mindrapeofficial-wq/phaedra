/*
 * Copyright (C) 2005-2007 Doug McLain <doug@nostar.net>
 * Copyright (C) 2005-2017 Tim Mayberry <mojofunk@gmail.com>
 * Copyright (C) 2005-2019 Paul Davis <paul@linuxaudiosystems.com>
 * Copyright (C) 2005 Karsten Wiese <fzuuzf@googlemail.com>
 * Copyright (C) 2005 Taybin Rutkin <taybin@taybin.com>
 * Copyright (C) 2006-2015 David Robillard <d@drobilla.net>
 * Copyright (C) 2007-2012 Carl Hetherington <carl@carlh.net>
 * Copyright (C) 2008-2010 Sakari Bergen <sakari.bergen@beatwaves.net>
 * Copyright (C) 2012-2019 Robin Gareus <robin@gareus.org>
 * Copyright (C) 2013-2015 Colin Fletcher <colin.m.fletcher@googlemail.com>
 * Copyright (C) 2013-2016 John Emmas <john@creativepost.co.uk>
 * Copyright (C) 2013-2016 Nick Mainsbridge <mainsbridge@gmail.com>
 * Copyright (C) 2014-2018 Ben Loftis <ben@harrisonconsoles.com>
 * Copyright (C) 2015 André Nusser <andre.nusser@googlemail.com>
 * Copyright (C) 2016-2018 Len Ovens <len@ovenwerks.net>
 * Copyright (C) 2017 Johannes Mueller <github@johannes-mueller.org>
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
#include "gtk2ardour-version.h"
#endif

#include "pbd/openuri.h"

#include "ardour_message.h"
#include "ardour_ui.h"

#include "pbd/i18n.h"

using namespace ARDOUR;
using namespace PBD;
using namespace Gtk;
using namespace std;

// Phaedra support is provided through the project issue tracker.
void
ARDOUR_UI::launch_chat ()
{
	PBD::open_uri ("https://github.com/mindrapeofficial-wq/phaedra/issues");
}

void
ARDOUR_UI::launch_tutorial ()
{
	PBD::open_uri ("https://github.com/mindrapeofficial-wq/phaedra#readme");
}

void
ARDOUR_UI::launch_reference ()
{
	PBD::open_uri ("https://github.com/mindrapeofficial-wq/phaedra#readme");
}

void
ARDOUR_UI::launch_tracker ()
{
	PBD::open_uri ("https://github.com/mindrapeofficial-wq/phaedra/issues");
}

void
ARDOUR_UI::launch_subscribe ()
{
	PBD::open_uri ("https://github.com/mindrapeofficial-wq/phaedra/releases");
}

void
ARDOUR_UI::launch_website ()
{
	PBD::open_uri ("https://github.com/mindrapeofficial-wq/phaedra");
}

void
ARDOUR_UI::launch_website_dev ()
{
	PBD::open_uri ("https://github.com/mindrapeofficial-wq/phaedra");
}

void
ARDOUR_UI::launch_forums ()
{
	PBD::open_uri ("https://github.com/mindrapeofficial-wq/phaedra/issues");
}

void
ARDOUR_UI::launch_howto_report ()
{
	PBD::open_uri ("https://github.com/mindrapeofficial-wq/phaedra/issues");
}

