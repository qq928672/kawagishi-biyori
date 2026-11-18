# 故事館圖片匯入：從「承翰_自我介紹簡報」複製並縮圖到 public/assets/museum/
# 文字與圖片的對應寫在 src/data/museumExhibits.js；這裡只負責檔案。
# 用法：powershell -ExecutionPolicy Bypass -File tools\import-museum.ps1
param(
  [string]$SrcDir = (Join-Path $PSScriptRoot "..\承翰_自我介紹簡報"),
  [string]$OutDir = (Join-Path $PSScriptRoot "..\public\assets\museum")
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force $OutDir | Out-Null
$SrcDir = (Resolve-Path $SrcDir).Path

# 來源（相對於簡報資料夾） → 輸出檔名
$map = [ordered]@{
  "研究所\圖片1.png"                                   = "lab-platform-main.jpg"
  "研究所\示意_商城.png"                               = "lab-platform-shop.jpg"
  "研究所\示意_答題對戰.png"                           = "lab-platform-quiz.jpg"
  "研究所\圖片2.png"                                   = "lab-add-reminder.jpg"
  "營隊\已模糊\LINE_ALBUM_D梯次貼文_261116_1.jpg"      = "camp-1.jpg"
  "營隊\已模糊\LINE_ALBUM_D梯次貼文_261116_2.jpg"      = "camp-2.jpg"
  "鶯歌實境解謎截圖-20261116T135037Z-1-001\結尾宣傳圖.jpg" = "yingge-poster.jpg"
  "小城謎走\459502_0.jpg"                              = "chiayi-cards.jpg"
  "興趣\459504_0.jpg"                                  = "hobby-concert.jpg"
  "興趣\459515_0.jpg"                                  = "hobby-hiking.jpg"
  "興趣\閱讀_書1_無路之路.png"                         = "book-1.png"
  "興趣\閱讀_書2_納瓦爾寶典.png"                       = "book-2.png"
  "興趣\閱讀_書3_拖延症.png"                           = "book-3.png"
}
# GDI+ 無法讀 webp：原檔直接複製
$copy = [ordered]@{
  "小城謎走\d91c641a-353a-4e24-8acd-07990df2708a.webp" = "chiayi-poster.webp"
  "小城謎走\049370c5-3cdb-498c-924d-52262ebf94fe.webp" = "chiayi-stationmaster.webp"
  "鶯歌實境解謎.mp4"                                   = "yingge-trailer.mp4"
}

$jpg = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$ep = New-Object System.Drawing.Imaging.EncoderParameters 1
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 86L
$MAX = 1280

foreach ($k in $map.Keys) {
  $src = Join-Path $SrcDir $k
  if (-not (Test-Path -LiteralPath $src)) { Write-Warning "找不到：$k"; continue }
  $im = [System.Drawing.Image]::FromFile($src)
  $s = [Math]::Min(1.0, $MAX / [Math]::Max($im.Width, $im.Height))
  $w = [int][Math]::Round($im.Width * $s); $h = [int][Math]::Round($im.Height * $s)
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $out = Join-Path $OutDir $map[$k]
  if ($out.EndsWith('.png')) { $g.Clear([System.Drawing.Color]::Transparent) } else { $g.Clear([System.Drawing.Color]::White) }
  $g.DrawImage($im, 0, 0, $w, $h)
  if ($out.EndsWith('.png')) { $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png) } else { $bmp.Save($out, $jpg, $ep) }
  $g.Dispose(); $bmp.Dispose(); $im.Dispose()
  Write-Host ("{0,-28} {1}x{2}" -f $map[$k], $w, $h)
}
foreach ($k in $copy.Keys) {
  $src = Join-Path $SrcDir $k
  if (-not (Test-Path -LiteralPath $src)) { Write-Warning "找不到：$k"; continue }
  Copy-Item -LiteralPath $src (Join-Path $OutDir $copy[$k]) -Force
  Write-Host ("{0,-28} (複製)" -f $copy[$k])
}
