/* Phaedra portable launcher: avoid upgrading while the wrapper is running. */
#define UNICODE
#define _UNICODE
#include <windows.h>
#include <wchar.h>
#include <stdio.h>
#include <stdlib.h>
#define PBUF 32768
static int fail(const wchar_t *message) {
    MessageBoxW(NULL, message, L"Phaedra", MB_OK | MB_ICONERROR);
    return 1;
}
static int isfile(const wchar_t *path) {
    DWORD a = GetFileAttributesW(path);
    return a != INVALID_FILE_ATTRIBUTES && !(a & FILE_ATTRIBUTE_DIRECTORY);
}
static int isdir(const wchar_t *path) {
    DWORD a = GetFileAttributesW(path);
    return a != INVALID_FILE_ATTRIBUTES && (a & FILE_ATTRIBUTE_DIRECTORY);
}
static int configure(const wchar_t *root, const wchar_t *bin,
                     const wchar_t *data, const wchar_t *dlls, int preview) {
    wchar_t appdata[PBUF], config[PBUF], fonts[PBUF], gtk[PBUF];
    wchar_t *oldpath = NULL, *newpath = NULL;
    DWORD len, ok;
    len = GetEnvironmentVariableW(L"APPDATA", appdata, PBUF);
    if (!len || len >= PBUF) return 0;
    if (swprintf(config, PBUF, L"%ls\\%ls", appdata, preview ? L"PhaedraPreview8" : L"Phaedra8") < 0 ||
        swprintf(fonts, PBUF, L"%ls\\etc\\fonts\\fonts.conf", root) < 0 ||
        swprintf(gtk, PBUF, L"%ls\\lib", root) < 0) return 0;
    len = GetEnvironmentVariableW(L"PATH", NULL, 0);
    oldpath = (wchar_t *)calloc((size_t)len + 1, sizeof(wchar_t));
    newpath = (wchar_t *)calloc((size_t)len + wcslen(bin) + 3, sizeof(wchar_t));
    if (!oldpath || !newpath) { free(oldpath); free(newpath); return 0; }
    if (len) GetEnvironmentVariableW(L"PATH", oldpath, len);
    swprintf(newpath, (size_t)len + wcslen(bin) + 3, L"%ls;%ls", bin, oldpath);
    ok = SetEnvironmentVariableW(L"PATH", newpath);
    free(oldpath);
    free(newpath);
    return ok && SetEnvironmentVariableW(L"ARDOUR_DATA_PATH", data) &&
        SetEnvironmentVariableW(L"ARDOUR_CONFIG_PATH", config) &&
        SetEnvironmentVariableW(L"ARDOUR_DLL_PATH", dlls) &&
        SetEnvironmentVariableW(L"GTK_PATH", gtk) &&
        SetEnvironmentVariableW(L"FONTCONFIG_FILE", fonts);
}
int WINAPI wWinMain(HINSTANCE h, HINSTANCE previous, PWSTR args, int show) {
    wchar_t root[PBUF], bin[PBUF], exe[PBUF], data[PBUF], dlls[PBUF];
    wchar_t updater[PBUF], tmp[PBUF], tmp_script[PBUF], command[PBUF];
    wchar_t preview_marker[PBUF];
    wchar_t *sep;
    STARTUPINFOW si = {0};
    PROCESS_INFORMATION pi = {0};
    int skip = (args && wcsstr(args, L"--no-update") != NULL);
    int test = (args && wcsstr(args, L"--self-test") != NULL);
    (void)h; (void)previous; (void)show;
    if (!GetModuleFileNameW(NULL, root, PBUF))
        return fail(L"No se pudo localizar Phaedra.exe.");
    sep = wcsrchr(root, L'\\');
    if (!sep) return fail(L"Ruta de instalacion no valida.");
    *sep = L'\0';
    if (swprintf(bin, PBUF, L"%ls\\bin", root) < 0 ||
        swprintf(exe, PBUF, L"%ls\\Phaedra.exe", bin) < 0 ||
        swprintf(data, PBUF, L"%ls\\share\\ardour8", root) < 0 ||
        swprintf(dlls, PBUF, L"%ls\\lib\\ardour8", root) < 0 ||
        swprintf(updater, PBUF, L"%ls\\updater\\updater.ps1", root) < 0)
        return fail(L"Ruta de instalacion demasiado larga.");
    if (swprintf(preview_marker, PBUF, L"%ls\\preview-channel.flag", root) < 0)
        return fail(L"Ruta de preview demasiado larga.");
    if (!isfile(exe) || !isdir(data) || !isdir(dlls))
        return fail(L"Paquete incompleto. Extrae todo el ZIP.");
    if (!configure(root, bin, data, dlls, isfile(preview_marker)))
        return fail(L"No se pudieron configurar las rutas de Phaedra.");
    if (test) return 0;

    /* Spawn temporary update worker, then exit to release our own EXE lock.
       The worker relaunches with --no-update; no network is needed for fallback. */
    if (!skip && isfile(updater)) {
        DWORD n = GetTempPathW(PBUF, tmp);
        if (n && n < PBUF &&
            swprintf(tmp_script, PBUF, L"%lsPhaedraUpdater-%lu.ps1", tmp,
                     (unsigned long)GetCurrentProcessId()) >= 0 &&
            CopyFileW(updater, tmp_script, FALSE) &&
            swprintf(command, PBUF,
                L"powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass "
                L"-File \"%ls\" -PhaedraDir \"%ls\" -ParentPid %lu",
                tmp_script, root, (unsigned long)GetCurrentProcessId()) >= 0) {
            si.cb = sizeof(si);
            if (CreateProcessW(NULL, command, NULL, NULL, FALSE,
                               CREATE_NO_WINDOW, NULL, tmp, &si, &pi)) {
                CloseHandle(pi.hThread);
                CloseHandle(pi.hProcess);
                return 0;
            }
        }
    }
    si.cb = sizeof(si);
    if (swprintf(command, PBUF, L"\"%ls\"", exe) < 0 ||
        !CreateProcessW(exe, command, NULL, NULL, FALSE, 0, NULL, bin, &si, &pi))
        return fail(L"No se pudo iniciar Phaedra. Comprueba las dependencias.");
    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);
    return 0;
}
