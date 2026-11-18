# 從素材板切出獨立 PNG（Windows PowerShell 5.1 即可執行，不需額外安裝）
# 用法：powershell -ExecutionPolicy Bypass -File tools\extract-sprites.ps1 [-Source 素材.png]
# - 以 alpha 連通區域找出每個物件，只保留該物件的像素（排除相鄰物件）
# - alpha < 12 的像素視為背景：alpha 與 RGB 一律歸零（素材板在透明處藏有深色光暈 RGB）
# - 主角四方向統一畫布大小，並以「腳底」對齊畫布底部中央
param(
  [string]$Source = (Join-Path $PSScriptRoot "..\素材\素材.png"),
  [string]$OutDir = (Join-Path $PSScriptRoot "..\public\assets\sprites")
)
$ErrorActionPreference = "Stop"
$src = @'
using System; using System.Collections.Generic; using System.Drawing; using System.Drawing.Imaging; using System.Runtime.InteropServices;
public class Board {
  public int W, H; public byte[] A; public int[] Lab;
  public Board(string p, int th){
    var b=new Bitmap(p); W=b.Width; H=b.Height;
    var d=b.LockBits(new Rectangle(0,0,W,H),ImageLockMode.ReadOnly,PixelFormat.Format32bppArgb);
    A=new byte[W*H*4]; Marshal.Copy(d.Scan0,A,0,A.Length); b.UnlockBits(d); b.Dispose();
    // 清除低 alpha 雜訊與隱藏 RGB
    for(int i=0;i<W*H;i++){ if(A[i*4+3]<th){ A[i*4]=0;A[i*4+1]=0;A[i*4+2]=0;A[i*4+3]=0; } }
    Lab=new int[W*H]; int id=0; var st=new Stack<int>();
    for(int i=0;i<W*H;i++){ if(Lab[i]!=0||A[i*4+3]==0) continue; id++; st.Push(i); Lab[i]=id;
      while(st.Count>0){ int p2=st.Pop(); int x=p2%W,y=p2/W;
        for(int dy=-1;dy<=1;dy++)for(int dx=-1;dx<=1;dx++){ int nx=x+dx,ny=y+dy; if(nx<0||ny<0||nx>=W||ny>=H)continue; int q=ny*W+nx; if(Lab[q]==0&&A[q*4+3]>0){Lab[q]=id;st.Push(q);} } } }
  }
  // 取得包含 (cx,cy) 附近最大區域的標籤與 bbox
  public int[] Component(int x0,int y0,int x1,int y1){
    var cnt=new Dictionary<int,int>();
    for(int y=y0;y<=y1;y++)for(int x=x0;x<=x1;x++){ int l=Lab[y*W+x]; if(l==0)continue; int c; cnt.TryGetValue(l,out c); cnt[l]=c+1; }
    int best=0,bn=0; foreach(var kv in cnt) if(kv.Value>bn){bn=kv.Value;best=kv.Key;}
    int bx0=W,by0=H,bx1=0,by1=0;
    for(int i=0;i<W*H;i++) if(Lab[i]==best){ int x=i%W,y=i/W; if(x<bx0)bx0=x; if(y<by0)by0=y; if(x>bx1)bx1=x; if(y>by1)by1=y; }
    return new int[]{best,bx0,by0,bx1,by1};
  }
  // 腳底中心 x：最底部 rows 列的不透明像素平均 x
  public double FootX(int label,int y1,int rows){ double s=0; int n=0; for(int y=y1-rows;y<=y1;y++)for(int x=0;x<W;x++) if(Lab[y*W+x]==label){s+=x;n++;} return n>0?s/n:0; }
  public void Save(int label,int sx,int sy,int cw,int ch,int dx,int dy,string path){
    var o=new byte[cw*ch*4];
    for(int y=0;y<ch;y++)for(int x=0;x<cw;x++){ int bx=sx+x-dx, by=sy+y-dy; if(bx<0||by<0||bx>=W||by>=H)continue; int i=by*W+bx; if(Lab[i]!=label)continue; int j=(y*cw+x)*4; o[j]=A[i*4];o[j+1]=A[i*4+1];o[j+2]=A[i*4+2];o[j+3]=A[i*4+3]; }
    var b=new Bitmap(cw,ch,PixelFormat.Format32bppArgb); var d=b.LockBits(new Rectangle(0,0,cw,ch),ImageLockMode.WriteOnly,PixelFormat.Format32bppArgb);
    Marshal.Copy(o,0,d.Scan0,o.Length); b.UnlockBits(d); b.Save(path,ImageFormat.Png); b.Dispose();
  }
}
'@
Add-Type -TypeDefinition $src -ReferencedAssemblies System.Drawing
New-Item -ItemType Directory -Force $OutDir | Out-Null
$board = New-Object Board((Resolve-Path $Source).Path, 12)

# 搜尋區域（素材板上的大致位置），每格只取面積最大的連通物件
$items = [ordered]@{
  "player_down"  = @(200, 0, 380, 300)
  "player_up"    = @(510, 0, 690, 300)
  "player_left"  = @(840, 0, 1020, 300)   # 素材板第三張：面向左
  "player_right" = @(1150, 0, 1330, 300)  # 素材板第四張：面向右
  "museum"       = @(30, 315, 645, 740)
  "claw_machine" = @(680, 355, 945, 730)
  "tree"         = @(990, 335, 1350, 722)
  "bench"        = @(1275, 600, 1475, 730)
  "dock"         = @(70, 775, 470, 1015)
  "fish"         = @(565, 830, 765, 960)
  "plush_cat_v1" = @(845, 790, 1015, 1000)   # 新版玩偶改用 夾娃娃.png（extract-v3.ps1）
  "bobber"       = @(1125, 840, 1205, 955)
  "rod"          = @(1240, 780, 1440, 995)
}
$pad = 4
$players = @()
foreach ($k in $items.Keys) {
  $r = $items[$k]
  $c = $board.Component($r[0], $r[1], $r[2], $r[3])
  if ($k -like "player_*") { $players += ,@($k, $c); continue }
  $cw = $c[3] - $c[1] + 1 + 2 * $pad; $ch = $c[4] - $c[2] + 1 + 2 * $pad
  $board.Save($c[0], $c[1], $c[2], $cw, $ch, $pad, $pad, (Join-Path $OutDir "$k.png"))
  "{0,-14} {1}x{2}" -f $k, $cw, $ch
}
# 主角：統一畫布，腳底對齊底部中央
$maxL = 0; $maxR = 0; $maxH = 0
$info = @()
foreach ($p in $players) {
  $c = $p[1]; $fx = $board.FootX($c[0], $c[4], 14)
  $l = $fx - $c[1]; $rr = $c[3] - $fx; $hh = $c[4] - $c[2] + 1
  $maxL = [Math]::Max($maxL, $l); $maxR = [Math]::Max($maxR, $rr); $maxH = [Math]::Max($maxH, $hh)
  $info += ,@($p[0], $c, $fx)
}
$half = [int][Math]::Ceiling([Math]::Max($maxL, $maxR)) + $pad
$cw = 2 * $half; $ch = $maxH + $pad + 2
foreach ($i in $info) {
  $c = $i[1]; $fx = [int][Math]::Round($i[2])
  # 目標：腳底中心 → x = half，最底像素 → y = ch - 3
  $board.Save($c[0], 0, 0, $cw, $ch, $half - $fx, ($ch - 3) - $c[4], (Join-Path $OutDir "$($i[0]).png"))
  "{0,-14} {1}x{2} (foot-aligned)" -f $i[0], $cw, $ch
}

# 實心部分 alpha 拉到 255
& (Join-Path $PSScriptRoot "normalize-alpha.ps1") -Dir $OutDir
