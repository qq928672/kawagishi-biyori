# 把 public/assets/sprites 內所有 PNG 的實心部分 alpha 拉到 255（保留邊緣漸層）
# 各切圖腳本最後都會呼叫；可重複執行（已是 255 的圖不會變動）
param([string]$Dir = (Join-Path $PSScriptRoot "..\public\assets\sprites"))
$ErrorActionPreference = "Stop"
if (-not ("Img" -as [type])) { Add-Type -Path (Join-Path $PSScriptRoot "SpriteTool.cs") -ReferencedAssemblies System.Drawing }
Get-ChildItem $Dir -Filter *.png | ForEach-Object {
  $im = [Img]::Load($_.FullName)
  $mode = $im.NormalizeAlpha()
  if ($mode -ge 0) { $im.Save($_.FullName); Write-Host ("alpha {0,-22} solid {1} -> 255" -f $_.Name, $mode) }
}
