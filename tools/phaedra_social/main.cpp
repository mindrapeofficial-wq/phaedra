// SPDX-License-Identifier: MIT
// A separate process: no Ardour headers, audio callbacks or native web bridge.
#include <windows.h>
#include <shellapi.h>
#include <shlobj.h>
#include <winhttp.h>
#include <wrl.h>
#include <WebView2.h>

#include <filesystem>
#include <deque>
#include <fstream>
#include <iostream>
#include <iterator>
#include <set>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

using Microsoft::WRL::Callback;
using Microsoft::WRL::ComPtr;
namespace fs = std::filesystem;

namespace {
constexpr wchar_t kWindowClass[] = L"PhaedraSocialPreviewWindow";
constexpr wchar_t kOrigin[] = L"https://phaedra-social.invalid/";
constexpr wchar_t kVirtualHost[] = L"phaedra-social.invalid";
constexpr wchar_t kDefaultFallback[] = L"https://phaedra-chat.vercel.app/";
constexpr UINT kFailureMessage = WM_APP + 1;
constexpr UINT kOpenExternalMessage = WM_APP + 2;
constexpr UINT_PTR kSmokeDeadlineTimer = 1;
constexpr UINT_PTR kSmokeProbeTimer = 2;

struct Options {
    fs::path assets;
    std::wstring fallback = kDefaultFallback;
    bool self_test = false;
    bool ui_smoke_test = false;
};

bool ParseWebUrl(const std::wstring& value, URL_COMPONENTS& parts) {
    if (value.empty() || value.size() > 8192 ||
        value.find_first_of(L"\r\n\t \"\\") != std::wstring::npos) return false;
    parts = {};
    parts.dwStructSize = sizeof(parts);
    parts.dwSchemeLength = parts.dwHostNameLength = parts.dwUserNameLength =
        parts.dwPasswordLength = parts.dwUrlPathLength = parts.dwExtraInfoLength = static_cast<DWORD>(-1);
    if (!WinHttpCrackUrl(value.c_str(), static_cast<DWORD>(value.size()), 0, &parts)) return false;
    return (parts.nScheme == INTERNET_SCHEME_HTTP || parts.nScheme == INTERNET_SCHEME_HTTPS) &&
        parts.dwHostNameLength > 0 && parts.dwUserNameLength == 0 && parts.dwPasswordLength == 0;
}

bool HostEquals(const URL_COMPONENTS& parts, const wchar_t* host) {
    const std::wstring actual(parts.lpszHostName, parts.dwHostNameLength);
    return _wcsicmp(actual.c_str(), host) == 0;
}

bool IsLocalDocument(const std::wstring& value) {
    URL_COMPONENTS parts{};
    return ParseWebUrl(value, parts) && parts.nScheme == INTERNET_SCHEME_HTTPS &&
        parts.nPort == INTERNET_DEFAULT_HTTPS_PORT && HostEquals(parts, kVirtualHost);
}

bool IsSafeFallback(const std::wstring& value) {
    URL_COMPONENTS parts{};
    return ParseWebUrl(value, parts) && (parts.nScheme == INTERNET_SCHEME_HTTPS ||
        HostEquals(parts, L"localhost") || HostEquals(parts, L"127.0.0.1") || HostEquals(parts, L"[::1]"));
}

void OpenExternal(HWND owner, const std::wstring& value) {
    URL_COMPONENTS parts{};
    if (!ParseWebUrl(value, parts) || IsLocalDocument(value)) return;
    const auto result = reinterpret_cast<INT_PTR>(
        ShellExecuteW(owner, L"open", value.c_str(), nullptr, nullptr, SW_SHOWNORMAL));
    if (result <= 32) MessageBoxW(owner, L"No se pudo abrir el navegador predeterminado.",
        L"Phaedra Social", MB_OK | MB_ICONWARNING);
}

fs::path ExecutablePath() {
    std::vector<wchar_t> buffer(32768);
    const DWORD length = GetModuleFileNameW(nullptr, buffer.data(), static_cast<DWORD>(buffer.size()));
    if (length == 0 || length >= buffer.size()) throw std::runtime_error("Cannot resolve executable path");
    return fs::path(std::wstring(buffer.data(), length));
}

// Validate JSON without loading a browser/runtime in --self-test. Only the
// schema version is interpreted natively; endpoints belong to the web client.
class JsonCheck {
public:
    explicit JsonCheck(const std::string& text) : text_(text) {}
    bool Validate() {
        Space();
        if (!Object(0, true)) return false;
        Space();
        return position_ == text_.size() && schema_version_;
    }
private:
    const std::string& text_;
    size_t position_ = 0;
    bool schema_version_ = false;
    void Space() { while (position_ < text_.size() &&
        (text_[position_] == ' ' || text_[position_] == '\n' || text_[position_] == '\r' || text_[position_] == '\t')) ++position_; }
    bool Eat(char value) { Space(); if (position_ < text_.size() && text_[position_] == value) { ++position_; return true; } return false; }
    bool String(std::string* result = nullptr) {
        if (!Eat('"')) return false;
        while (position_ < text_.size()) {
            const unsigned char ch = static_cast<unsigned char>(text_[position_++]);
            if (ch == '"') return true;
            if (ch < 0x20) return false;
            if (ch != '\\') { if (result) result->push_back(static_cast<char>(ch)); continue; }
            if (position_ >= text_.size()) return false;
            const char escaped = text_[position_++];
            if (escaped == 'u') {
                unsigned code = 0;
                for (int i = 0; i < 4; ++i) {
                    if (position_ >= text_.size()) return false;
                    const char hex = text_[position_++];
                    const int digit = hex >= '0' && hex <= '9' ? hex - '0' :
                        hex >= 'a' && hex <= 'f' ? hex - 'a' + 10 : hex >= 'A' && hex <= 'F' ? hex - 'A' + 10 : -1;
                    if (digit < 0) return false;
                    code = code * 16 + static_cast<unsigned>(digit);
                }
                if (result) { result->append("\\u"); result->append(std::to_string(code)); }
            } else {
                if (std::string("\"\\/bfnrt").find(escaped) == std::string::npos) return false;
                if (result) result->push_back(escaped);
            }
        }
        return false;
    }
    bool Number(std::string* result = nullptr) {
        Space();
        const size_t start = position_;
        if (position_ < text_.size() && text_[position_] == '-') ++position_;
        if (position_ >= text_.size()) return false;
        if (text_[position_] == '0') ++position_;
        else {
            if (text_[position_] < '1' || text_[position_] > '9') return false;
            while (position_ < text_.size() && text_[position_] >= '0' && text_[position_] <= '9') ++position_;
        }
        if (position_ < text_.size() && text_[position_] == '.') {
            const size_t fraction = ++position_;
            while (position_ < text_.size() && text_[position_] >= '0' && text_[position_] <= '9') ++position_;
            if (fraction == position_) return false;
        }
        if (position_ < text_.size() && (text_[position_] == 'e' || text_[position_] == 'E')) {
            ++position_;
            if (position_ < text_.size() && (text_[position_] == '+' || text_[position_] == '-')) ++position_;
            const size_t exponent = position_;
            while (position_ < text_.size() && text_[position_] >= '0' && text_[position_] <= '9') ++position_;
            if (exponent == position_) return false;
        }
        if (result) *result = text_.substr(start, position_ - start);
        return true;
    }
    bool Object(unsigned depth, bool root = false) {
        if (depth > 32 || !Eat('{')) return false;
        std::set<std::string> keys;
        if (Eat('}')) return true;
        do {
            std::string key;
            if (!String(&key) || !keys.insert(key).second || !Eat(':')) return false;
            if (root && key == "schemaVersion") {
                std::string version;
                if (!Number(&version) || version != "1") return false;
                schema_version_ = true;
            } else if (!Value(depth + 1)) return false;
            if (Eat('}')) return true;
        } while (Eat(','));
        return false;
    }
    bool Value(unsigned depth) {
        Space();
        if (depth > 32 || position_ >= text_.size()) return false;
        if (text_[position_] == '"') return String();
        if (text_[position_] == '{') return Object(depth);
        if (Eat('[')) {
            if (Eat(']')) return true;
            do { if (!Value(depth + 1)) return false; if (Eat(']')) return true; } while (Eat(','));
            return false;
        }
        for (const std::string literal : {"true", "false", "null"}) {
            if (text_.compare(position_, literal.size(), literal) == 0) { position_ += literal.size(); return true; }
        }
        return Number();
    }
};

void ValidateAssets(const fs::path& assets) {
    if (!fs::is_directory(assets) || assets.wstring().size() >= MAX_PATH)
        throw std::runtime_error("Social assets folder is missing or exceeds WebView2 path limit");
    for (const auto* name : {L"index.html", L"config.json", L"style.css", L"src/app.js",
        L"src/stoat-client.js", L"src/view-model.js", L"assets/mark.svg"}) {
        const fs::path file = assets / name;
        if (!fs::is_regular_file(file) || fs::file_size(file) == 0)
            throw std::runtime_error("Social bundle is incomplete");
    }
    const fs::path config = assets / L"config.json";
    if (fs::file_size(config) > 65536) throw std::runtime_error("Social config exceeds 64 KiB");
    std::ifstream stream(config, std::ios::binary);
    const std::string text((std::istreambuf_iterator<char>(stream)), std::istreambuf_iterator<char>());
    if (text.empty() || !MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, text.data(),
        static_cast<int>(text.size()), nullptr, 0) || !JsonCheck(text).Validate())
        throw std::runtime_error("Social config must be UTF-8 JSON with schemaVersion 1");
}

bool ReadOptions(Options& options, const fs::path& exe) {
    options.assets = exe.parent_path().parent_path() / L"share" / L"phaedra-social";
    int argc = 0;
    LPWSTR* argv = CommandLineToArgvW(GetCommandLineW(), &argc);
    if (!argv) return false;
    bool valid = true;
    for (int i = 1; i < argc && valid; ++i) {
        const std::wstring argument = argv[i];
        if (argument == L"--self-test") options.self_test = true;
        else if (argument == L"--ui-smoke-test") options.ui_smoke_test = true;
        else if (argument == L"--assets" && i + 1 < argc) options.assets = argv[++i];
        else if (argument == L"--fallback-url" && i + 1 < argc) options.fallback = argv[++i];
        else valid = false;
    }
    LocalFree(argv);
    return valid && !(options.self_test && options.ui_smoke_test) && IsSafeFallback(options.fallback);
}

class SocialWindow {
public:
    explicit SocialWindow(Options options, fs::path exe) : options_(std::move(options)), exe_(std::move(exe)) {}
    ~SocialWindow() {
        CloseView();
        if (loader_) FreeLibrary(loader_);
        if (!smoke_profile_.empty()) { std::error_code error; fs::remove_all(smoke_profile_, error); }
    }
    void Shutdown() { CloseView(); }

    bool Create(HINSTANCE instance) {
        exit_code_ = options_.ui_smoke_test ? 12 : 0;
        WNDCLASSEXW wc{sizeof(wc)};
        wc.hInstance = instance;
        wc.lpfnWndProc = WindowProcedure;
        wc.lpszClassName = kWindowClass;
        wc.hCursor = LoadCursorW(nullptr, IDC_ARROW);
        wc.hIcon = LoadIconW(nullptr, IDI_APPLICATION);
        wc.hbrBackground = reinterpret_cast<HBRUSH>(GetStockObject(BLACK_BRUSH));
        if (!RegisterClassExW(&wc)) return false;
        window_ = CreateWindowExW(0, kWindowClass, L"Phaedra Social — Preview",
            WS_OVERLAPPEDWINDOW, CW_USEDEFAULT, CW_USEDEFAULT, 1180, 780,
            nullptr, nullptr, instance, this);
        if (!window_) return false;
        ShowWindow(window_, SW_SHOW);
        UpdateWindow(window_);
        if (options_.ui_smoke_test && !SetTimer(window_, kSmokeDeadlineTimer, 30000, nullptr)) {
            Fail(L"No se pudo iniciar el límite de tiempo de la prueba visual.");
            return true;
        }
        StartWebView();
        return true;
    }

private:
    Options options_;
    fs::path exe_;
    HWND window_ = nullptr;
    HMODULE loader_ = nullptr;
    bool closing_ = false;
    bool failure_pending_ = false;
    bool smoke_probe_pending_ = false;
    int exit_code_ = 0;
    fs::path smoke_profile_;
    std::wstring failure_;
    std::deque<std::wstring> external_links_;
    ComPtr<ICoreWebView2Environment> environment_;
    ComPtr<ICoreWebView2Controller> controller_;
    ComPtr<ICoreWebView2> view_;

    void CloseView() {
        closing_ = true;
        if (window_) {
            KillTimer(window_, kSmokeDeadlineTimer);
            KillTimer(window_, kSmokeProbeTimer);
        }
        if (controller_) controller_->Close();
        view_.Reset();
        controller_.Reset();
        environment_.Reset();
    }

    void Fail(const wchar_t* reason, int code = 10) {
        if (closing_ || failure_pending_) return;
        failure_pending_ = true;
        exit_code_ = code;
        failure_ = reason;
        PostMessageW(window_, kFailureMessage, 0, 0);
    }

    void Resize() {
        if (controller_) { RECT bounds{}; GetClientRect(window_, &bounds); controller_->put_Bounds(bounds); }
    }

    void QueueExternal(const std::wstring& uri) {
        if (closing_ || options_.ui_smoke_test || external_links_.size() >= 8) return;
        external_links_.push_back(uri);
        // Browser callbacks must return before any shell/UI operation can
        // display modal dialogs or re-enter the WebView message loop.
        PostMessageW(window_, kOpenExternalMessage, 0, 0);
    }

    void ProbeSmoke() {
        if (!options_.ui_smoke_test || closing_ || failure_pending_ || smoke_probe_pending_ || !view_) return;
        smoke_probe_pending_ = true;
        // The upload-limit text is populated only after app.js has imported
        // its modules, fetched config.json and normalized it successfully.
        // No login form is submitted and no account is created by this probe.
        constexpr wchar_t probe[] = LR"JS((() => {
            if (location.origin !== 'https://phaedra-social.invalid') return -1;
            const byId = (id) => document.getElementById(id);
            if (document.readyState !== 'complete') return 0;
            const login = byId('login-view'), form = byId('login-form');
            const error = byId('login-error'), submit = byId('login-submit');
            if (error && !error.hidden && error.textContent.trim()) return -1;
            const logo = document.querySelector('img[src="./assets/mark.svg"]');
            if (!login || !form || !submit || !byId('server-url') || !byId('email') || !byId('password')) return 0;
            if (!byId('workspace')?.hidden || !error?.hidden || submit.disabled) return 0;
            if (!byId('upload-limit')?.textContent.trim() || !document.styleSheets.length) return 0;
            if (getComputedStyle(login).display === 'none' || login.getBoundingClientRect().width < 100) return 0;
            if (!logo?.complete || logo.naturalWidth < 1) return 0;
            return 1;
        })())JS";
        const HRESULT result = view_->ExecuteScript(probe,
            Callback<ICoreWebView2ExecuteScriptCompletedHandler>(
                [this](HRESULT status, LPCWSTR result_json) -> HRESULT {
                    smoke_probe_pending_ = false;
                    if (closing_) return S_OK;
                    if (FAILED(status) || !result_json || wcscmp(result_json, L"-1") == 0) {
                        Fail(L"La interfaz local no superó la comprobación de DOM y configuración.");
                    } else if (wcscmp(result_json, L"1") == 0) {
                        exit_code_ = 0;
                        KillTimer(window_, kSmokeDeadlineTimer);
                        KillTimer(window_, kSmokeProbeTimer);
                        std::cout << "Phaedra Social: WebView2 loaded local HTML, CSS, logo, modules and login configuration.\n";
                        PostMessageW(window_, WM_CLOSE, 0, 0);
                    }
                    return S_OK;
                }).Get());
        if (FAILED(result)) { smoke_probe_pending_ = false; Fail(L"No se pudo comprobar el DOM de WebView2."); }
    }

    void StartWebView() {
        const fs::path loader_path = exe_.parent_path() / L"WebView2Loader.dll";
        loader_ = LoadLibraryExW(loader_path.c_str(), nullptr,
            LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_DEFAULT_DIRS);
        if (!loader_) { Fail(L"Falta el componente WebView2Loader del paquete social."); return; }
        using GetVersion = HRESULT(STDAPICALLTYPE*)(PCWSTR, LPWSTR*);
        using CreateEnvironment = HRESULT(STDAPICALLTYPE*)(PCWSTR, PCWSTR, ICoreWebView2EnvironmentOptions*,
            ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler*);
        const auto version_function = reinterpret_cast<GetVersion>(GetProcAddress(loader_, "GetAvailableCoreWebView2BrowserVersionString"));
        const auto create = reinterpret_cast<CreateEnvironment>(GetProcAddress(loader_, "CreateCoreWebView2EnvironmentWithOptions"));
        LPWSTR version = nullptr;
        const HRESULT version_result = version_function ? version_function(nullptr, &version) : E_NOINTERFACE;
        CoTaskMemFree(version);
        if (FAILED(version_result) || !create) {
            Fail(L"No está disponible Microsoft Edge WebView2 Runtime. Puedes usar el chat web mientras instalas el runtime oficial de Microsoft.");
            return;
        }
        fs::path profile;
        if (options_.ui_smoke_test) {
            profile = fs::temp_directory_path() / (L"PhaedraSocialUiSmoke-" +
                std::to_wstring(GetCurrentProcessId()) + L"-" + std::to_wstring(GetTickCount64()));
            smoke_profile_ = profile;
        } else {
            PWSTR local_app_data = nullptr;
            if (FAILED(SHGetKnownFolderPath(FOLDERID_LocalAppData, KF_FLAG_CREATE, nullptr, &local_app_data))) {
                Fail(L"No se pudo localizar la carpeta de datos del usuario."); return;
            }
            profile = fs::path(local_app_data) / L"Phaedra" / L"Social";
            CoTaskMemFree(local_app_data);
        }
        std::error_code error;
        fs::create_directories(profile, error);
        if (error) { Fail(L"No se pudo crear el perfil local de Phaedra Social."); return; }
        const HRESULT result = create(nullptr, profile.c_str(), nullptr,
            Callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>(
                [this](HRESULT result_code, ICoreWebView2Environment* environment) -> HRESULT {
                    if (closing_ || !IsWindow(window_)) return S_OK;
                    if (FAILED(result_code) || !environment) { Fail(L"No se pudo iniciar WebView2."); return S_OK; }
                    environment_ = environment;
                    const HRESULT creation = environment_->CreateCoreWebView2Controller(window_,
                        Callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>(
                            [this](HRESULT status, ICoreWebView2Controller* controller) -> HRESULT {
                                if (closing_ || !IsWindow(window_)) return S_OK;
                                if (FAILED(status) || !controller) { Fail(L"No se pudo abrir el panel social."); return S_OK; }
                                controller_ = controller;
                                if (FAILED(controller_->get_CoreWebView2(&view_)) || !ConfigureView())
                                    Fail(L"No se pudo configurar el panel social de forma segura.");
                                return S_OK;
                            }).Get());
                    if (FAILED(creation)) Fail(L"No se pudo crear la ventana social.");
                    return S_OK;
                }).Get());
        if (FAILED(result)) Fail(L"No se pudo iniciar el entorno de Phaedra Social.");
    }

    bool ConfigureView() {
        ComPtr<ICoreWebView2Settings> settings;
        if (!view_ || FAILED(view_->get_Settings(&settings))) return false;
        if (FAILED(settings->put_IsWebMessageEnabled(FALSE)) ||
            FAILED(settings->put_AreHostObjectsAllowed(FALSE)) ||
            FAILED(settings->put_AreDevToolsEnabled(FALSE)) ||
            FAILED(settings->put_AreDefaultContextMenusEnabled(FALSE)) ||
            FAILED(settings->put_AreDefaultScriptDialogsEnabled(FALSE)) ||
            FAILED(settings->put_IsStatusBarEnabled(FALSE))) return false;

        ComPtr<ICoreWebView2_3> mapped_view;
        if (FAILED(view_.As(&mapped_view)) || FAILED(mapped_view->SetVirtualHostNameToFolderMapping(
            kVirtualHost, options_.assets.c_str(), COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_DENY))) return false;

        EventRegistrationToken token{};
        if (options_.ui_smoke_test) {
            if (FAILED(view_->AddWebResourceRequestedFilter(L"*", COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL)) ||
                FAILED(view_->add_WebResourceRequested(Callback<ICoreWebView2WebResourceRequestedEventHandler>(
                    [this](ICoreWebView2*, ICoreWebView2WebResourceRequestedEventArgs* args) -> HRESULT {
                        if (closing_ || !environment_) return S_OK;
                        ComPtr<ICoreWebView2WebResourceRequest> request;
                        LPWSTR raw = nullptr;
                        const HRESULT status = args->get_Request(&request);
                        const bool local = SUCCEEDED(status) && request && SUCCEEDED(request->get_Uri(&raw)) &&
                            raw && IsLocalDocument(raw);
                        CoTaskMemFree(raw);
                        if (!local) {
                            ComPtr<ICoreWebView2WebResourceResponse> blocked;
                            if (SUCCEEDED(environment_->CreateWebResourceResponse(nullptr, 403, L"Forbidden",
                                L"Content-Type: text/plain", &blocked))) args->put_Response(blocked.Get());
                            Fail(L"La prueba local intentó solicitar un recurso externo.");
                        }
                        return S_OK;
                    }).Get(), &token))) return false;
        }
        if (FAILED(view_->add_NavigationStarting(Callback<ICoreWebView2NavigationStartingEventHandler>(
            [this](ICoreWebView2*, ICoreWebView2NavigationStartingEventArgs* args) -> HRESULT {
                LPWSTR raw = nullptr;
                if (FAILED(args->get_Uri(&raw)) || !raw) { args->put_Cancel(TRUE); return S_OK; }
                const std::wstring uri(raw);
                CoTaskMemFree(raw);
                if (!IsLocalDocument(uri)) {
                    args->put_Cancel(TRUE);
                    BOOL user = FALSE, redirected = FALSE;
                    args->get_IsUserInitiated(&user);
                    args->get_IsRedirected(&redirected);
                    if (user && !redirected) QueueExternal(uri);
                }
                return S_OK;
            }).Get(), &token))) return false;

        if (FAILED(view_->add_FrameNavigationStarting(Callback<ICoreWebView2NavigationStartingEventHandler>(
            [](ICoreWebView2*, ICoreWebView2NavigationStartingEventArgs* args) -> HRESULT {
                LPWSTR raw = nullptr;
                if (FAILED(args->get_Uri(&raw)) || !raw) { args->put_Cancel(TRUE); return S_OK; }
                if (!IsLocalDocument(raw)) args->put_Cancel(TRUE);
                CoTaskMemFree(raw);
                return S_OK;
            }).Get(), &token))) return false;

        if (FAILED(view_->add_NewWindowRequested(Callback<ICoreWebView2NewWindowRequestedEventHandler>(
            [this](ICoreWebView2*, ICoreWebView2NewWindowRequestedEventArgs* args) -> HRESULT {
                args->put_Handled(TRUE);
                BOOL user = FALSE;
                args->get_IsUserInitiated(&user);
                LPWSTR raw = nullptr;
                if (user && SUCCEEDED(args->get_Uri(&raw)) && raw) QueueExternal(raw);
                CoTaskMemFree(raw);
                return S_OK;
            }).Get(), &token))) return false;

        if (FAILED(view_->add_PermissionRequested(Callback<ICoreWebView2PermissionRequestedEventHandler>(
            [](ICoreWebView2*, ICoreWebView2PermissionRequestedEventArgs* args) -> HRESULT {
                return args->put_State(COREWEBVIEW2_PERMISSION_STATE_DENY);
            }).Get(), &token))) return false;

        ComPtr<ICoreWebView2_4> downloads;
        if (FAILED(view_.As(&downloads)) || FAILED(downloads->add_DownloadStarting(
            Callback<ICoreWebView2DownloadStartingEventHandler>(
                [](ICoreWebView2*, ICoreWebView2DownloadStartingEventArgs* args) -> HRESULT {
                    return args->put_Cancel(TRUE);
                }).Get(), &token))) return false;

        if (FAILED(view_->add_ProcessFailed(Callback<ICoreWebView2ProcessFailedEventHandler>(
            [this](ICoreWebView2*, ICoreWebView2ProcessFailedEventArgs*) -> HRESULT {
                Fail(L"El proceso del panel social se ha detenido. La sesión de audio de Phaedra sigue en su proceso independiente.");
                return S_OK;
            }).Get(), &token))) return false;

        if (FAILED(view_->add_NavigationCompleted(Callback<ICoreWebView2NavigationCompletedEventHandler>(
            [this](ICoreWebView2*, ICoreWebView2NavigationCompletedEventArgs* args) -> HRESULT {
                BOOL success = FALSE;
                COREWEBVIEW2_WEB_ERROR_STATUS status = COREWEBVIEW2_WEB_ERROR_STATUS_UNKNOWN;
                args->get_IsSuccess(&success);
                args->get_WebErrorStatus(&status);
                // External user links are deliberately cancelled and opened
                // outside the panel; that cancellation is not a startup error.
                if (!success && status != COREWEBVIEW2_WEB_ERROR_STATUS_OPERATION_CANCELED)
                    Fail(L"No se pudo cargar la interfaz local de Phaedra Social.");
                else if (success && options_.ui_smoke_test && !SetTimer(window_, kSmokeProbeTimer, 250, nullptr))
                    Fail(L"No se pudo programar la comprobación de la interfaz.");
                return S_OK;
            }).Get(), &token))) return false;

        Resize();
        return SUCCEEDED(view_->Navigate((std::wstring(kOrigin) + L"index.html").c_str()));
    }

    static LRESULT CALLBACK WindowProcedure(HWND window, UINT message, WPARAM wparam, LPARAM lparam) {
        SocialWindow* self = reinterpret_cast<SocialWindow*>(GetWindowLongPtrW(window, GWLP_USERDATA));
        if (message == WM_NCCREATE) {
            const auto* creation = reinterpret_cast<CREATESTRUCTW*>(lparam);
            self = static_cast<SocialWindow*>(creation->lpCreateParams);
            self->window_ = window;
            SetWindowLongPtrW(window, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(self));
        }
        if (self) switch (message) {
            case WM_SIZE: self->Resize(); return 0;
            case WM_TIMER:
                if (wparam == kSmokeDeadlineTimer) self->Fail(L"La interfaz local no estuvo lista en 30 segundos.", 11);
                else if (wparam == kSmokeProbeTimer) self->ProbeSmoke();
                return 0;
            case WM_DPICHANGED: {
                const auto* bounds = reinterpret_cast<RECT*>(lparam);
                SetWindowPos(window, nullptr, bounds->left, bounds->top, bounds->right - bounds->left,
                    bounds->bottom - bounds->top, SWP_NOZORDER | SWP_NOACTIVATE);
                return 0;
            }
            case kFailureMessage: {
                if (self->options_.ui_smoke_test) {
                    std::wcerr << L"Phaedra Social UI smoke test failed: " << self->failure_ << L'\n';
                    DestroyWindow(window);
                    return 0;
                }
                const std::wstring prompt = self->failure_ + L"\n\n¿Abrir el chat web existente en el navegador?";
                if (MessageBoxW(window, prompt.c_str(), L"Phaedra Social", MB_YESNO | MB_ICONWARNING) == IDYES)
                    OpenExternal(window, self->options_.fallback);
                DestroyWindow(window);
                return 0;
            }
            case kOpenExternalMessage: {
                if (!self->closing_ && !self->external_links_.empty()) {
                    const std::wstring uri = std::move(self->external_links_.front());
                    self->external_links_.pop_front();
                    OpenExternal(window, uri);
                }
                return 0;
            }
            case WM_DESTROY: self->CloseView(); PostQuitMessage(self->exit_code_); return 0;
        }
        return DefWindowProcW(window, message, wparam, lparam);
    }
};

struct ApartmentGuard {
    SocialWindow& app;
    ~ApartmentGuard() {
        // CoUninitialize may dispatch pending COM completions. Keep app alive
        // and marked closed until it has drained the apartment's callbacks.
        app.Shutdown();
        CoUninitialize();
    }
};
} // namespace

int WINAPI wWinMain(HINSTANCE instance, HINSTANCE, PWSTR, int) {
    Options options;
    try {
        const fs::path executable = ExecutablePath();
        if (!ReadOptions(options, executable)) return 2;
        options.assets = fs::absolute(options.assets).lexically_normal();
        ValidateAssets(options.assets);
        if (options.self_test) {
            if (!fs::is_regular_file(executable.parent_path() / L"WebView2Loader.dll")) return 3;
            std::cout << "Phaedra Social: assets and schemaVersion 1 config verified; no runtime or network test.\n";
            return 0;
        }
        SocialWindow app(options, executable);
        const HRESULT initialized = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
        if (FAILED(initialized)) throw std::runtime_error("COM apartment initialization failed");
        const ApartmentGuard apartment{app};
        int result = 0;
        if (!app.Create(instance)) throw std::runtime_error("Cannot create the Phaedra Social window");
        else {
            MSG message{};
            int status = 0;
            while ((status = static_cast<int>(GetMessageW(&message, nullptr, 0, 0))) > 0) {
                TranslateMessage(&message);
                DispatchMessageW(&message);
            }
            result = status < 0 ? 6 : static_cast<int>(message.wParam);
        }
        return result;
    } catch (const std::exception& error) {
        std::cerr << "Phaedra Social: " << error.what() << '\n';
        if (!options.self_test && !options.ui_smoke_test && MessageBoxW(nullptr,
            L"El paquete de Phaedra Social está incompleto o su configuración no es válida.\n\n¿Abrir el chat web existente?",
            L"Phaedra Social", MB_YESNO | MB_ICONWARNING) == IDYES && IsSafeFallback(options.fallback))
            OpenExternal(nullptr, options.fallback);
        return 1;
    }
}
