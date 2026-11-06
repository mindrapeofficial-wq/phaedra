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

/* Phaedra: give every top-level window a dark native frame on Windows,
 * matching the Phaedra Lite chrome. Windows 10 1809+ honours the
 * immersive dark mode attribute; Windows 11 also takes the caption
 * and text colours. Older systems ignore the calls.
 */

#ifdef WAF_BUILD
#include "gtk2ardour-config.h"
#endif

#include <ytk/ytk.h>
#include <ydk/gdkwin32.h>

#include <windows.h>

namespace {

typedef HRESULT (WINAPI *DwmSetWindowAttributeFn) (HWND, DWORD, LPCVOID, DWORD);

DwmSetWindowAttributeFn
dwm_set_window_attribute ()
{
	static bool                    looked_up = false;
	static DwmSetWindowAttributeFn fn        = 0;

	if (!looked_up) {
		looked_up = true;
		HMODULE dwm = LoadLibraryA ("dwmapi.dll");
		if (dwm) {
			fn = (DwmSetWindowAttributeFn) GetProcAddress (dwm, "DwmSetWindowAttribute");
		}
	}
	return fn;
}

void
apply_dark_frame (GtkWidget* widget)
{
	DwmSetWindowAttributeFn set_attr = dwm_set_window_attribute ();
	if (!set_attr || !widget->window) {
		return;
	}

	HWND hwnd = (HWND) gdk_win32_drawable_get_handle (widget->window);
	if (!hwnd) {
		return;
	}

	const BOOL dark = TRUE;
	/* DWMWA_USE_IMMERSIVE_DARK_MODE is 20 (19 before Windows 10 20H1) */
	if (FAILED (set_attr (hwnd, 20, &dark, sizeof (dark)))) {
		set_attr (hwnd, 19, &dark, sizeof (dark));
	}

	/* Windows 11: caption = Phaedra window background (#131217),
	 * caption text = Phaedra text (#D6D6D6). COLORREF is 0x00BBGGRR. */
	const DWORD caption = 0x00171213;
	const DWORD text    = 0x00D6D6D6;
	set_attr (hwnd, 35 /* DWMWA_CAPTION_COLOR */, &caption, sizeof (caption));
	set_attr (hwnd, 36 /* DWMWA_TEXT_COLOR */, &text, sizeof (text));
}

gboolean
on_any_widget_realize (GSignalInvocationHint*, guint n_params, const GValue* params, gpointer)
{
	if (n_params < 1) {
		return TRUE;
	}
	GObject* obj = (GObject*) g_value_get_object (&params[0]);
	if (obj && GTK_IS_WINDOW (obj)) {
		GtkWindow* win = GTK_WINDOW (obj);
		/* menus, tooltips and popups are GTK_WINDOW_POPUP and have no frame */
		if (gtk_window_get_window_type (win) == GTK_WINDOW_TOPLEVEL) {
			apply_dark_frame (GTK_WIDGET (win));
		}
	}
	return TRUE; /* keep the hook installed */
}

} // namespace

void
phaedra_install_dark_window_frames ()
{
	static bool installed = false;
	if (installed) {
		return;
	}
	installed = true;

	/* make sure the GtkWindow class (and its signals) exists */
	g_type_class_unref (g_type_class_ref (GTK_TYPE_WINDOW));

	guint realize_id = g_signal_lookup ("realize", GTK_TYPE_WIDGET);
	if (realize_id) {
		g_signal_add_emission_hook (realize_id, 0, on_any_widget_realize, 0, 0);
	}

	/* windows that were realized before the hook was installed */
	GList* toplevels = gtk_window_list_toplevels ();
	for (GList* l = toplevels; l; l = l->next) {
		GtkWidget* w = GTK_WIDGET (l->data);
		if (GTK_WIDGET_REALIZED (w) && gtk_window_get_window_type (GTK_WINDOW (w)) == GTK_WINDOW_TOPLEVEL) {
			apply_dark_frame (w);
		}
	}
	g_list_free (toplevels);
}
