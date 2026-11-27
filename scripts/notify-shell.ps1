$ErrorActionPreference = 'Stop'
Add-Type -Namespace QuanY -Name Shell -MemberDefinition '[System.Runtime.InteropServices.DllImport("shell32.dll")] public static extern void SHChangeNotify(int evt, uint flags, System.IntPtr first, System.IntPtr second);'
[QuanY.Shell]::SHChangeNotify(0x08000000, 0x1000, [IntPtr]::Zero, [IntPtr]::Zero)
