# 第二版素材切圖：物件圖、走路動畫、坐姿釣魚
# 用法：powershell -ExecutionPolicy Bypass -File tools\extract-village.ps1
# 輸出到 public/assets/sprites/
param(
  [string]$SrcDir = (Join-Path $PSScriptRoot "..\素材"),
  [string]$OutDir = (Join-Path $PSScriptRoot "..\public\assets\sprites")
)
$ErrorActionPreference = "Stop"
Add-Type -Path (Join-Path $PSScriptRoot "SpriteTool.cs") -ReferencedAssemblies System.Drawing
New-Item -ItemType Directory -Force $OutDir | Out-Null
$SrcDir = (Resolve-Path $SrcDir).Path
$TH = 16  # alpha 低於此值視為背景（含隱藏的光暈 RGB）

function Save-Crop($img, $lab, $rect, $name, $minKeep = 30, $pad = 4) {
  $c = $img.CropRegion($lab, $rect[0], $rect[1], $rect[2], $rect[3], $minKeep)
  $o = New-Object Img(($c.W + 2 * $pad), ($c.H + 2 * $pad)); $o.Blit($c, $pad, $pad)
  $o.Save((Join-Path $OutDir "$name.png"))
  Write-Host ("{0,-16} {1}x{2}" -f $name, $o.W, $o.H)
  return $o
}

# ---------- 物件圖 ----------
$board = [Img]::Load((Join-Path $SrcDir "物件圖.png")); $board.ClearBelow($TH)
$n = 0; $lab = $board.Label($TH, [ref]$n)
$objects = [ordered]@{
  "bridge"       = @(20, 70, 385, 335)
  "stone_wall"   = @(390, 70, 740, 335)
  "pier"         = @(745, 70, 1085, 335)
  "stairs"       = @(1090, 60, 1430, 335)
  "willow"       = @(20, 340, 395, 712)
  "tree_round"   = @(396, 340, 750, 712)
  "bench_wood"   = @(755, 430, 1090, 690)
  "lamp"         = @(1180, 340, 1340, 712)
  "flower_pots"  = @(10, 720, 345, 1060)
  "bicycle"      = @(348, 720, 760, 1060)
  "vending"      = @(780, 715, 1015, 1060)
  "notice_board" = @(1055, 715, 1440, 1060)
}
foreach ($k in $objects.Keys) {
  $o = Save-Crop $board $lab $objects[$k] $k
  if ($k -eq "bridge") {
    # 原圖四邊都有欄杆；移除左右兩端的側欄杆、補上橋板，讓橋的兩端開口連到河岸
    $front0 = $o.SplitFrontRail(6)[1]
    $frontTop = $front0.TopOpaque(1)
    # 拆層時前欄杆往上多留 6px；補橋板要補到欄杆紅色頂端（留 3px 給描邊）
    for ($i = 0; $i -lt $frontTop.Length; $i++) { $frontTop[$i] = $frontTop[$i] + 3 }
    # 兩端的側欄杆下緣與前欄杆相連，這幾欄改用內側前欄杆的斜率外推
    $sl = ($frontTop[66] - $frontTop[96]) / 30.0
    for ($x = 30; $x -le 65; $x++) { $frontTop[$x] = [int]($frontTop[66] + (66 - $x) * $sl) }
    $sr = ($frontTop[282] - $frontTop[252]) / 30.0
    for ($x = 283; $x -le 318; $x++) { $frontTop[$x] = [int]($frontTop[282] + ($x - 282) * $sr) }
    $posts = [int[][]]@(@(39, 0, 63, 92), @(3, 80, 31, 221), @(284, 0, 309, 92), @(316, 80, 345, 221))
    $o.OpenEnd(@(16, 26, 64, 140), @(34, 60, 64, 150), 42, $posts, $frontTop, 100.0, -0.4)
    $o.OpenEnd(@(284, 26, 332, 140), @(284, 60, 314, 150), -42, $posts, $frontTop, -39.2, 0.4)
    # 後側角柱前方原本被側欄杆擋住，用柱身乾淨的一列往下重建
    $o.RebuildColumn(40, 61, 30, 31, 90)
    $o.RebuildColumn(286, 308, 30, 31, 90)
    # 前側角柱頂端旁殘留的側欄杆接頭
    $o.ClearRect(27, 74, 33, 86)
    $o.ClearRect(314, 74, 321, 86)
    Write-Host ("  bridge front-rail top at ends: L={0} R={1}" -f $frontTop[40], $frontTop[308])
    $o.Save((Join-Path $OutDir "bridge.png"))
    $parts = $o.SplitFrontRail(6)
    $parts[0].Save((Join-Path $OutDir "bridge_back.png"))
    $parts[1].Save((Join-Path $OutDir "bridge_front.png"))
    "  -> bridge_back.png / bridge_front.png"
  }
}

# ---------- 走路動畫（4 列：下、左、右、上；每列 4 格） ----------
$walk = [Img]::Load((Join-Path $SrcDir "走路.png")); $walk.ClearBelow($TH)
$n = 0; $wl = $walk.Label($TH, [ref]$n)
$cols = 4; $rows = 4
$cw = [Math]::Floor($walk.W / $cols); $ch = [Math]::Floor($walk.H / $rows)
$frames = @()
for ($r = 0; $r -lt $rows; $r++) {
  for ($c = 0; $c -lt $cols; $c++) {
    # minKeep 400：排除下一列頭髮尖端跨進格子的碎片（否則該列會被往上推）
    $f = $walk.CropRegion($wl, $c * $cw, $r * $ch, ($c + 1) * $cw - 1, ($r + 1) * $ch - 1, 400)
    # 水平基準：上半身（頭 + 軀幹）的平均 x，避免步幅造成左右晃動
    $sx = 0.0; $sn = 0
    for ($y = 0; $y -lt [int]($f.H * 0.55); $y++) { for ($x = 0; $x -lt $f.W; $x++) { if ($f.Alpha($x, $y) -ge 128) { $sx += $x; $sn++ } } }
    $frames += , @{ img = $f; r = $r; c = $c; ax = ($sx / $sn); bottom = ($f.OY + $f.H - 1) }
  }
}
# 每列以最低的腳底為地面基準，保留步伐的自然起伏
$baseline = @{}
foreach ($fr in $frames) { if (-not $baseline.ContainsKey($fr.r) -or $fr.bottom -gt $baseline[$fr.r]) { $baseline[$fr.r] = $fr.bottom } }
$left = 0; $right = 0; $up = 0
foreach ($fr in $frames) {
  $left = [Math]::Max($left, $fr.ax); $right = [Math]::Max($right, $fr.img.W - $fr.ax)
  $lift = $baseline[$fr.r] - $fr.bottom
  $up = [Math]::Max($up, $fr.img.H + $lift)
}
$half = [int][Math]::Ceiling([Math]::Max($left, $right)) + 6
$FW = 2 * $half; $FH = [int]$up + 10
$sheet = New-Object Img(($FW * $cols), ($FH * $rows))
foreach ($fr in $frames) {
  $lift = $baseline[$fr.r] - $fr.bottom
  $dx = $fr.c * $FW + $half - [int][Math]::Round($fr.ax)
  $dy = $fr.r * $FH + ($FH - 4) - $lift - $fr.img.H
  $sheet.Blit($fr.img, $dx, $dy)
}
$sheet.Save((Join-Path $OutDir "player_walk.png"))
"player_walk.png  frame {0}x{1}, sheet {2}x{3} (feet at y={4} in each frame)" -f $FW, $FH, $sheet.W, $sheet.H, ($FH - 4)

# ---------- 坐姿釣魚 ----------
$sit = [Img]::Load((Join-Path $SrcDir "釣魚.png")); $sit.ClearBelow($TH)
$n = 0; $sl = $sit.Label($TH, [ref]$n)
$o = Save-Crop $sit $sl @(0, 0, ($sit.W - 1), ($sit.H - 1)) "player_sit_fishing" 30 4
# 竿尖：最右側的不透明像素
$tipX = 0; $tipY = 0
for ($x = $o.W - 1; $x -ge 0 -and $tipX -eq 0; $x--) { for ($y = 0; $y -lt $o.H; $y++) { if ($o.Alpha($x, $y) -ge 128) { $tipX = $x; $tipY = $y; break } } }
"  rod tip at ({0},{1}) = ({2:N3},{3:N3})" -f $tipX, $tipY, ($tipX / $o.W), ($tipY / $o.H)

# 實心部分 alpha 拉到 255
& (Join-Path $PSScriptRoot "normalize-alpha.ps1") -Dir $OutDir
