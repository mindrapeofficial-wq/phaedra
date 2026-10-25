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

/* Phaedra support destinations. Keep these centralized so the application
 * does not accidentally send Phaedra users to Ardour's project channels.
 *
 * The IRC channel is a live third-party community room, not a server
 * operated by Phaedra. It still needs ChanServ registration by the owner.
 */
namespace {
const char* const phaedra_chat_url =
    "https://web.libera.chat/?nick=PhaedraGuest?#phaedra-daw";
const char* const phaedra_website_url = "https://phaedra-daw.vercel.app/";
const char* const phaedra_getting_started_url =
    "https://github.com/mindrapeofficial-wq/phaedra/blob/preview/live/docs/phaedra/primeros-pasos.md";
const char* const phaedra_manual_url =
    "https://github.com/mindrapeofficial-wq/phaedra/blob/preview/live/docs/phaedra/manual.md";
const char* const phaedra_reporting_url =
    "https://github.com/mindrapeofficial-wq/phaedra/blob/preview/live/docs/phaedra/reportar-error.md";
const char* const phaedra_issues_url =
    "https://github.com/mindrapeofficial-wq/phaedra/issues";
const char* const phaedra_new_issue_url =
    "https://github.com/mindrapeofficial-wq/phaedra/issues/new";
const char* const phaedra_source_url =
    "https://github.com/mindrapeofficial-wq/phaedra";

/* PBD::open_uri uses the OS default browser on Windows and other hosts.
 * Report errors instead of showing a blank success message on failure.
 */
void open_phaedra_support_url (const char* url)
{
    if (!PBD::open_uri (url)) {
        ArdourMessageDialog dialog (_("Unable to open the browser."), true);
        dialog.set_title (_("Phaedra Help"));
        dialog.set_secondary_text (
            std::string (_("Open this address manually:\\n")) + url);
        dialog.run ();
    }
}
}

void
ARDOUR_UI::launch_chat ()
{
    /* One click goes straight to the room with a suggested guest nickname.
     * The web client asks the user to connect, no sign-up is required.
     */
    open_phaedra_support_url (phaedra_chat_url);
}

void
ARDOUR_UI::launch_tutorial ()
{
    open_phaedra_support_url (phaedra_getting_started_url);
}

void
ARDOUR_UI::launch_reference ()
{
    open_phaedra_support_url (phaedra_manual_url);
}

void
ARDOUR_UI::launch_tracker ()
{
    open_phaedra_support_url (phaedra_new_issue_url);
}

void
ARDOUR_UI::launch_subscribe ()
{
    /* Phaedra is currently free; there is no subscriptions destination. */
    open_phaedra_support_url (phaedra_website_url);
}

void
ARDOUR_UI::launch_website ()
{
    open_phaedra_support_url (phaedra_website_url);
}

void
ARDOUR_UI::launch_website_dev ()
{
    open_phaedra_support_url (phaedra_source_url);
}

void
ARDOUR_UI::launch_forums ()
{
    /* GitHub Discussions is not enabled. Label this option as support,
     * and use GitHub Issues rather than a nonexistent forum.
     */
    open_phaedra_support_url (phaedra_issues_url);
}

void
ARDOUR_UI::launch_howto_report ()
{
    open_phaedra_support_url (phaedra_reporting_url);
}
