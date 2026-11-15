<#
.SYNOPSIS
  把免安装版一键安装到当前用户目录。

.DESCRIPTION
  默认先打包（npm run package:dir），再把 release\win-unpacked 复制到
  %LOCALAPPDATA%\Programs\斗鱼多屏，创建开始菜单与桌面快捷方式，并写入
  “应用和功能”里的卸载信息。全程只写当前用户目录，不需要管理员权限。
  用户数据（%APPDATA%\douyu-desktop）在卸载时默认保留，除非显式 -PurgeUserData。
  安装前会接管上一次的安装：旧快捷方式和旧卸载项（哪怕应用改名）都会先清掉。

.PARAMETER Uninstall
  卸载已安装的版本（删除快捷方式、卸载项和安装目录）。

.PARAMETER Package
  打包目标：dir（默认，只出免安装目录）或 nsis（同时出安装包 exe）。
  两种目标都会生成 release\win-unpacked，安装的是这份免安装版本。

.PARAMETER SkipBuild
  跳过打包，直接安装 -Source 指向的现成免安装目录。

.PARAMETER Source
  免安装版目录，默认 release\win-unpacked。

.PARAMETER InstallDir
  安装目录，默认 %LOCALAPPDATA%\Programs\斗鱼多屏。

.PARAMETER NoDesktopShortcut
  只在开始菜单创建快捷方式。

.PARAMETER Launch
  安装完成后立即启动应用。

.PARAMETER PurgeUserData
  卸载时一并删除用户数据目录（房间、设置、观看历史都会丢失）。

.EXAMPLE
  npm run install:local

.EXAMPLE
  npm run uninstall:local

.EXAMPLE
  npm run package:install    # 打包（含安装包 exe）+ 安装

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install.ps1 -SkipBuild -InstallDir D:\Apps\斗鱼多屏
#>
[CmdletBinding()]
param(
  [switch]$Uninstall,
  [ValidateSet('dir', 'nsis')]
  [string]$Package = 'dir',
  [switch]$SkipBuild,
  [switch]$NoDesktopShortcut,
  [switch]$Launch,
  [switch]$PurgeUserData,
  [string]$Source,
  [string]$InstallDir
)

$ErrorActionPreference = 'Stop'

# 统一错误出口：不要把 PowerShell 的异常堆栈甩给用户。
trap {
  Write-Host ''
  Write-Host "失败：$($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$regKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\douyu-desktop'
$startMenuDir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
$desktopDir = [Environment]::GetFolderPath('Desktop')
$userDataDir = Join-Path $env:APPDATA 'douyu-desktop'

function Write-Step([string]$text) {
  Write-Host ''
  Write-Host "== $text" -ForegroundColor Cyan
}

function Get-MainExecutable([string]$directory) {
  # 免安装目录里主程序是最大的那个 exe，其余都是运行时辅助程序。
  if (-not (Test-Path -LiteralPath $directory)) { return $null }
  $files = @(Get-ChildItem -LiteralPath $directory -Filter *.exe -File -ErrorAction SilentlyContinue)
  if ($files.Count -eq 0) { return $null }
  return ($files | Sort-Object -Property Length -Descending | Select-Object -First 1)
}

function Assert-SafeDirectory([string]$path, [string]$label) {
  # 复制用 robocopy /MIR，会删除目标目录里多余的文件，所以先挡住危险路径。
  $full = [System.IO.Path]::GetFullPath($path)
  $trimmed = $full.TrimEnd('\')
  if ($trimmed.Length -le 3 -or $trimmed -match '^[A-Za-z]:$') {
    throw "$label 不能是盘符根目录：$full"
  }
  $forbidden = @(
    $env:USERPROFILE,
    $env:LOCALAPPDATA,
    $env:APPDATA,
    $env:ProgramFiles,
    ${env:ProgramFiles(x86)},
    $env:WINDIR
  )
  foreach ($candidate in $forbidden) {
    if ([string]::IsNullOrWhiteSpace($candidate)) { continue }
    if ($trimmed -eq ([System.IO.Path]::GetFullPath($candidate).TrimEnd('\'))) {
      throw "$label 不能是系统目录本身：$full"
    }
  }
  $repoPrefix = $repoRoot.TrimEnd('\') + '\'
  if ($repoPrefix.ToLowerInvariant().StartsWith($trimmed.ToLowerInvariant() + '\')) {
    throw "$label 不能是项目目录的上级目录：$full"
  }
  return $trimmed
}

function Invoke-TaskKill([string]$name) {
  # taskkill 把失败信息写到 stderr。$ErrorActionPreference='Stop' 下把 stderr 合并进
  # 管道会被当成终止性错误而中断整个安装，所以这里显式屏蔽，只关心进程是否真的退出了。
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & taskkill.exe /F /T /IM "$name.exe" *> $null
  } catch {
    # 忽略：真正的判据是后面还有没有同名进程。
  } finally {
    $ErrorActionPreference = $previous
  }
}

function Stop-AppProcess([string]$name) {
  $processes = @(Get-Process -Name $name -ErrorAction SilentlyContinue)
  if ($processes.Count -eq 0) { return }
  foreach ($process in $processes) {
    Write-Host "  结束正在运行的 $name（PID $($process.Id)）"
    try {
      $process.Kill()
      [void]$process.WaitForExit(5000)
    } catch {
      # Electron 的 GPU/工具子进程有时拒绝托管 Kill，用 taskkill 连进程树一起收掉。
      Invoke-TaskKill $name
    }
  }
  Start-Sleep -Milliseconds 300
  $left = @(Get-Process -Name $name -ErrorAction SilentlyContinue)
  if ($left.Count -eq 0) { return }
  Invoke-TaskKill $name
  Start-Sleep -Milliseconds 500
  $still = @(Get-Process -Name $name -ErrorAction SilentlyContinue)
  if ($still.Count -gt 0) {
    # 还在跑就复制不干净，宁可停下让人看到原因，也不要留下半新半旧的安装目录。
    throw "$name 仍在运行（$($still.Count) 个进程，例如 PID $($still[0].Id)），请先手动关闭它再重新运行。"
  }
}

function New-AppShortcut([string]$linkPath, [string]$targetPath, [string]$workingDirectory) {
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($linkPath)
  $shortcut.TargetPath = $targetPath
  $shortcut.WorkingDirectory = $workingDirectory
  $shortcut.IconLocation = "$targetPath,0"
  $shortcut.Description = [System.IO.Path]::GetFileNameWithoutExtension($targetPath)
  $shortcut.Save()
}

function Remove-IfExists([string]$path) {
  if (Test-Path -LiteralPath $path) {
    Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction SilentlyContinue
  }
}

function Test-PathInside([string]$path, [string]$directory) {
  if ([string]::IsNullOrWhiteSpace($path) -or [string]::IsNullOrWhiteSpace($directory)) {
    return $false
  }
  $prefix = $directory.TrimEnd('\') + '\'
  return $path.TrimEnd('\').ToLowerInvariant().StartsWith($prefix.ToLowerInvariant())
}

function Remove-StaleShortcuts([string]$installDir, [string]$appName) {
  # 接管上一次安装：目录里的旧快捷方式、以及旧版本换过名字留下的快捷方式都清掉，
  # 只删指向本安装目录的 .lnk，不会碰用户其它快捷方式。
  $shell = New-Object -ComObject WScript.Shell
  $folders = @($startMenuDir, $desktopDir)
  foreach ($folder in $folders) {
    if ([string]::IsNullOrWhiteSpace($folder) -or -not (Test-Path -LiteralPath $folder)) { continue }
    $links = @(Get-ChildItem -LiteralPath $folder -Filter *.lnk -File -ErrorAction SilentlyContinue)
    foreach ($link in $links) {
      $pointsHere = $false
      try {
        $target = $shell.CreateShortcut($link.FullName).TargetPath
        $pointsHere = Test-PathInside $target $installDir
      } catch {
        $pointsHere = $false
      }
      if ($pointsHere) {
        Remove-IfExists $link.FullName
        Write-Host "  清理旧快捷方式：$($link.Name)"
      }
    }
  }
  $namedLink = Join-Path $startMenuDir "$appName.lnk"
  Remove-IfExists $namedLink
}

function Remove-StaleUninstallEntries([string]$installDir) {
  # 一个安装目录只应该对应一条卸载项：如果旧版本写过别的键（例如换过 appId），先删掉。
  $root = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
  if (-not (Test-Path -LiteralPath $root)) { return }
  $keys = @(Get-ChildItem -LiteralPath $root -ErrorAction SilentlyContinue)
  foreach ($key in $keys) {
    $location = $null
    $uninstallString = $null
    try {
      $location = (Get-ItemProperty -LiteralPath $key.PSPath -Name 'InstallLocation' -ErrorAction SilentlyContinue).InstallLocation
      $uninstallString = (Get-ItemProperty -LiteralPath $key.PSPath -Name 'UninstallString' -ErrorAction SilentlyContinue).UninstallString
    } catch {
      continue
    }
    $matchesLocation = Test-PathInside ([string]$location) $installDir
    $matchesString = (-not [string]::IsNullOrWhiteSpace($uninstallString)) -and
      ([string]$uninstallString).ToLowerInvariant().Contains($installDir.ToLowerInvariant())
    if ($matchesLocation -or $matchesString) {
      Remove-Item -LiteralPath $key.PSPath -Recurse -Force -ErrorAction SilentlyContinue
      Write-Host "  清理旧卸载项：$($key.PSChildName)"
    }
  }
}

function Read-ProjectVersion {
  $packageJson = Join-Path $repoRoot 'package.json'
  if (-not (Test-Path -LiteralPath $packageJson)) { return '0.0.0' }
  try {
    $version = (Get-Content -LiteralPath $packageJson -Raw | ConvertFrom-Json).version
    if ([string]::IsNullOrWhiteSpace($version)) { return '0.0.0' }
    return [string]$version
  } catch {
    return '0.0.0'
  }
}

if ([string]::IsNullOrWhiteSpace($InstallDir)) {
  # 安装目录里的副本被调用时（卸载项、卸载.cmd），脚本所在目录就是安装目录；
  # 仓库里的 scripts 目录不带主程序，所以这里自然回落到下面的默认位置。
  $selfExe = Get-MainExecutable $PSScriptRoot
  if ($selfExe) {
    $InstallDir = $PSScriptRoot
  } else {
    $InstallDir = Join-Path $env:LOCALAPPDATA 'Programs\斗鱼多屏'
  }
}
$InstallDir = Assert-SafeDirectory $InstallDir '安装目录'

$version = Read-ProjectVersion

# ---------------------------------------------------------------- 卸载

if ($Uninstall) {
  $installedExe = Get-MainExecutable $InstallDir
  if ($installedExe) {
    $appName = [System.IO.Path]::GetFileNameWithoutExtension($installedExe.Name)
  } else {
    $appName = Split-Path -Leaf $InstallDir
  }

  Write-Step "卸载 $appName"
  Write-Host "  安装目录：$InstallDir"

  Stop-AppProcess $appName
  Stop-AppProcess 'DouyuUpdate'

  Remove-IfExists (Join-Path $startMenuDir "$appName.lnk")
  if (-not [string]::IsNullOrWhiteSpace($desktopDir)) {
    Remove-IfExists (Join-Path $desktopDir "$appName.lnk")
  }
  if (Test-Path -LiteralPath $regKey) {
    Remove-Item -LiteralPath $regKey -Recurse -Force
  }

  if ($PurgeUserData) {
    Remove-IfExists $userDataDir
    Write-Host "  已删除用户数据：$userDataDir"
  } elseif (Test-Path -LiteralPath $userDataDir) {
    Write-Host "  保留用户数据：$userDataDir（加 -PurgeUserData 可一并删除）"
  }

  if (Test-Path -LiteralPath $InstallDir) {
    $runningFromInstallDir = $PSScriptRoot.ToLowerInvariant() -eq $InstallDir.ToLowerInvariant()
    if ($runningFromInstallDir) {
      # 从安装目录里的副本运行：删不了自己所在的目录，交给一个延迟进程。
      $cleanup = "Start-Sleep -Milliseconds 800; Remove-Item -LiteralPath '" +
        ($InstallDir -replace "'", "''") + "' -Recurse -Force -ErrorAction SilentlyContinue"
      $encoded = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($cleanup))
      Start-Process -FilePath 'powershell.exe' -ArgumentList @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-EncodedCommand', $encoded
      ) -WindowStyle Hidden | Out-Null
      Write-Host '  安装目录会在后台删除。'
    } else {
      Remove-IfExists $InstallDir
      Write-Host "  已删除安装目录：$InstallDir"
    }
  }

  Write-Host ''
  Write-Host '卸载完成。' -ForegroundColor Green
  return
}

# ---------------------------------------------------------------- 安装

Write-Step '安装'

if ([string]::IsNullOrWhiteSpace($Source)) {
  $Source = Join-Path $repoRoot 'release\win-unpacked'
}
$Source = [System.IO.Path]::GetFullPath($Source)

# 先关应用再打包：否则 release\win-unpacked 里的 exe 被占用，electron-builder 会失败。
Write-Step '停止正在运行的实例'
$runningExe = Get-MainExecutable $Source
if (-not $runningExe) {
  $runningExe = Get-MainExecutable $InstallDir
}
if ($runningExe) {
  Stop-AppProcess ([System.IO.Path]::GetFileNameWithoutExtension($runningExe.Name))
}
Stop-AppProcess 'DouyuUpdate'

if (-not $SkipBuild) {
  $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if (-not $npm) {
    throw '找不到 npm.cmd；请先安装 Node.js，或用 -SkipBuild 安装现成的免安装目录。'
  }
  # nsis 目标会顺带产出安装包 exe，但两种目标的 win-unpacked 都是同一份免安装版本。
  $packageScript = 'package:dir'
  if ($Package -eq 'nsis') {
    $packageScript = 'package'
  }
  Write-Host "  打包：npm run $packageScript"
  Push-Location $repoRoot
  try {
    & $npm.Source 'run' $packageScript
    if ($LASTEXITCODE -ne 0) {
      throw "打包失败（exit $LASTEXITCODE），已停止安装。"
    }
  } finally {
    Pop-Location
  }
}

$sourceExe = Get-MainExecutable $Source
if (-not $sourceExe) {
  throw "没有在 $Source 找到可执行文件；先运行 npm run package:dir，或用 -Source 指定免安装目录。"
}

$appName = [System.IO.Path]::GetFileNameWithoutExtension($sourceExe.Name)
$targetExe = Join-Path $InstallDir $sourceExe.Name

$sourcePrefix = $Source.TrimEnd('\') + '\'
$installPrefix = $InstallDir.ToLowerInvariant() + '\'
if ($sourcePrefix.ToLowerInvariant().StartsWith($installPrefix)) {
  throw "来源目录不能位于安装目录内：$Source"
}
if ($installPrefix.StartsWith($sourcePrefix.ToLowerInvariant())) {
  throw "安装目录不能位于来源目录内：$InstallDir"
}

Write-Host "  应用：$appName $version"
Write-Host "  来源：$Source"
Write-Host "  目标：$InstallDir"

Write-Step '复制文件'
$null = New-Item -ItemType Directory -Path $InstallDir -Force
& robocopy "$Source" "$InstallDir" /MIR /NFL /NDL /NJH /NJS /NP /R:2 /W:1 | Out-Null
$robocopyExit = $LASTEXITCODE
if ($robocopyExit -ge 8) {
  throw "复制文件失败（robocopy exit $robocopyExit）。"
}
Write-Host '  复制完成'

Write-Step '创建快捷方式'
Remove-StaleShortcuts $InstallDir $appName
Remove-StaleUninstallEntries $InstallDir
$startMenuLink = Join-Path $startMenuDir "$appName.lnk"
New-AppShortcut $startMenuLink $targetExe $InstallDir
Write-Host "  开始菜单：$startMenuLink"

if (-not $NoDesktopShortcut -and -not [string]::IsNullOrWhiteSpace($desktopDir)) {
  $desktopLink = Join-Path $desktopDir "$appName.lnk"
  New-AppShortcut $desktopLink $targetExe $InstallDir
  Write-Host "  桌面：$desktopLink"
}

Write-Step '写入卸载信息'
$uninstallerPath = Join-Path $InstallDir 'install.ps1'
Copy-Item -LiteralPath $PSCommandPath -Destination $uninstallerPath -Force

$uninstallCmd = Join-Path $InstallDir '卸载.cmd'
$uninstallCmdLines = @(
  '@echo off',
  'setlocal',
  'powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" -Uninstall',
  'set "CODE=%ERRORLEVEL%"',
  'if not "%CODE%"=="0" echo Uninstall failed with exit code %CODE%.',
  'pause',
  'exit /b %CODE%'
)
Set-Content -LiteralPath $uninstallCmd -Value $uninstallCmdLines -Encoding Default

$totalBytes = 0
Get-ChildItem -LiteralPath $InstallDir -Recurse -File -ErrorAction SilentlyContinue |
  ForEach-Object { $totalBytes += $_.Length }
$sizeKb = [int][Math]::Ceiling($totalBytes / 1KB)

if (Test-Path -LiteralPath $regKey) {
  Remove-Item -LiteralPath $regKey -Recurse -Force
}
$null = New-Item -Path $regKey -Force
$uninstallCommand = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' + $uninstallerPath + '" -Uninstall'

Set-ItemProperty -LiteralPath $regKey -Name 'DisplayName' -Value "$appName $version"
Set-ItemProperty -LiteralPath $regKey -Name 'DisplayVersion' -Value $version
Set-ItemProperty -LiteralPath $regKey -Name 'Publisher' -Value 'douyu-desktop'
Set-ItemProperty -LiteralPath $regKey -Name 'InstallLocation' -Value $InstallDir
Set-ItemProperty -LiteralPath $regKey -Name 'DisplayIcon' -Value "$targetExe,0"
Set-ItemProperty -LiteralPath $regKey -Name 'UninstallString' -Value $uninstallCommand
Set-ItemProperty -LiteralPath $regKey -Name 'QuietUninstallString' -Value $uninstallCommand
Set-ItemProperty -LiteralPath $regKey -Name 'InstallDate' -Value (Get-Date -Format 'yyyyMMdd')
Set-ItemProperty -LiteralPath $regKey -Name 'EstimatedSize' -Value $sizeKb -Type DWord
Set-ItemProperty -LiteralPath $regKey -Name 'NoModify' -Value 1 -Type DWord
Set-ItemProperty -LiteralPath $regKey -Name 'NoRepair' -Value 1 -Type DWord
Write-Host "  卸载项：$regKey"

Write-Step '完成'
Write-Host "  $appName $version 已安装到：$InstallDir"
Write-Host "  用户数据：$userDataDir（重装不受影响）"
Write-Host ''
Write-Host '现在可以从开始菜单或桌面启动了。' -ForegroundColor Green

if ($Launch) {
  Start-Process -FilePath $targetExe -WorkingDirectory $InstallDir
  Write-Host '  已启动应用。'
}
