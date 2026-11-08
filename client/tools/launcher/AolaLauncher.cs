// AolaLauncher.cs —— 奥拉星整合包一键启动器（无控制台窗口）
//
// 设计目标（对应需求）：
//   1. exe 一键启动（双击即玩），全程没有任何黑色命令行窗口
//   2. 网关 node serve.mjs 在后台隐藏运行，stdout/stderr 落盘到 logs\gateway-*.log
//   3. 网关生命周期 == 游戏浏览器生命周期：
//        · 浏览器关闭 → 立刻杀掉网关 → 启动器自身退出
//        · 启动器被强杀（任务管理器/崩溃）→ Job Object 连带杀掉网关，绝不留孤儿占住 8700
//   4. 单实例：重复双击不会开第二套网关/窗口
//   5. 变体：exe 文件名含「去特效」时自动注入 AOLA_NO_* 低配开关（同一份源码编两份）
//
// 编译：csc /target:winexe /codepage:65001 /out:启动奥拉星.exe AolaLauncher.cs
//       （仅依赖 .NET Framework 4.x，Windows 10/11 自带；另引 System.Windows.Forms + System.Management）
using System;
using System.Diagnostics;
using System.IO;
using System.Management;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Text;
using System.Threading;
using System.Windows.Forms;

static class AolaLauncher
{
    const int PreferredPort = 8700;      // 首选端口（Round 70f：被占用时网关自动改用系统分配端口，实际端口从日志解析）
    static int ActualPort = 0;           // 网关日志上报的实际绑定端口
    const string MutexPrefix = "AolaStarPackLauncher_";

    static string BaseDir;
    static string NodeExe, ChromeExe, ServeJs, ProfileDir, LogDir;
    static Process Gateway;
    static bool LowFx;
    static readonly object LogLock = new object();
    static StreamWriter LauncherLog;
    static IntPtr Job = IntPtr.Zero;

    // ---------------- Win32: Job Object ----------------
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern IntPtr CreateJobObject(IntPtr lpJobAttributes, string lpName);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool SetInformationJobObject(IntPtr hJob, int infoClass, IntPtr info, uint len);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool AssignProcessToJobObject(IntPtr hJob, IntPtr hProcess);

    [StructLayout(LayoutKind.Sequential)]
    struct JOBOBJECT_BASIC_LIMIT_INFORMATION
    {
        public long PerProcessUserTimeLimit;
        public long PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass;
        public uint SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct IO_COUNTERS
    {
        public ulong ReadOperationCount;
        public ulong WriteOperationCount;
        public ulong OtherOperationCount;
        public ulong ReadTransferCount;
        public ulong WriteTransferCount;
        public ulong OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
    {
        public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
        public IO_COUNTERS IoInfo;
        public UIntPtr ProcessMemoryLimit;
        public UIntPtr JobMemoryLimit;
        public UIntPtr PeakProcessMemoryUsed;
        public UIntPtr PeakJobMemoryUsed;
    }

    const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000;
    const int JobObjectExtendedLimitInformation = 9;

    /// <summary>创建「最后一个句柄关闭时杀掉所有成员」的 Job，防止启动器被强杀后网关变孤儿。</summary>
    static void CreateKillOnCloseJob()
    {
        try
        {
            Job = CreateJobObject(IntPtr.Zero, null);
            if (Job == IntPtr.Zero) return;
            var info = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            int len = Marshal.SizeOf(info);
            IntPtr p = Marshal.AllocHGlobal(len);
            try
            {
                Marshal.StructureToPtr(info, p, false);
                SetInformationJobObject(Job, JobObjectExtendedLimitInformation, p, (uint)len);
            }
            finally { Marshal.FreeHGlobal(p); }
        }
        catch { }
    }

    static void AddToJob(Process p)
    {
        if (Job == IntPtr.Zero || p == null) return;
        try { AssignProcessToJobObject(Job, p.Handle); } catch { }
    }

    // ---------------- 日志 ----------------
    static string Stamp() { return DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff"); }

    static void Log(string msg)
    {
        try
        {
            lock (LogLock)
            {
                if (LauncherLog != null)
                {
                    LauncherLog.WriteLine(Stamp() + " " + msg);
                    LauncherLog.Flush();
                }
            }
        }
        catch { }
    }

    static void GatewayLine(string line)
    {
        if (line == null) return;
        try
        {
            // Round 70f：从网关横幅解析实际绑定端口（端口自动选择后与首选值可能不同）
            var mp = Regex.Match(line, @"P0 mirror on http://127\.0\.0\.1:(\d+)/");
            if (mp.Success)
            {
                ActualPort = int.Parse(mp.Groups[1].Value);
                Log("[launcher] 网关实际端口 " + ActualPort);
            }
            lock (LogLock)
            {
                if (LauncherLog != null)
                {
                    LauncherLog.WriteLine(line);
                    LauncherLog.Flush();
                }
            }
        }
        catch { }
    }

    static void OpenLog()
    {
        try
        {
            Directory.CreateDirectory(LogDir);
            string file = Path.Combine(LogDir, "gateway-" + DateTime.Now.ToString("yyyyMMdd") + ".log");
            var fs = new FileStream(file, FileMode.Append, FileAccess.Write, FileShare.ReadWrite);
            LauncherLog = new StreamWriter(fs, new UTF8Encoding(false));
            LauncherLog.AutoFlush = true;
        }
        catch { LauncherLog = null; }
    }

    // ---------------- 网关就绪 ----------------
    static bool WaitGatewayReady(int timeoutMs)
    {
        var sw = Stopwatch.StartNew();
        while (sw.ElapsedMilliseconds < timeoutMs)
        {
            if (Gateway != null)
            {
                try { if (Gateway.HasExited) { Log("[launcher] 网关进程已退出，退出码 " + Gateway.ExitCode); return false; } }
                catch { }
            }
            // Round 70f：端口自动选择 —— 先等日志横幅上报实际端口，再探活
            if (ActualPort <= 0) { Thread.Sleep(250); continue; }
            try
            {
                var req = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:" + ActualPort + "/status");
                req.Timeout = 800;
                req.ReadWriteTimeout = 800;
                req.Proxy = null;
                using (var resp = (HttpWebResponse)req.GetResponse())
                {
                    if ((int)resp.StatusCode == 200) return true;
                }
            }
            catch { }
            Thread.Sleep(250);
        }
        return false;
    }

    // ---------------- 浏览器存活 ----------------
    static bool AnyBrowserUsingProfile()
    {
        try
        {
            using (var searcher = new ManagementObjectSearcher(
                "SELECT ProcessId, CommandLine FROM Win32_Process WHERE Name='chrome.exe'"))
            {
                using (var col = searcher.Get())
                {
                    foreach (ManagementObject mo in col)
                    {
                        try
                        {
                            string cmd = mo["CommandLine"] as string;
                            if (cmd != null && cmd.IndexOf(ProfileDir, StringComparison.OrdinalIgnoreCase) >= 0)
                                return true;
                        }
                        catch { }
                    }
                }
            }
        }
        catch { }
        return false;
    }

    // ---------------- 主流程 ----------------
    [STAThread]
    static int Main(string[] args)
    {
        BaseDir = Path.GetDirectoryName(Assembly.GetEntryAssembly().Location);
        string exeName = Path.GetFileNameWithoutExtension(Assembly.GetEntryAssembly().Location);
        LowFx = exeName.IndexOf("去特效", StringComparison.Ordinal) >= 0;

        NodeExe = Path.Combine(BaseDir, @"runtime\node\node.exe");
        ChromeExe = Path.Combine(BaseDir, @"runtime\browser\chrome.exe");
        ServeJs = Path.Combine(BaseDir, @"app\tools\serve.mjs");
        ProfileDir = Path.Combine(BaseDir, "profile");
        LogDir = Path.Combine(BaseDir, "logs");

        // 单实例
        bool created = false;
        Mutex mtx = null;
        try
        {
            mtx = new Mutex(true, MutexPrefix + BaseDir.GetHashCode().ToString("X8"), out created);
        }
        catch { created = true; }
        if (!created)
        {
            // 已经在跑：不重复开窗口，直接退出
            return 0;
        }

        OpenLog();
        CreateKillOnCloseJob();
        Log("[launcher] 启动 dir=" + BaseDir + " lowfx=" + LowFx);

        try
        {
            if (!File.Exists(NodeExe)) return Fail("缺少 runtime\\node\\node.exe，请重新解压整合包。");
            if (!File.Exists(ChromeExe)) return Fail("缺少 runtime\\browser\\chrome.exe，请重新解压整合包。");
            if (!File.Exists(ServeJs)) return Fail("缺少 app\\tools\\serve.mjs，请重新解压整合包。");

            // Round 70f：端口自动选择 —— 网关以 "0"（系统分配）启动，被占用端口自动回避，
            // 实际端口从网关日志横幅解析（GatewayLine）。不再抢占/击杀占用 8700 的进程，
            // 与开发环境网关可共存。
            var psi = new ProcessStartInfo(NodeExe, "\"" + ServeJs + "\" 0");
            psi.WorkingDirectory = BaseDir;
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            psi.RedirectStandardOutput = true;
            psi.RedirectStandardError = true;
            psi.StandardOutputEncoding = Encoding.UTF8;   // node 输出 UTF-8，默认按 OEM 解会乱码
            psi.StandardErrorEncoding = Encoding.UTF8;
            psi.WindowStyle = ProcessWindowStyle.Hidden;

            // Round 70c：账号新头像框（id:666）会让 HeadFrameService.initMyHeadFrameData
            // throw，异常穿透 socket 消息分发 → 世界装配冻结（README 既定摘除机制）。
            psi.EnvironmentVariables["AOLA_DROP_SERVICE"] = "HeadFrameService";

            if (LowFx)
            {
                var env = psi.EnvironmentVariables;
                env["AOLA_NO_ENTER_EFFECT"] = "1";
                env["AOLA_NO_BUFF_EFFECT"] = "1";
                env["AOLA_NO_PET_BACKGROUND"] = "1";
                env["AOLA_NO_XINGHUI_EFFECT"] = "1";
                env["AOLA_NO_BATTLE_FX"] = "1";
                env["AOLA_NO_STARTMV"] = "1";
                Log("[launcher] 已注入低配开关 AOLA_NO_*");
            }

            Gateway = Process.Start(psi);
            AddToJob(Gateway);
            Gateway.OutputDataReceived += (s, e) => GatewayLine(e.Data);
            Gateway.ErrorDataReceived += (s, e) => GatewayLine(e.Data);
            Gateway.BeginOutputReadLine();
            Gateway.BeginErrorReadLine();
            Log("[launcher] 网关已启动 pid=" + Gateway.Id + "（后台隐藏）");

            if (!WaitGatewayReady(25000))
            {
                Log("[launcher] 网关未就绪，终止");
                StopGateway();
                return Fail("网关未能在 25 秒内就绪。\n详细信息见 logs\\gateway-" + DateTime.Now.ToString("yyyyMMdd") + ".log");
            }
            Log("[launcher] 网关就绪");

            // 浏览器已开着同一 profile 就不再开第二个，只等它退出
            Process browser = null;
            if (!AnyBrowserUsingProfile())
            {
                string chromeArgs =
                    // Round 68/69：画布像素固定 960×560（SWF 原生，与官方 Flash 运行时一致）。
                    // 显示倍率由页面右下角「页面大小」选择器控制（100%~200%，localStorage 持久化），
                    // 启动器不再强制 ?scale=1.3；首次启动默认 100%。
                    "--app=http://127.0.0.1:" + ActualPort + "/game?log=0" +
                    " --user-data-dir=\"" + ProfileDir + "\"" +
                    " --no-first-run --no-default-browser-check" +
                    " --disable-features=CalculateNativeWindowOcclusion" +
                    " --window-size=1300,860" +   // 125% 档（1200×700）可完整放下；更大档位出滚动条
                    " --no-sandbox --mute-audio" +
                    " --force-device-scale-factor=1";   // Round 64：DPR 钳到 1，保证画布不放大
                var cpsi = new ProcessStartInfo(ChromeExe, chromeArgs);
                cpsi.WorkingDirectory = BaseDir;
                cpsi.UseShellExecute = false;
                browser = Process.Start(cpsi);
                AddToJob(browser);
                Log("[launcher] 浏览器已启动 pid=" + browser.Id);
            }
            else
            {
                Log("[launcher] 检测到同 profile 的浏览器已在运行，直接等它退出");
            }

            // 等浏览器退出（这就是「生命周期与游戏浏览器一致」的锚点）
            if (browser != null)
            {
                var sw = Stopwatch.StartNew();
                browser.WaitForExit();
                long ms = sw.ElapsedMilliseconds;
                Log("[launcher] 浏览器主进程退出，用时 " + ms + "ms");
                // 主进程早退（<2.5s）通常是「已有实例」导致，此时按 profile 轮询等真正的窗口关掉
                if (ms < 2500)
                {
                    Log("[launcher] 主进程早退，改为轮询同 profile 的浏览器进程");
                    for (int i = 0; i < 7200; i++)   // 最多等 4 小时
                    {
                        if (!AnyBrowserUsingProfile()) break;
                        Thread.Sleep(2000);
                    }
                }
            }
            else
            {
                for (int i = 0; i < 7200; i++)
                {
                    if (!AnyBrowserUsingProfile()) break;
                    Thread.Sleep(2000);
                }
            }

            Log("[launcher] 浏览器已全部退出，准备关闭网关");
            return 0;
        }
        catch (Exception e)
        {
            Log("[launcher] 异常: " + e);
            return Fail("启动失败：" + e.Message);
        }
        finally
        {
            try { StopGateway(); } catch { }
            try { if (LauncherLog != null) { LauncherLog.Flush(); LauncherLog.Dispose(); } } catch { }
            try { if (Job != IntPtr.Zero) { CloseHandle(Job); Job = IntPtr.Zero; } } catch { }
            try { if (mtx != null) { try { mtx.ReleaseMutex(); } catch { } mtx.Close(); } } catch { }
        }
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool CloseHandle(IntPtr h);

    static void StopGateway()
    {
        if (Gateway == null) return;
        try
        {
            if (!Gateway.HasExited)
            {
                Log("[launcher] 结束网关 pid=" + Gateway.Id);
                Gateway.Kill();
                Gateway.WaitForExit(5000);
            }
        }
        catch (Exception e) { Log("[launcher] 结束网关异常: " + e.Message); }
        Gateway = null;
        // Round 70f：临时端口随进程退出自动释放，无需等待端口回收
    }

    static int Fail(string msg)
    {
        Log("[launcher] 失败: " + msg.Replace("\n", " | "));
        try { MessageBox.Show(msg, "奥拉星启动器", MessageBoxButtons.OK, MessageBoxIcon.Error); }
        catch { }
        return 1;
    }
}
