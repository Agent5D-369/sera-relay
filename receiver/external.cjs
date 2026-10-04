'use strict';
const { spawn } = require('node:child_process');
const readline = require('node:readline');
function allowedRecord(url) {
  try { const u = new URL(url); return u.protocol === 'https:' && ['notion.so','www.notion.so','app.notion.com'].includes(u.hostname) && !u.username && !u.password; }
  catch { return false; }
}
// Keep the exact native window, rather than guessing a profile from chrome.exe.
// Multiple signed-in profiles can share one Chrome browser process.
function startExternal(excludedPid) {
  if (process.platform !== 'win32') throw Error('External browser routing requires Windows.');
  if (!Number.isSafeInteger(excludedPid)) throw Error('Companion browser process unavailable.');
  const script = `
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
public static class RecordBrowser {
 public delegate bool Visitor(IntPtr h, IntPtr p);
 [DllImport("user32.dll")] static extern bool EnumWindows(Visitor v, IntPtr p);
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
 [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
 [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] static extern uint SendInput(uint n, INPUT[] input, int size);
 [StructLayout(LayoutKind.Sequential)] struct MOUSE { public int x,y; public uint data,flags,time; public UIntPtr extra; }
 [StructLayout(LayoutKind.Sequential)] struct KEY { public ushort vk,scan; public uint flags,time; public UIntPtr extra; }
 [StructLayout(LayoutKind.Explicit)] struct UNION { [FieldOffset(0)] public MOUSE mouse; [FieldOffset(0)] public KEY key; }
 [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public UNION u; }
 static uint excluded; static long last; static Timer timer;
 static bool Eligible(IntPtr h) {
  if (h==IntPtr.Zero || !IsWindowVisible(h)) return false;
  uint pid; GetWindowThreadProcessId(h,out pid); if(pid==excluded) return false;
  var cls=new StringBuilder(80); GetClassName(h,cls,80); if(cls.ToString()!="Chrome_WidgetWin_1") return false;
  try { var n=Process.GetProcessById((int)pid).ProcessName; return n=="chrome" || n=="msedge"; } catch{return false;}
 }
 public static void Start(uint pid) {
  excluded=pid;
  EnumWindows((h,p)=>{if(!Eligible(h))return true;Interlocked.Exchange(ref last,h.ToInt64());return false;},IntPtr.Zero);
  timer=new Timer(_=>{var h=GetForegroundWindow();if(Eligible(h))Interlocked.Exchange(ref last,h.ToInt64());},null,0,200);
 }
 static INPUT Key(ushort vk,ushort scan,uint flags) { return new INPUT{type=1,u=new UNION{key=new KEY{vk=vk,scan=scan,flags=flags}}}; }
 static bool Send(INPUT[] a) {return SendInput((uint)a.Length,a,Marshal.SizeOf(typeof(INPUT)))==a.Length;}
 public static bool Open(string url) {
  var h=new IntPtr(Interlocked.Read(ref last));if(!Eligible(h))return false;
  ShowWindow(h,9);SetForegroundWindow(h);Thread.Sleep(150);
  if(GetForegroundWindow()!=h)return false;
  if(!Send(new[]{Key(0x11,0,0),Key(0x54,0,0),Key(0x54,0,2),Key(0x11,0,2)}))return false;
  Thread.Sleep(150);if(GetForegroundWindow()!=h)return false;
  var keys=new INPUT[url.Length*2];for(int i=0;i<url.Length;i++){keys[i*2]=Key(0,url[i],4);keys[i*2+1]=Key(0,url[i],6);}
  if(!Send(keys))return false;
  return Send(new[]{Key(0x0D,0,0),Key(0x0D,0,2)});
 }
}
'@
[RecordBrowser]::Start(${excludedPid})
[Console]::Out.WriteLine('ready')
while ($null -ne ($recordLine = [Console]::ReadLine())) {
 try {
  $recordUrl = $recordLine | ConvertFrom-Json
  $recordUri = [Uri]$recordUrl
  if ($recordUri.Scheme -ne 'https' -or $recordUri.Host -notin @('notion.so','www.notion.so','app.notion.com') -or $recordUri.UserInfo) { throw 'Invalid record link' }
  if ([RecordBrowser]::Open($recordUrl)) { [Console]::Out.WriteLine('opened') } else { [Console]::Out.WriteLine('unavailable') }
 } catch { [Console]::Out.WriteLine('unavailable') }
}
`;
  const child = spawn('powershell.exe', ['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')], {windowsHide:true,stdio:['pipe','pipe','ignore']});
  let readyResolve; const ready = new Promise(resolve=>{readyResolve=resolve;});
  let pending; const lines = readline.createInterface({input:child.stdout});
  lines.on('line',line=>{if(line==='ready')readyResolve();else if(pending){const resolve=pending;pending=null;resolve(line==='opened');}});
  child.on('error',()=>{readyResolve();if(pending){pending(false);pending=null;}});
  child.on('exit',()=>{readyResolve();if(pending){pending(false);pending=null;}});
  return {
    async open(url) {
      if (!allowedRecord(url) || pending) return false;
      await Promise.race([ready,new Promise(resolve=>setTimeout(resolve,15000))]);
      if(pending || child.exitCode!==null || !child.stdin.writable)return false;
      return new Promise(resolve=>{const timer=setTimeout(()=>{if(pending){pending=null;resolve(false);}},5000);pending=value=>{clearTimeout(timer);resolve(value);};child.stdin.write(JSON.stringify(url)+'\n');});
    },
    close(){child.stdin.end();child.kill();}
  };
}
module.exports = { allowedRecord, startExternal };
