# 第三版素材切圖：建築物、場景素材圖、夾娃娃、橋、蔬菜、貓咪、主角站姿整合
# 用法：powershell -ExecutionPolicy Bypass -File tools\extract-v3.ps1
param(
  [string]$SrcDir = (Join-Path $PSScriptRoot "..\素材"),
  [string]$OutDir = (Join-Path $PSScriptRoot "..\public\assets\sprites")
)
$ErrorActionPreference = "Stop"
Add-Type -Path (Join-Path $PSScriptRoot "SpriteTool.cs") -ReferencedAssemblies System.Drawing
New-Item -ItemType Directory -Force $OutDir | Out-Null
$SrcDir = (Resolve-Path $SrcDir).Path
$TH = 16

function Crop-Sheet($file, $items, $minKeep = 20, $pad = 4) {
  $img = [Img]::Load((Join-Path $SrcDir $file)); $img.ClearBelow($TH)
  $n = 0; $lab = $img.Label($TH, [ref]$n)
  $out = @{}
  foreach ($k in $items.Keys) {
    $r = $items[$k]
    $c = $img.CropRegion($lab, $r[0], $r[1], $r[2], $r[3], $minKeep)
    $o = New-Object Img(($c.W + 2 * $pad), ($c.H + 2 * $pad)); $o.Blit($c, $pad, $pad)
    $o.Save((Join-Path $OutDir "$k.png"))
    Write-Host ("{0,-16} {1}x{2}" -f $k, $o.W, $o.H)
    $out[$k] = $o
  }
  return $out
}

# ---------- 建築物 ----------
Crop-Sheet "建築物.png" ([ordered]@{
  "bld_store"  = @(50, 25, 625, 510)
  "bld_engawa" = @(688, 40, 1497, 510)
  "bld_tea"    = @(44, 538, 605, 1002)
  "bld_farm"   = @(643, 554, 1496, 986)
}) | Out-Null

# ---------- 場景素材圖（地形） ----------
$terrain = Crop-Sheet "場景素材圖.png" ([ordered]@{
  "tile_grass"      = @(34, 27, 368, 351)
  "tile_dirt"       = @(415, 29, 747, 351)
  "tile_cobble"     = @(795, 29, 1124, 351)
  "tile_grass_dirt" = @(1172, 28, 1501, 351)
  "wall_straight"   = @(16, 454, 512, 673)
  "wall_corner_l"   = @(530, 399, 754, 673)
  "wall_corner_r"   = @(812, 399, 1032, 672)
  "stairs_stone"    = @(1061, 400, 1517, 682)
  "fish_platform"   = @(15, 754, 671, 982)
  "curb"            = @(696, 846, 989, 922)
  "reeds"           = @(1015, 767, 1219, 943)
  "rocks"           = @(1247, 810, 1519, 946)
})

# ---------- 夾娃娃拆件 ----------
Crop-Sheet "夾娃娃.png" ([ordered]@{
  "claw_cabinet"  = @(3, 8, 551, 1015)
  "claw_frame"    = @(559, 28, 1008, 482)
  "claw_open"     = @(563, 518, 794, 712)
  "claw_closed"   = @(841, 517, 970, 712)
  "claw_chute"    = @(580, 764, 959, 984)
  "plush_cat"     = @(1033, 97, 1256, 362)
  "plush_frog"    = @(1311, 111, 1513, 362)
  "plush_sheep"   = @(1025, 388, 1271, 638)
  "plush_penguin" = @(1285, 397, 1524, 633)
  "plush_bear"    = @(1024, 675, 1251, 971)
  "plush_bunny"   = @(1289, 648, 1512, 975)
}) | Out-Null

# ---------- 橋（南北向） ----------
Crop-Sheet "橋.png" ([ordered]@{ "bridge_ns" = @(196, 28, 971, 1294) }) | Out-Null

# ---------- 菜園 ----------
Crop-Sheet "蔬菜.png" ([ordered]@{
  "plot_ridged"   = @(60, 19, 562, 263)
  "plot_empty"    = @(623, 6, 924, 263)
  "garden_path"   = @(997, 69, 1473, 231)
  "crop_cabbage"  = @(4, 320, 275, 529)
  "crop_daikon"   = @(262, 280, 545, 532)
  "crop_bokchoy"  = @(548, 303, 812, 532)
  "crop_carrot"   = @(810, 313, 1049, 526)
  "crop_tomato"   = @(1059, 273, 1308, 532)
  "crop_sprout"   = @(1355, 390, 1495, 488)
  "fence_bamboo"  = @(12, 540, 364, 760)
  "fence_short"   = @(427, 538, 615, 754)
  "fence_corner"  = @(688, 555, 944, 754)
  "fence_post"    = @(1000, 534, 1078, 750)
  "garden_gate"   = @(1136, 536, 1306, 750)
  "garden_stakes" = @(1368, 540, 1488, 756)
  "watering_can"  = @(5, 793, 266, 1007)
  "hoe"           = @(276, 776, 487, 1018)
  "bucket_wood"   = @(498, 778, 684, 1016)
  "basket"        = @(707, 820, 952, 1008)
  "veg_crate"     = @(962, 767, 1279, 1016)
  "firewood"      = @(1280, 811, 1530, 1011)
}) | Out-Null

# ---------- 貓咪：12 格放進統一畫布、腳底對齊 ----------
$catImg = [Img]::Load((Join-Path $SrcDir "貓咪.png")); $catImg.ClearBelow($TH)
$n = 0; $cl = $catImg.Label($TH, [ref]$n)
$catBoxes = @(
  @(75, 36, 337, 342), @(427, 33, 646, 342), @(714, 36, 1024, 341), @(1093, 36, 1406, 341),
  @(47, 384, 356, 658), @(411, 386, 716, 656), @(769, 386, 1076, 659), @(1118, 386, 1437, 655),
  @(31, 772, 350, 1020), @(391, 761, 684, 1020), @(760, 698, 1012, 1025), @(1067, 710, 1410, 1036)
)
$cf = @(); foreach ($b in $catBoxes) { $cf += , $catImg.CropRegion($cl, $b[0], $b[1], $b[2], $b[3], 20) }
$cw = 0; $chh = 0; foreach ($f in $cf) { $cw = [Math]::Max($cw, $f.W); $chh = [Math]::Max($chh, $f.H) }
$CW = $cw + 12; $CH = $chh + 10
$catSheet = New-Object Img(($CW * 4), ($CH * 3))
for ($i = 0; $i -lt 12; $i++) {
  $f = $cf[$i]; $col = $i % 4; $row = [Math]::Floor($i / 4)
  $catSheet.Blit($f, $col * $CW + [int](($CW - $f.W) / 2), $row * $CH + ($CH - 4) - $f.H)
}
$catSheet.Save((Join-Path $OutDir "cat_sheet.png"))
Write-Host ("cat_sheet.png    frame {0}x{1} (feet at y={2})" -f $CW, $CH, ($CH - 4))

# ---------- 主角：走路 4 格 + 原始站姿（素材.png 切出）放在第 5 欄 ----------
$walk = [Img]::Load((Join-Path $OutDir "player_walk.png"))
$FW = [int]($walk.W / 4); $FH = [int]($walk.H / 4); $FOOT = $FH - 4
$sheet = New-Object Img(($FW * 5), ($FH * 4))
for ($r = 0; $r -lt 4; $r++) { $sheet.Blit($walk.SubRect(0, $r * $FH, $FW * 4, $FH), 0, $r * $FH) }
# 走路列的角色高度（腳底到頭頂），用來把站姿縮放到同一比例
function CharBox($im) { $top = $im.H; $bot = -1; for ($y = 0; $y -lt $im.H; $y++) { for ($x = 0; $x -lt $im.W; $x++) { if ($im.Alpha($x, $y) -ge 128) { if ($y -lt $top) { $top = $y }; $bot = $y; break } } }; return @($top, $bot) }
$dirs = @("down", "left", "right", "up")
for ($r = 0; $r -lt 4; $r++) {
  $ref = $walk.SubRect($FW, $r * $FH, $FW, $FH); $rb = CharBox $ref; $refH = $rb[1] - $rb[0]
  $st = [Img]::Load((Join-Path $OutDir "player_$($dirs[$r]).png")); $sb = CharBox $st; $stH = $sb[1] - $sb[0]
  $scale = $refH / $stH
  $sc = $st.Scale($scale)
  $sb2 = CharBox $sc
  # 水平：上半身中心；垂直：腳底對齊 y=316
  $sx = 0.0; $sn = 0; for ($y = $sb2[0]; $y -lt $sb2[0] + ($sb2[1] - $sb2[0]) * 0.55; $y++) { for ($x = 0; $x -lt $sc.W; $x++) { if ($sc.Alpha($x, $y) -ge 128) { $sx += $x; $sn++ } } }
  $ax = $sx / $sn
  $cell = New-Object Img($FW, $FH)
  $cell.Blit($sc, [int]($FW / 2 - $ax), $FOOT - $sb2[1])
  $sheet.Blit($cell, 4 * $FW, $r * $FH)
  Write-Host ("stand {0,-5} walkH={1} standH={2} scale={3:N3}" -f $dirs[$r], $refH, $stH, $scale)
}
$sheet.Save((Join-Path $OutDir "player_sheet.png"))
Write-Host ("player_sheet.png 5x4 frames {0}x{1}, feet y={2} (col 0-3 walk, col 4 stand)" -f $FW, $FH, $FOOT)

# ---------- 釣魚近景背景（不透明，轉成 JPG 減少檔案大小） ----------
Add-Type -AssemblyName System.Drawing
$bgDir = Join-Path $OutDir "..\bg"; New-Item -ItemType Directory -Force $bgDir | Out-Null
$bmp = [System.Drawing.Bitmap]::FromFile((Join-Path $SrcDir "釣魚近景背景.png"))
$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
$ep = New-Object System.Drawing.Imaging.EncoderParameters(1); $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]90)
$bmp.Save((Join-Path $bgDir "fishing_bg.jpg"), $enc, $ep); $bmp.Dispose()
Write-Host "bg/fishing_bg.jpg"

# ---------- 走路影格檢查：同列第 1、3 格（跨步）是否幾乎相同 ----------
for ($r = 0; $r -lt 4; $r++) {
  $a = $walk.SubRect(0, $r * $FH, $FW, $FH); $b = $walk.SubRect(2 * $FW, $r * $FH, $FW, $FH)
  $diff = 0.0; $cnt = 0
  for ($y = [int]($FH / 2); $y -lt $FH; $y++) { for ($x = 0; $x -lt $FW; $x++) { $i = ($y * $FW + $x) * 4; $da = $a.A[$i + 3]; $db = $b.A[$i + 3]; if ($da -gt 0 -or $db -gt 0) { $diff += [Math]::Abs($da - $db); $cnt++ } } }
  Write-Host ("walk row {0} ({1}): stride frames 1 vs 3 lower-body alpha diff = {2:N1}" -f $r, $dirs[$r], ($diff / [Math]::Max(1, $cnt)))
}

# 實心部分 alpha 拉到 255
& (Join-Path $PSScriptRoot "normalize-alpha.ps1") -Dir $OutDir
