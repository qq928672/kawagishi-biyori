# 昭和風夾娃娃機拆件（素材\夾娃娃.png，1536×1024，透明背景）
# 輸出 retro_* 與 plush_r_*，不覆蓋舊版粉色機台的切圖（舊收藏仍使用舊玩偶圖）
# 用法：powershell -ExecutionPolicy Bypass -File tools\extract-claw-retro.ps1
param(
  [string]$SrcDir = (Join-Path $PSScriptRoot "..\素材"),
  [string]$OutDir = (Join-Path $PSScriptRoot "..\public\assets\sprites")
)
$ErrorActionPreference = "Stop"
Add-Type -Path (Join-Path $PSScriptRoot "SpriteTool.cs") -ReferencedAssemblies System.Drawing
New-Item -ItemType Directory -Force $OutDir | Out-Null
$SrcDir = (Resolve-Path $SrcDir).Path
$TH = 16
$pad = 4

$img = [Img]::Load((Join-Path $SrcDir "夾娃娃.png")); $img.ClearBelow($TH)
$n = 0; $lab = $img.Label($TH, [ref]$n)
$items = [ordered]@{
  "retro_cabinet"      = @(10, 20, 530, 1015)
  "retro_frame"        = @(555, 50, 1055, 492)
  "retro_claw_open"    = @(600, 505, 805, 725)
  "retro_claw_closed"  = @(870, 505, 990, 725)
  "retro_chute"        = @(562, 768, 792, 950)
  "retro_joystick"     = @(815, 795, 910, 935)
  "retro_button"       = @(932, 852, 1038, 930)
  "plush_r_bear"       = @(1160, 35, 1425, 335)
  "plush_r_calico"     = @(1085, 350, 1290, 615)
  "plush_r_graycat"    = @(1310, 360, 1508, 618)
  "plush_r_bunny"      = @(1072, 630, 1295, 955)
  "plush_r_honeybear"  = @(1310, 712, 1510, 960)
}
foreach ($k in $items.Keys) {
  $r = $items[$k]
  $c = $img.CropRegion($lab, $r[0], $r[1], $r[2], $r[3], 40)
  $o = New-Object Img(($c.W + 2 * $pad), ($c.H + 2 * $pad)); $o.Blit($c, $pad, $pad)
  $m = $o.NormalizeAlpha()
  $o.Save((Join-Path $OutDir "$k.png"))
  Write-Host ("{0,-20} {1}x{2}  origin=({3},{4})" -f $k, $o.W, $o.H, ($c.OX - $pad), ($c.OY - $pad))
}
