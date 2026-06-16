param(
  [ValidateSet('Debug', 'Release')]
  [string]$Configuration = 'Debug',
  [ValidateSet('x64', 'Win32', 'ARM64')]
  [string]$Platform = 'x64'
)

$ErrorActionPreference = 'Stop'

$sharedCppDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$buildDir = Join-Path $sharedCppDir "out/msbuild/$Platform/$Configuration"

Write-Host "Configuring MusicAppEngine ($Configuration | $Platform)..."
cmake -S $sharedCppDir -B $buildDir -G "Visual Studio 17 2022" -A $Platform

Write-Host "Building MusicAppEngine..."
cmake --build $buildDir --config $Configuration --target MusicAppEngine -j 8

Write-Host "Done. Static library: $buildDir/$Configuration/MusicAppEngine.lib"
