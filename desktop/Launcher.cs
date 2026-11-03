using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;
using System.Windows.Forms;

internal static class Program
{
    private const string Url = "http://127.0.0.1:5178";

    [STAThread]
    private static void Main()
    {
        try
        {
            string desktopDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
            string appRoot = Path.GetFullPath(Path.Combine(desktopDir, ".."));
            string server = Path.Combine(appRoot, "server", "index.js");

            if (!File.Exists(server))
            {
                MessageBox.Show(
                    "找不到 server\\index.js。\r\n请将本程序放在课表应用目录的 desktop 文件夹内。",
                    "课表 SuperTable",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                return;
            }

            if (!IsHealthy())
            {
                string node = FindNode(desktopDir);
                if (node == null)
                {
                    MessageBox.Show(
                        "未检测到 Node.js。\r\n请安装 Node.js 20 或更高版本（https://nodejs.org），再重新打开。",
                        "课表 SuperTable",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error);
                    return;
                }

                var info = new ProcessStartInfo(node, "\"" + server + "\"");
                info.WorkingDirectory = appRoot;
                info.UseShellExecute = false;
                info.CreateNoWindow = true;
                info.RedirectStandardOutput = true;
                info.RedirectStandardError = true;
                info.StandardOutputEncoding = System.Text.Encoding.UTF8;
                info.StandardErrorEncoding = System.Text.Encoding.UTF8;
                info.EnvironmentVariables["PORT"] = "5178";

                Process process = Process.Start(info);
                if (process == null)
                {
                    MessageBox.Show("无法启动本地服务进程。", "课表 SuperTable", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }
                process.OutputDataReceived += delegate { };
                process.ErrorDataReceived += delegate { };
                process.BeginOutputReadLine();
                process.BeginErrorReadLine();

                for (int i = 0; i < 75 && !IsHealthy(); i++)
                {
                    Thread.Sleep(200);
                }

                if (!IsHealthy())
                {
                    MessageBox.Show(
                        "本地服务启动失败。\r\n请检查是否已安装 Node.js，或手动运行：\r\nnode server\\index.js",
                        "课表 SuperTable",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error);
                    return;
                }
            }

            string browser = FindBrowser();
            if (browser != null)
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = browser,
                    Arguments = "--app=" + Url + " --window-size=480,940",
                    UseShellExecute = true
                });
            }
            else
            {
                Process.Start(new ProcessStartInfo { FileName = Url, UseShellExecute = true });
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show("启动失败：" + ex.Message, "课表 SuperTable", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private static bool IsHealthy()
    {
        try
        {
            var request = (HttpWebRequest)WebRequest.Create(Url + "/api/health");
            request.Method = "GET";
            request.Timeout = 900;
            request.ReadWriteTimeout = 900;
            request.Proxy = null;
            using (var response = (HttpWebResponse)request.GetResponse())
            using (var reader = new StreamReader(response.GetResponseStream()))
            {
                string text = reader.ReadToEnd();
                return text.IndexOf("\"app\":\"supertable\"", StringComparison.Ordinal) >= 0;
            }
        }
        catch
        {
            return false;
        }
    }

    private static string FindNode(string desktopDir)
    {
        string bundled = Path.Combine(desktopDir, "runtime", "node.exe");
        if (File.Exists(bundled))
        {
            return bundled;
        }

        string path = Environment.GetEnvironmentVariable("PATH") ?? string.Empty;
        foreach (string raw in path.Split(';'))
        {
            string dir = raw.Trim().Trim('"');
            if (dir.Length == 0) continue;
            try
            {
                string candidate = Path.Combine(dir, "node.exe");
                if (File.Exists(candidate)) return candidate;
            }
            catch
            {
                /* ignore invalid PATH entries */
            }
        }

        string[] common = new string[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", "node.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "nodejs", "node.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "nodejs", "node.exe")
        };
        foreach (string candidate in common)
        {
            if (File.Exists(candidate)) return candidate;
        }
        return null;
    }

    private static string FindBrowser()
    {
        string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        string pf86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
        string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        string[] candidates = new string[]
        {
            Path.Combine(pf86, "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(pf, "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(local, "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(pf, "Google", "Chrome", "Application", "chrome.exe"),
            Path.Combine(pf86, "Google", "Chrome", "Application", "chrome.exe"),
            Path.Combine(local, "Google", "Chrome", "Application", "chrome.exe")
        };
        foreach (string candidate in candidates)
        {
            if (File.Exists(candidate)) return candidate;
        }
        return null;
    }
}
