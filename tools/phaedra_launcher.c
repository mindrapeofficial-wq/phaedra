#include <windows.h>
#include <wchar.h>
#include <stdlib.h>
#include <stdio.h>
static int fail(const wchar_t *message) {
    MessageBoxW(NULL, message, L"Phaedra", MB_OK | MB_ICONERROR);
    return 1;
}
int WINAPI wWinMain(HINSTANCE instance, HINSTANCE previous, PWSTR args, int show) {
    wchar_t root[MAX_PATH], bin[MAX_PATH], exe[MAX_PATH], data[MAX_PATH];
    wchar_t dlls[MAX_PATH], gtk[MAX_PATH], fonts[MAX_PATH], config[MAX_PATH];
    wchar_t vst3_dir[MAX_PATH];
    wchar_t *slash, *appdata = NULL, *path = NULL, *oldpath = NULL;
    wchar_t *oldvst3 = NULL, *vst3_path = NULL;
    DWORD appdata_len, path_len, vst3_len;
    STARTUPINFOW startup = {0};
    PROCESS_INFORMATION process = {0};
    (void)instance; (void)previous; (void)args; (void)show;
    if (!GetModuleFileNameW(NULL, root, MAX_PATH)) return fail(L"No se pudo localizar Phaedra.exe.");
    slash = wcsrchr(root, L'\\');
    if (!slash) return fail(L"No se pudo localizar la carpeta portable.");
    *slash = L'\0';
    swprintf(bin, MAX_PATH, L"%ls\\bin", root);
    swprintf(exe, MAX_PATH, L"%ls\\Phaedra.exe", bin);
    swprintf(data, MAX_PATH, L"%ls\\share\\ardour8", root);
    swprintf(dlls, MAX_PATH, L"%ls\\lib\\ardour8", root);
    swprintf(gtk, MAX_PATH, L"%ls\\lib", root);
    swprintf(fonts, MAX_PATH, L"%ls\\etc\\fonts\\fonts.conf", root);
    swprintf(vst3_dir, MAX_PATH, L"%ls\\Plugins\\VST3", root);
    if (GetFileAttributesW(exe) == INVALID_FILE_ATTRIBUTES ||
        GetFileAttributesW(data) == INVALID_FILE_ATTRIBUTES ||
        GetFileAttributesW(dlls) == INVALID_FILE_ATTRIBUTES)
        return fail(L"Faltan archivos de Phaedra. Extrae el ZIP completo antes de abrirlo.");
    appdata_len = GetEnvironmentVariableW(L"APPDATA", NULL, 0);
    if (!appdata_len) return fail(L"No se pudo localizar la carpeta de configuracion de Windows.");
    appdata = calloc(appdata_len, sizeof(wchar_t));
    if (!appdata) return fail(L"No hay memoria suficiente para iniciar Phaedra.");
    GetEnvironmentVariableW(L"APPDATA", appdata, appdata_len);
    swprintf(config, MAX_PATH, L"%ls\\Phaedra8", appdata);
    free(appdata);
    path_len = GetEnvironmentVariableW(L"PATH", NULL, 0);
    oldpath = calloc(path_len + 1, sizeof(wchar_t));
    path = calloc(wcslen(bin) + path_len + 3, sizeof(wchar_t));
    if (!oldpath || !path) {
        free(oldpath); free(path);
        return fail(L"No hay memoria suficiente para iniciar Phaedra.");
    }
    if (path_len) GetEnvironmentVariableW(L"PATH", oldpath, path_len);
    swprintf(path, wcslen(bin) + path_len + 3, L"%ls;%ls", bin, oldpath);
    SetEnvironmentVariableW(L"PATH", path);
    free(oldpath); free(path);
    // Scan VST3 plugins installed locally for this portable Phaedra copy.
    // Preserve any VST3_PATH that the user has already configured.
    vst3_len = GetEnvironmentVariableW(L"VST3_PATH", NULL, 0);
    if (vst3_len) {
        oldvst3 = calloc(vst3_len, sizeof(wchar_t));
        vst3_path = calloc(wcslen(vst3_dir) + vst3_len + 2, sizeof(wchar_t));
        if (!oldvst3 || !vst3_path) {
            free(oldvst3); free(vst3_path);
            return fail(L"No hay memoria suficiente para configurar los plugins VST3.");
        }
        GetEnvironmentVariableW(L"VST3_PATH", oldvst3, vst3_len);
        swprintf(vst3_path, wcslen(vst3_dir) + vst3_len + 2, L"%ls;%ls", vst3_dir, oldvst3);
        SetEnvironmentVariableW(L"VST3_PATH", vst3_path);
        free(oldvst3); free(vst3_path);
    } else {
        SetEnvironmentVariableW(L"VST3_PATH", vst3_dir);
    }
    SetEnvironmentVariableW(L"ARDOUR_DATA_PATH", data);
    SetEnvironmentVariableW(L"ARDOUR_CONFIG_PATH", config);
    SetEnvironmentVariableW(L"ARDOUR_DLL_PATH", dlls);
    SetEnvironmentVariableW(L"GTK_PATH", gtk);
    SetEnvironmentVariableW(L"FONTCONFIG_FILE", fonts);
    startup.cb = sizeof(startup);
    if (!CreateProcessW(exe, NULL, NULL, NULL, FALSE, 0, NULL, bin, &startup, &process))
        return fail(L"No se pudo iniciar Phaedra. Comprueba que la carpeta portable este completa.");
    CloseHandle(process.hThread);
    CloseHandle(process.hProcess);
    return 0;
}
