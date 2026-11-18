// 素材處理工具（由 tools/*.ps1 透過 Add-Type 載入；Windows 內建 .NET 即可執行）
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public class Img {
  public int W, H; public byte[] A; // BGRA
  public Img(int w, int h) { W = w; H = h; A = new byte[w * h * 4]; }
  public static Img Load(string p) {
    var b = new Bitmap(p); var img = new Img(b.Width, b.Height);
    var d = b.LockBits(new Rectangle(0, 0, b.Width, b.Height), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
    Marshal.Copy(d.Scan0, img.A, 0, img.A.Length); b.UnlockBits(d); b.Dispose(); return img;
  }
  public void Save(string p) {
    var b = new Bitmap(W, H, PixelFormat.Format32bppArgb);
    var d = b.LockBits(new Rectangle(0, 0, W, H), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
    Marshal.Copy(A, 0, d.Scan0, A.Length); b.UnlockBits(d); b.Save(p, ImageFormat.Png); b.Dispose();
  }
  public int Alpha(int x, int y) { return A[(y * W + x) * 4 + 3]; }
  public int[] AlphaHist() { var h = new int[256]; for (int i = 3; i < A.Length; i += 4) h[A[i]]++; return h; }
  public Img OnColor(byte r, byte g, byte bl) {
    var o = new Img(W, H);
    for (int i = 0; i < A.Length; i += 4) { int al = A[i + 3];
      o.A[i] = (byte)((A[i] * al + bl * (255 - al)) / 255); o.A[i + 1] = (byte)((A[i + 1] * al + g * (255 - al)) / 255);
      o.A[i + 2] = (byte)((A[i + 2] * al + r * (255 - al)) / 255); o.A[i + 3] = 255; }
    return o;
  }
  // alpha 低於門檻 → 完全透明（含 RGB）
  public void ClearBelow(int th) { for (int i = 0; i < A.Length; i += 4) if (A[i + 3] < th) { A[i] = A[i + 1] = A[i + 2] = A[i + 3] = 0; } }

  // 去除「暗色半透明光暈」：alpha 不足且亮度很低的像素視為背景（用於黑底發光的素材）
  public void RemoveDarkGlow(int lumaMax, int alphaMax) {
    for (int i = 0; i < A.Length; i += 4) {
      int l = (A[i] * 114 + A[i + 1] * 587 + A[i + 2] * 299) / 1000;
      if (A[i + 3] <= alphaMax && l <= lumaMax) { A[i] = A[i + 1] = A[i + 2] = A[i + 3] = 0; }
    }
  }

  // 連通區域（alpha >= th，8 鄰接）
  public int[] Label(int th, out int count) {
    var lab = new int[W * H]; int id = 0; var st = new Stack<int>();
    for (int i = 0; i < W * H; i++) {
      if (lab[i] != 0 || A[i * 4 + 3] < th) continue; id++; st.Push(i); lab[i] = id;
      while (st.Count > 0) { int p = st.Pop(); int x = p % W, y = p / W;
        for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) { int nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; int q = ny * W + nx;
          if (lab[q] == 0 && A[q * 4 + 3] >= th) { lab[q] = id; st.Push(q); } } }
    }
    count = id; return lab;
  }
  public static List<int[]> Boxes(int[] lab, int w, int h, int count) {
    var bx = new int[count + 1, 5];
    for (int i = 1; i <= count; i++) { bx[i, 0] = w; bx[i, 1] = h; bx[i, 2] = -1; bx[i, 3] = -1; }
    for (int i = 0; i < lab.Length; i++) { int l = lab[i]; if (l == 0) continue; int x = i % w, y = i / w;
      if (x < bx[l, 0]) bx[l, 0] = x; if (y < bx[l, 1]) bx[l, 1] = y; if (x > bx[l, 2]) bx[l, 2] = x; if (y > bx[l, 3]) bx[l, 3] = y; bx[l, 4]++; }
    var res = new List<int[]>();
    for (int i = 1; i <= count; i++) res.Add(new int[] { i, bx[i, 0], bx[i, 1], bx[i, 2], bx[i, 3], bx[i, 4] });
    return res;
  }
  // 取出矩形範圍內「主要區域」以及與其 bbox 重疊的小碎片（例如分離的髮梢），其餘清除
  public Img CropRegion(int[] lab, int x0, int y0, int x1, int y1, int minKeep) {
    var cnt = new Dictionary<int, int>();
    for (int y = y0; y <= y1; y++) for (int x = x0; x <= x1; x++) { int l = lab[y * W + x]; if (l == 0) continue; int c; cnt.TryGetValue(l, out c); cnt[l] = c + 1; }
    var keep = new HashSet<int>(); foreach (var kv in cnt) if (kv.Value >= minKeep) keep.Add(kv.Key);
    int bx0 = W, by0 = H, bx1 = -1, by1 = -1;
    for (int y = y0; y <= y1; y++) for (int x = x0; x <= x1; x++) if (keep.Contains(lab[y * W + x])) {
      if (x < bx0) bx0 = x; if (y < by0) by0 = y; if (x > bx1) bx1 = x; if (y > by1) by1 = y; }
    if (bx1 < 0) return null;
    var o = new Img(bx1 - bx0 + 1, by1 - by0 + 1); o.OX = bx0; o.OY = by0;
    for (int y = by0; y <= by1; y++) for (int x = bx0; x <= bx1; x++) { int i = y * W + x; if (!keep.Contains(lab[i])) continue;
      int j = ((y - by0) * o.W + (x - bx0)) * 4; Array.Copy(A, i * 4, o.A, j, 4); }
    return o;
  }
  public int OX, OY;
  // 底部 rows 列不透明像素的平均 x（腳底中心）
  public double FootX(int rows, int th) {
    int yb = -1; for (int y = H - 1; y >= 0 && yb < 0; y--) for (int x = 0; x < W; x++) if (Alpha(x, y) >= th) { yb = y; break; }
    double s = 0; int n = 0; for (int y = Math.Max(0, yb - rows); y <= yb; y++) for (int x = 0; x < W; x++) if (Alpha(x, y) >= th) { s += x; n++; }
    return n > 0 ? s / n : W / 2.0;
  }
  public int Bottom(int th) { for (int y = H - 1; y >= 0; y--) for (int x = 0; x < W; x++) if (Alpha(x, y) >= th) return y; return H - 1; }
  public void Blit(Img src, int dx, int dy) {
    for (int y = 0; y < src.H; y++) for (int x = 0; x < src.W; x++) { int tx = x + dx, ty = y + dy; if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
      int s = (y * src.W + x) * 4; if (src.A[s + 3] == 0) continue; Array.Copy(src.A, s, A, (ty * W + tx) * 4, 4); }
  }
  public Img Scale(double f) {
    int nw = Math.Max(1, (int)Math.Round(W * f)), nh = Math.Max(1, (int)Math.Round(H * f));
    var b = new Bitmap(W, H, PixelFormat.Format32bppArgb);
    var d = b.LockBits(new Rectangle(0, 0, W, H), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb); Marshal.Copy(A, 0, d.Scan0, A.Length); b.UnlockBits(d);
    var nb = new Bitmap(nw, nh, PixelFormat.Format32bppArgb);
    using (var g = Graphics.FromImage(nb)) { g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic; g.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
      g.CompositingMode = System.Drawing.Drawing2D.CompositingMode.SourceCopy;
      using (var ia = new ImageAttributes()) { ia.SetWrapMode(System.Drawing.Drawing2D.WrapMode.TileFlipXY); g.DrawImage(b, new Rectangle(0, 0, nw, nh), 0, 0, W, H, GraphicsUnit.Pixel, ia); } }
    var o = new Img(nw, nh); var d2 = nb.LockBits(new Rectangle(0, 0, nw, nh), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
    Marshal.Copy(d2.Scan0, o.A, 0, o.A.Length); nb.UnlockBits(d2); b.Dispose(); nb.Dispose(); return o;
  }
  // 拆出前側欄杆：找出最靠下的紅色欄杆連通區，該區頂端以下（每一欄）歸為前景
  public Img[] SplitFrontRail(int pad) {
    var mask = new Img(W, H);
    for (int i = 0; i < W * H; i++) { int r = A[i * 4 + 2], g = A[i * 4 + 1]; if (A[i * 4 + 3] > 100 && r > 110 && r - g > 50) mask.A[i * 4 + 3] = 255; }
    int cnt; var lab = mask.Label(128, out cnt);
    var boxes = Boxes(lab, W, H, cnt); int best = 0, bestScore = -1;
    foreach (var b in boxes) { if (b[5] < 500) continue; int score = b[4] * 10 + b[5] / 1000; if (b[4] > H * 0.7 && score > bestScore) { bestScore = score; best = b[0]; } }
    var cut = new int[W]; for (int x = 0; x < W; x++) cut[x] = H;
    for (int i = 0; i < W * H; i++) if (lab[i] == best) { int x = i % W, y = i / W; if (y < cut[x]) cut[x] = y; }
    // 平滑並向上延伸 pad 像素（包含描邊）
    var front = new Img(W, H); var back = new Img(W, H);
    for (int x = 0; x < W; x++) {
      int c = H; for (int dx = -3; dx <= 3; dx++) { int xx = x + dx; if (xx >= 0 && xx < W && cut[xx] < c) c = cut[xx]; }
      if (c < H) c = Math.Max(0, c - pad);
      for (int y = 0; y < H; y++) { int i = (y * W + x) * 4; if (y >= c) Array.Copy(A, i, front.A, i, 4); else Array.Copy(A, i, back.A, i, 4); }
    }
    return new Img[] { back, front };
  }
  // 打開橋的一端：移除兩根角柱之間的側欄杆
  // erase：要清空的範圍（橋面上方的欄杆）；deck：要補上橋板的範圍（由 srcDx 位移處複製木板）
  // posts：要保留的角柱矩形；frontTop：每欄前側欄杆的頂端（以下不動）
  public void OpenEnd(int[] erase, int[] deck, int srcDx, int[][] posts, int[] frontTop, double deckTopA, double deckTopB) {
    Func<int, int, bool> inPost = (x, y) => { foreach (var p in posts) if (x >= p[0] && x <= p[2] && y >= p[1] && y <= p[3]) return true; return false; };
    for (int y = erase[1]; y <= erase[3]; y++) for (int x = erase[0]; x <= erase[2]; x++) {
      if (inPost(x, y)) continue;
      double deckTop = deckTopA + deckTopB * x;
      if (y >= deckTop && x >= deck[0] && x <= deck[2]) continue; // 交給補橋板
      int i = (y * W + x) * 4; A[i] = A[i + 1] = A[i + 2] = A[i + 3] = 0;
    }
    for (int x = deck[0]; x <= deck[2]; x++) {
      int top = (int)Math.Ceiling(deckTopA + deckTopB * x);
      int bottom = Math.Min(deck[3], frontTop[x] - 1);
      for (int y = Math.Max(deck[1], top); y <= bottom; y++) {
        if (inPost(x, y)) continue;
        int sx = x + srcDx; if (sx < 0 || sx >= W) continue;
        // 來源欄若在這一列已是前欄杆，改從欄杆上方的橋板鏡射取樣
        int lim = frontTop[sx] - 6; int sy = y;
        if (sy > lim) sy = Math.Max(top, lim - (sy - lim));
        Array.Copy(A, (sy * W + sx) * 4, A, (y * W + x) * 4, 4);
      }
    }
  }
  // 以柱子乾淨的一列（ySrc）往下重建柱身，蓋掉擋在柱子前的側欄杆
  public void RebuildColumn(int x0, int x1, int ySrc, int y0, int y1) {
    for (int y = y0; y <= y1; y++) for (int x = x0; x <= x1; x++) Array.Copy(A, (ySrc * W + x) * 4, A, (y * W + x) * 4, 4);
  }
  // 生成素材的實心部分 alpha 常只有 200～253（略透明，物件重疊時會透出後方）
  // 以出現最多的 alpha（實心內部）為基準拉到 255，保留邊緣的漸層
  public int NormalizeAlpha() {
    var h = AlphaHist(); int mode = 0, mc = 0;
    for (int i = 128; i < 256; i++) if (h[i] > mc) { mc = h[i]; mode = i; }
    if (mode == 0 || mode >= 255) return -1; // 已經正規化過（實心為 255）就不再處理，確保可重複執行
    // 膝點：≥ knee 視為實心（255），以下線性拉伸保留邊緣抗鋸齒
    int knee = Math.Min(200, mode - 20);
    bool changed = false;
    for (int i = 3; i < A.Length; i += 4) {
      int a = A[i]; if (a == 0 || a == 255) continue;
      int na = a >= knee ? 255 : (int)Math.Round(a * 255.0 / knee);
      if (na != a) { A[i] = (byte)na; changed = true; }
    }
    return changed ? mode : -1; // -1：沒有變動
  }
  public void ClearRect(int x0, int y0, int x1, int y1) {
    for (int y = y0; y <= y1; y++) for (int x = x0; x <= x1; x++) { int i = (y * W + x) * 4; A[i] = A[i + 1] = A[i + 2] = A[i + 3] = 0; }
  }
  public int[] TopOpaque(int th) {
    var t = new int[W]; for (int x = 0; x < W; x++) { t[x] = H; for (int y = 0; y < H; y++) if (Alpha(x, y) >= th) { t[x] = y; break; } } return t;
  }
  public Img SubRect(int x0, int y0, int w, int h) {
    var o = new Img(w, h);
    for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) { int sx = x0 + x, sy = y0 + y; if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue; Array.Copy(A, (sy * W + sx) * 4, o.A, (y * w + x) * 4, 4); }
    return o;
  }
}
