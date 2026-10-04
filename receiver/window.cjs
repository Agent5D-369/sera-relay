'use strict';
const { execFileSync } = require('node:child_process');

// A hidden parent launch can leave Chrome's native window hidden even while its
// page renders normally. CDP bringToFront alone does not restore that window.
async function showWindow(browser) {
  if (process.platform !== 'win32') return;
  const session = await browser.target().createCDPSession();
  let info;
  try { info = await session.send('SystemInfo.getProcessInfo'); }
  finally { await session.detach(); }
  const processInfo = info.processInfo.find(item => item.type === 'browser');
  if (!processInfo || !Number.isSafeInteger(processInfo.id)) throw new Error('Browser process unavailable');
  const script = `
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class VoiceBrowserWindow {
  public delegate bool Visitor(IntPtr hwnd, IntPtr value);
  [DllImport("user32.dll")] public static extern bool EnumWindows(Visitor visit, IntPtr value);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hwnd, StringBuilder name, int count);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hwnd, int command);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
  public static bool Restore(uint expected) {
    bool visible = false;
    EnumWindows((hwnd, value) => {
      uint pid; GetWindowThreadProcessId(hwnd, out pid);
      if (pid != expected) return true;
      var name = new StringBuilder(100); GetClassName(hwnd, name, 100);
      if (name.ToString() != "Chrome_WidgetWin_1") return true;
      ShowWindow(hwnd, 5); ShowWindow(hwnd, 9); SetForegroundWindow(hwnd);
      visible |= IsWindowVisible(hwnd);
      return true;
    }, IntPtr.Zero);
    return visible;
  }
}
'@
if (-not [VoiceBrowserWindow]::Restore(${processInfo.id})) { exit 1 }
`;
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
    { windowsHide: true, timeout: 15000, stdio: 'pipe' });
}
module.exports = { showWindow };
