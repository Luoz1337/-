$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$ws = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath('Desktop')
$lnkPath = Join-Path $desktop '课表SuperTable.lnk'
$lnk = $ws.CreateShortcut($lnkPath)
$lnk.TargetPath = Join-Path $here '课表SuperTable.exe'
$lnk.WorkingDirectory = $here
$lnk.IconLocation = Join-Path $here 'icon.ico'
$lnk.Description = '课表 SuperTable'
$lnk.Save()
Write-Host "Desktop shortcut created: $lnkPath"
