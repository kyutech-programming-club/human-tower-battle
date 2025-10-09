type Point = { x: number; y: number };
type BorderResult = {
  points: Point[];                        // 最大輪郭の点列（CCW保証は呼び出し側で）
  rect: { x: number; y: number; w: number; h: number }; // 最大輪郭の外接矩形（元画像座標系）
  size: { w: number; h: number };        // 元画像のサイズ
  centroid: { x: number; y: number };    // 最大輪郭の重心（元画像座標系）
};

export async function recognizeBorder(im: string): Promise<BorderResult> {
  const win = window as any;
  const cv = win.cv;

  return new Promise((resolve, reject) => {
    if (!im) return reject("画像パスが無効です");

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = im;

    img.onload = () => {
      try {
        if (img.width === 0 || img.height === 0) {
          reject("画像の読み込みに失敗しました（サイズ0）");
          return;
        }

        // 画像読み込み
        const src = cv.imread(img);

        // アルファ抽出
        const channels = new cv.MatVector();
        cv.split(src, channels);
        const alpha = channels.get(3);
        channels.delete();

        // --- [改善点1] 前処理：軽くぼかす → Otsu二値化 ---
        const alphaBlur = new cv.Mat();
        cv.GaussianBlur(alpha, alphaBlur, new cv.Size(3, 3), 0);

        const bin = new cv.Mat();
        cv.threshold(alphaBlur, bin, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);

        // （任意）細かいギザの除去
        const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));
        cv.morphologyEx(bin, bin, cv.MORPH_OPEN, kernel);
        kernel.delete();

        // --- [改善点2] 点間引きなしで輪郭を取得 ---
        const contours = new cv.MatVector();
        const hierarchy = new cv.Mat();
        cv.findContours(bin, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_NONE);

        let largest: cv.Mat | null = null;
        let maxArea = 0;
        for (let i = 0; i < contours.size(); i++) {
          const c = contours.get(i);
          const area = cv.contourArea(c);
          if (area > maxArea) {
            if (largest) largest.delete();
            largest = c; // 参照を保持
            maxArea = area;
          } else {
            c.delete();
          }
        }

        if (!largest) {
          // 何も見つからない場合は空を返す
          src.delete(); alpha.delete(); alphaBlur.delete(); bin.delete();
          contours.delete(); hierarchy.delete();
          resolve({ points: [], rect: { x: 0, y: 0, w: img.width, h: img.height }, size: { w: img.width, h: img.height }, centroid: { x: 0, y: 0 } });
          return;
        }

        // 画像上の輪郭の重心（スプライト基準点に使用）
        const moments = cv.moments(largest, /*binaryImage=*/ false);
        let cx = 0, cy = 0;
        if (moments.m00 !== 0) {
          cx = moments.m10 / moments.m00;
          cy = moments.m01 / moments.m00;
        }

        // --- [改善点3] 簡略化はかなり弱め or スキップ ---
        // 小さめの epsilon（弧長の0.2%程度）。完全スキップしたいなら approx を使わず largest を読む。
        const useSimplify = true;
        let pts: Point[] = [];
        let rectCv: { x: number; y: number; width: number; height: number };

        if (useSimplify) {
          const approx = new cv.Mat();
          const epsilon = 0.002 * cv.arcLength(largest, true); // 0.2%
          cv.approxPolyDP(largest, approx, epsilon, true);

          // 外接矩形
          const r = cv.boundingRect(approx);
          rectCv = r;

          // 近似後の点列を取り出し
          // approx はCV_32Sの[x0,y0,x1,y1,...]
          for (let j = 0; j < approx.data32S.length; j += 2) {
            pts.push({ x: approx.data32S[j], y: approx.data32S[j + 1] });
          }
          approx.delete();
        } else {
          const r = cv.boundingRect(largest);
          rectCv = r;

          // largest は Nx1x2 のCV_32S配列
          // data32S は [x0, y0, x1, y1, ...]
          for (let j = 0; j < largest.data32S.length; j += 2) {
            pts.push({ x: largest.data32S[j], y: largest.data32S[j + 1] });
          }
        }

        // 後片付け
        src.delete();
        alpha.delete();
        alphaBlur.delete();
        bin.delete();
        hierarchy.delete();
        contours.delete();
        if (largest) largest.delete();

        resolve({
          points: pts,
          rect: { x: rectCv.x, y: rectCv.y, w: rectCv.width, h: rectCv.height },
          size: { w: img.width, h: img.height },
          centroid: { x: cx, y: cy },
        });
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => reject("画像の読み込みに失敗しました");
  });
}