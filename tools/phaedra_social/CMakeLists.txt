cmake_minimum_required(VERSION 3.20)
project(PhaedraSocial LANGUAGES CXX RC)

if(NOT WIN32 OR NOT MSVC)
  message(FATAL_ERROR "PhaedraSocial is a separate Win32/MSVC host; do not add it to Waf.")
endif()

set(WEBVIEW2_SDK_DIR "" CACHE PATH "Extracted, version-pinned Microsoft.Web.WebView2 package")
if(NOT EXISTS "${WEBVIEW2_SDK_DIR}/build/native/include/WebView2.h")
  message(FATAL_ERROR "Run build.ps1 to restore the pinned WebView2 SDK first.")
endif()

add_executable(PhaedraSocial WIN32 main.cpp phaedra_social.rc)
target_compile_features(PhaedraSocial PRIVATE cxx_std_17)
set_property(TARGET PhaedraSocial PROPERTY MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
target_compile_definitions(PhaedraSocial PRIVATE UNICODE _UNICODE WIN32_LEAN_AND_MEAN NOMINMAX _WIN32_WINNT=0x0A00)
target_compile_options(PhaedraSocial PRIVATE "$<$<COMPILE_LANGUAGE:CXX>:/W4;/utf-8;/permissive-;/EHsc>")
# The .rc already embeds our DPI/UAC manifest as resource 1. Generating a
# second linker manifest produces duplicate RT_MANIFEST resources (CVT1100).
target_link_options(PhaedraSocial PRIVATE /MANIFEST:NO)
target_include_directories(PhaedraSocial PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}")
target_include_directories(PhaedraSocial SYSTEM PRIVATE "${WEBVIEW2_SDK_DIR}/build/native/include")
target_link_libraries(PhaedraSocial PRIVATE ole32 shell32 user32 gdi32 winhttp uuid)
