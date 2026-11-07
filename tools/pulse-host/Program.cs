using System.Diagnostics;
using System.Runtime.InteropServices;

// Pulse stays a separate GPL-3.0 process. This bridge owns only the native window parenting.
if (args.Length != 4 || !int.TryParse(args[0], out var hostPid)
    || !long.TryParse(args[3], out var hostHandle)) return;
var dockWindow = new IntPtr(hostHandle);
if (!IsWindow(dockWindow)) return;
GetWindowThreadProcessId(dockWindow, out var dockOwner);
if (dockOwner != hostPid) return;
var geometryFile = args[1];
var pulseExe = args[2];
if (!File.Exists(pulseExe)) return;
Process? parent;
try { parent = Process.GetProcessById(hostPid); }
catch (ArgumentException) { return; }
using (parent)
{

var pulseDir = Path.GetDirectoryName(pulseExe) ?? Environment.CurrentDirectory;
// Installed applications may live under Program Files, where ordinary users cannot write.
// Pulse also needs a separate profile for each concurrently open Phaedra window.
var localData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
var profileOverride = Environment.GetEnvironmentVariable("PHAEDRA_PULSE_PROFILE_ROOT");
var profileRoot = string.IsNullOrWhiteSpace(profileOverride)
    ? Path.Combine(localData, "Phaedra Pro", "Pulse")
    : Path.GetFullPath(profileOverride);
var profile = Path.Combine(profileRoot, $"session-{hostPid}");
var configDir = Path.Combine(profile, ".config", "pulse-visualizer");
var themeDir = Path.Combine(configDir, "themes");
Directory.CreateDirectory(themeDir);
var themeSource = Path.Combine(pulseDir, "themes", "Phaedra.txt");
if (File.Exists(themeSource)) File.Copy(themeSource, Path.Combine(themeDir, "Phaedra.txt"), true);
var configFile = Path.Combine(configDir, "config.yml");
if (!File.Exists(configFile))
{
    var savedConfig = Path.Combine(profileRoot, "config.yml");
    var template = Path.Combine(pulseDir, "config.yml.template");
    if (File.Exists(savedConfig)) File.Copy(savedConfig, configFile);
    else if (File.Exists(template)) File.WriteAllText(configFile, File.ReadAllText(template).Replace("\r\n", "\n")
        .Replace("theme: mocha.txt", "theme: Phaedra.txt")
        .Replace("mode: stereo", "mode: mono")
        .Replace("max_freq: 4000", "max_freq: 20000")
        .Replace("frequency_scale: mel", "frequency_scale: log"));
}
var launch = new ProcessStartInfo(pulseExe)
{
    UseShellExecute = false,
    WorkingDirectory = pulseDir
};
launch.Environment["USERPROFILE"] = profile;
using var pulse = Process.Start(launch);
if (pulse is null) return;
// The job closes Pulse even if Phaedra terminates this bridge unexpectedly.
var job = CreateJobObject(IntPtr.Zero, null);
if (job == IntPtr.Zero || !ConfigureKillOnClose(job) || !AssignProcessToJobObject(job, pulse.Handle))
{
    if (job != IntPtr.Zero) CloseHandle(job);
    if (!pulse.HasExited) pulse.Kill();
    return;
}
try
{
IntPtr host = IntPtr.Zero;
IntPtr child = IntPtr.Zero;
string lastGeometry = "";
bool shown = false;
try
{
    while (!pulse.HasExited && !parent.HasExited)
    {
        try { if (File.ReadAllText(geometryFile).Trim() == "EXIT") break; }
        catch (IOException) { }
        host = dockWindow;
        if (!IsWindow(host)) break;
        if (child == IntPtr.Zero || !IsWindow(child))
        {
            child = WindowForProcess(pulse.Id);
            lastGeometry = "";
            shown = false;
        }
        if (host != IntPtr.Zero && child != IntPtr.Zero)
        {
            if (GetParent(child) != host)
            {
                SetParent(child, host);
                lastGeometry = "";
                shown = false;
            }
            const long nonClient = 0x80000000L | 0x00C00000L | 0x00040000L | 0x00080000L | 0x00030000L | 0x01000000L;
            const long extendedEdge = 0x00000100L | 0x00000200L | 0x00020000L;
            var style = GetWindowLongPtr(child, -16).ToInt64();
            var extended = GetWindowLongPtr(child, -20).ToInt64();
            if ((style & nonClient) != 0 || (style & 0x40000000L) == 0 || (extended & extendedEdge) != 0)
            {
                SetWindowLongPtr(child, -16, new IntPtr((style & ~nonClient) | 0x40000000L));
                SetWindowLongPtr(child, -20, new IntPtr(extended & ~extendedEdge));
                SetWindowPos(child, IntPtr.Zero, 0, 0, 0, 0, 0x4027);
            }
            try
            {
                var geometry = File.ReadAllText(geometryFile);
                var parts = geometry.Split(',');
                if (parts.Length == 4 && int.TryParse(parts[0], out var x) && int.TryParse(parts[1], out var y)
                    && int.TryParse(parts[2], out var w) && int.TryParse(parts[3], out var h))
                {
                    if (w > 0 && h > 0)
                    {
                        var actual = new WindowRect();
                        var drifted = GetWindowRect(child, out actual);
                        if (drifted)
                        {
                            var corner = new WindowPoint { X = actual.Left, Y = actual.Top };
                            ScreenToClient(host, ref corner);
                            drifted = corner.X != x || corner.Y != y || actual.Right - actual.Left != w || actual.Bottom - actual.Top != h;
                        }
                        if (geometry != lastGeometry || drifted)
                        {
                            // Cross-thread MoveWindow blocks on Pulse's UI thread. Queue the resize instead.
                            SetWindowPos(child, IntPtr.Zero, x, y, w, h, 0x4014);
                            lastGeometry = geometry;
                        }
                        if (!shown) { ShowWindow(child, 8); shown = true; }
                    }
                    else if (shown) { ShowWindow(child, 0); shown = false; lastGeometry = ""; }
                }
            }
            catch (IOException) { }
        }
        await Task.Delay(80);
    }
}
finally
{
    if (!pulse.HasExited)
    {
        pulse.Kill();
        pulse.WaitForExit(2000);
    }
    try
    {
        if (File.Exists(configFile)) File.Copy(configFile, Path.Combine(profileRoot, "config.yml"), true);
        Directory.Delete(profile, true);
    }
    catch (IOException) { }
    catch (UnauthorizedAccessException) { }
    try { File.Delete(geometryFile); } catch (IOException) { }
}
}
finally { CloseHandle(job); }
}

static IntPtr WindowForProcess(int pid)
{
    IntPtr selected = IntPtr.Zero;
    long bestArea = 0;
    EnumWindows((hwnd, _) =>
    {
        GetWindowThreadProcessId(hwnd, out var owner);
        if (owner != pid || !IsWindowVisible(hwnd) || !GetWindowRect(hwnd, out var rect)) return true;
        var area = (long)Math.Max(0, rect.Right - rect.Left) * Math.Max(0, rect.Bottom - rect.Top);
        if (area > bestArea) { selected = hwnd; bestArea = area; }
        return true;
    }, IntPtr.Zero);
    return selected;
}

[DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc callback, IntPtr parameter);
[DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out int processId);
[DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
[DllImport("user32.dll")] static extern bool IsWindow(IntPtr hwnd);
[DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hwnd, out WindowRect rect);
[DllImport("user32.dll")] static extern bool ScreenToClient(IntPtr hwnd, ref WindowPoint point);
[DllImport("user32.dll")] static extern IntPtr GetParent(IntPtr hwnd);
[DllImport("user32.dll")] static extern IntPtr SetParent(IntPtr child, IntPtr parent);
[DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] static extern IntPtr GetWindowLongPtr(IntPtr hwnd, int index);
[DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")] static extern IntPtr SetWindowLongPtr(IntPtr hwnd, int index, IntPtr value);
[DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr hwnd, IntPtr after, int x, int y, int width, int height, uint flags);
[DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hwnd, int command);
[DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern IntPtr CreateJobObject(IntPtr attributes, string? name);
[DllImport("kernel32.dll")] static extern bool SetInformationJobObject(IntPtr job, int informationClass, ref JobObjectExtendedLimitInformation information, int length);
[DllImport("kernel32.dll")] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
[DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
static bool ConfigureKillOnClose(IntPtr job)
{
    var information = new JobObjectExtendedLimitInformation();
    information.BasicLimitInformation.LimitFlags = 0x2000;
    return SetInformationJobObject(job, 9, ref information, Marshal.SizeOf<JobObjectExtendedLimitInformation>());
}
// Mirrors JOBOBJECT_EXTENDED_LIMIT_INFORMATION in winnt.h.
[StructLayout(LayoutKind.Sequential)] struct JobObjectBasicLimitInformation
{
    public long PerProcessUserTimeLimit, PerJobUserTimeLimit;
    public uint LimitFlags;
    public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize;
    public uint ActiveProcessLimit;
    public UIntPtr Affinity;
    public uint PriorityClass, SchedulingClass;
}
[StructLayout(LayoutKind.Sequential)] struct IoCounters
{
    public ulong ReadOperationCount, WriteOperationCount, OtherOperationCount;
    public ulong ReadTransferCount, WriteTransferCount, OtherTransferCount;
}
[StructLayout(LayoutKind.Sequential)] struct JobObjectExtendedLimitInformation
{
    public JobObjectBasicLimitInformation BasicLimitInformation;
    public IoCounters IoInfo;
    public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed;
}
delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr parameter);
[StructLayout(LayoutKind.Sequential)] struct WindowRect { public int Left, Top, Right, Bottom; }
[StructLayout(LayoutKind.Sequential)] struct WindowPoint { public int X, Y; }
