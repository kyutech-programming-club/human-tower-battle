export async function recognizeBorder(
  im: string
): Promise<{ x: number; y: number }[]> {
  const win = window as any;
  const cv = win.cv;

  return new Promise((resolve, reject) => {
    if (!im) {
      reject("画像パスが無効です");
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = im;

    img.onload = () => {
      try {
        if (img.width === 0 || img.height === 0) {
          reject("画像の読み込みに失敗しました（サイズ0）");
          return;
        }

        const src = cv.imread(img);
        const dst = new cv.Mat();
        const contours = new cv.MatVector();
        const hierarchy = new cv.Mat();

        // アルファチャンネル抽出
        const channels = new cv.MatVector();
        cv.split(src, channels);
        const alpha = channels.get(3);
        channels.delete();

        // 二値化
        cv.threshold(alpha, dst, 0, 255, cv.THRESH_BINARY);

        // 輪郭検出
        cv.findContours(
          dst,
          contours,
          hierarchy,
          cv.RETR_EXTERNAL,
          cv.CHAIN_APPROX_SIMPLE
        );

        // --- 一番外側の輪郭を選択 ---
        let largestContour: { x: number; y: number }[] = [];
        let maxArea = 0;
        for (let i = 0; i < contours.size(); i++) {
          const contour = contours.get(i);
          const area = cv.contourArea(contour);
          if (area > maxArea) {
            maxArea = area;

            // 輪郭簡略化
            const approx = new cv.Mat();
            const epsilon = 0.01 * cv.arcLength(contour, true); // 1%を調整
            cv.approxPolyDP(contour, approx, epsilon, true);

            const points: { x: number; y: number }[] = [];
            for (let j = 0; j < approx.data32S.length; j += 2) {
              points.push({ x: approx.data32S[j], y: approx.data32S[j + 1] });
            }
            largestContour = points;

            approx.delete();
          }
          contour.delete();
        }

        // for (let i = 0; i < contours.size(); i++) {
        //   const contour = contours.get(i);
        //   const area = cv.contourArea(contour);
        //   if (area > maxArea) {
        //     maxArea = area;
        //     const points: { x: number; y: number }[] = [];
        //     for (let j = 0; j < contour.data32S.length; j += 2) {
        //       points.push({ x: contour.data32S[j], y: contour.data32S[j + 1] });
        //     }
        //     largestContour = points;
        //   }
        //   contour.delete();
        // }

        // メモリ解放
        src.delete();
        alpha.delete();
        dst.delete();
        hierarchy.delete();
        contours.delete();

        resolve(largestContour); // ← 一番大きい輪郭だけ返す
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => reject("画像の読み込みに失敗しました");
  });
}
