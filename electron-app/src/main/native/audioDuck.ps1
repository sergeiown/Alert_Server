$source = @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
class MMDeviceEnumeratorCom { }

[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator
{
    int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
}

[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice
{
    int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object result);
}

[ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionManager2
{
    int GetAudioSessionControl(IntPtr audioSessionGuid, int streamFlags, out IntPtr sessionControl);
    int GetSimpleAudioVolume(IntPtr audioSessionGuid, int streamFlags, out IntPtr audioVolume);
    int GetSessionEnumerator(out IAudioSessionEnumerator sessionEnum);
}

[ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionEnumerator
{
    int GetCount(out int count);
    int GetSession(int index, [MarshalAs(UnmanagedType.IUnknown)] out object session);
}

[ComImport, Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionControl2
{
    int GetState(out int state);
    int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string name);
    int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string name, ref Guid context);
    int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string path);
    int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string path, ref Guid context);
    int GetGroupingParam(out Guid grouping);
    int SetGroupingParam(ref Guid grouping, ref Guid context);
    int RegisterAudioSessionNotification(IntPtr client);
    int UnregisterAudioSessionNotification(IntPtr client);
    int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
    int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
    int GetProcessId(out uint pid);
    int IsSystemSoundsSession();
    int SetDuckingPreference(bool optOut);
}

[ComImport, Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ISimpleAudioVolume
{
    int SetMasterVolume(float level, ref Guid context);
    int GetMasterVolume(out float level);
    int SetMute(bool mute, ref Guid context);
    int GetMute(out bool mute);
}

public static class AudioDuck
{
    static Dictionary<string, float> saved = new Dictionary<string, float>();

    static List<object> Sessions()
    {
        var result = new List<object>();
        var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorCom();
        IMMDevice device;
        if (enumerator.GetDefaultAudioEndpoint(0, 1, out device) != 0) return result;
        Guid iid = new Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F");
        object managerObject;
        if (device.Activate(ref iid, 23, IntPtr.Zero, out managerObject) != 0) return result;
        IAudioSessionEnumerator sessions;
        ((IAudioSessionManager2)managerObject).GetSessionEnumerator(out sessions);
        int count;
        sessions.GetCount(out count);
        for (int i = 0; i < count; i++)
        {
            object session;
            if (sessions.GetSession(i, out session) == 0) result.Add(session);
        }
        return result;
    }

    static string ProcessName(uint pid)
    {
        try { return Process.GetProcessById((int)pid).ProcessName; }
        catch { return ""; }
    }

    public static string[] List()
    {
        var rows = new List<string>();
        foreach (object session in Sessions())
        {
            var control = (IAudioSessionControl2)session;
            uint pid;
            control.GetProcessId(out pid);
            float level;
            ((ISimpleAudioVolume)session).GetMasterVolume(out level);
            rows.Add(pid + " " + ProcessName(pid) + " " + level);
        }
        return rows.ToArray();
    }

    static void Ramp(List<ISimpleAudioVolume> volumes, List<float> from, List<float> to, int rampMs)
    {
        Guid context = Guid.Empty;
        int steps = rampMs <= 0 ? 1 : Math.Max(2, rampMs / 30);
        for (int step = 1; step <= steps; step++)
        {
            double t = (double)step / steps;
            double eased = t * t * (3.0 - 2.0 * t);
            for (int i = 0; i < volumes.Count; i++)
            {
                float level = (float)(from[i] + (to[i] - from[i]) * eased);
                volumes[i].SetMasterVolume(level, ref context);
            }
            if (step < steps) System.Threading.Thread.Sleep(rampMs / steps);
        }
    }

    public static int Duck(float factor, string exclude, string stateFile, int rampMs)
    {
        if (saved.Count > 0) return saved.Count;
        var lines = new List<string>();
        var volumes = new List<ISimpleAudioVolume>();
        var from = new List<float>();
        var to = new List<float>();
        foreach (object session in Sessions())
        {
            var control = (IAudioSessionControl2)session;
            var volume = (ISimpleAudioVolume)session;
            uint pid;
            control.GetProcessId(out pid);
            if (pid == 0 || pid == (uint)Process.GetCurrentProcess().Id) continue;
            string name = ProcessName(pid);
            if (name.Equals(exclude, StringComparison.OrdinalIgnoreCase)) continue;
            string id;
            control.GetSessionInstanceIdentifier(out id);
            float original;
            volume.GetMasterVolume(out original);
            saved[id] = original;
            lines.Add(id + "|" + original.ToString(System.Globalization.CultureInfo.InvariantCulture));
            volumes.Add(volume);
            from.Add(original);
            to.Add(original * factor);
        }
        File.WriteAllLines(stateFile, lines.ToArray());
        Ramp(volumes, from, to, rampMs);
        return saved.Count;
    }

    public static int Restore(string stateFile, int rampMs)
    {
        var originals = new Dictionary<string, float>(saved);
        if (originals.Count == 0 && File.Exists(stateFile))
        {
            foreach (string line in File.ReadAllLines(stateFile))
            {
                int cut = line.LastIndexOf('|');
                if (cut > 0) originals[line.Substring(0, cut)] = float.Parse(line.Substring(cut + 1), System.Globalization.CultureInfo.InvariantCulture);
            }
        }
        var volumes = new List<ISimpleAudioVolume>();
        var from = new List<float>();
        var to = new List<float>();
        if (originals.Count > 0)
        {
            foreach (object session in Sessions())
            {
                var control = (IAudioSessionControl2)session;
                string id;
                control.GetSessionInstanceIdentifier(out id);
                float original;
                if (originals.TryGetValue(id, out original))
                {
                    var volume = (ISimpleAudioVolume)session;
                    float current;
                    volume.GetMasterVolume(out current);
                    volumes.Add(volume);
                    from.Add(current);
                    to.Add(original);
                }
            }
        }
        Ramp(volumes, from, to, rampMs);
        saved.Clear();
        try { File.Delete(stateFile); } catch { }
        return volumes.Count;
    }
}
'@

Add-Type -TypeDefinition $source -Language CSharp

while ($true) {
    $line = [Console]::In.ReadLine()
    if ($null -eq $line) {
        try { [AudioDuck]::Restore($env:ALERT_DUCK_STATE, 0) | Out-Null } catch { }
        break
    }
    $parts = $line.Split(' ')
    try {
        if ($parts[0] -eq 'duck') {
            $factor = [float]::Parse($parts[1], [System.Globalization.CultureInfo]::InvariantCulture)
            $ramp = [int]::Parse($parts[2])
            $count = [AudioDuck]::Duck($factor, $env:ALERT_DUCK_EXCLUDE, $env:ALERT_DUCK_STATE, $ramp)
            [Console]::Out.WriteLine("ducked $count")
        } elseif ($parts[0] -eq 'list') {
            [Console]::Out.WriteLine(([AudioDuck]::List() -join '; '))
        } elseif ($parts[0] -eq 'restore') {
            $ramp = if ($parts.Length -gt 1) { [int]::Parse($parts[1]) } else { 0 }
            $count = [AudioDuck]::Restore($env:ALERT_DUCK_STATE, $ramp)
            [Console]::Out.WriteLine("restored $count")
        }
    } catch {
        [Console]::Out.WriteLine("error " + $_.Exception.Message)
    }
    [Console]::Out.Flush()
}
