import { useRef, useEffect, useState } from "react";
import * as tf from "@tensorflow/tfjs";
import * as bodyPix from "@tensorflow-models/body-pix";

const BodyPixTest: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [bodyPixNet, setBodyPixNet] = useState<bodyPix.BodyPix>(); // BodyPixモデル

  // 初期化(最初の一回だけ)
  useEffect(() => {
    const init = async () => {
      // TensorFlow.js初期化
      await tf.setBackend("webgl");
      await tf.ready();

      // BodyPixモデルロード
      await bodyPix.load().then((net: bodyPix.BodyPix) => setBodyPixNet(net));

      // カメラストリームを直接 video にアタッチ
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    };
    init();
  }, []);

  // セグメンテーション実行
  const runSegmentation = async () => {
    if (
      bodyPixNet &&
      videoRef.current &&
      canvasRef.current
    ) {
      const video = videoRef.current
      const canvas = canvasRef.current;

      if (!video.videoWidth || !video.videoHeight) return;

      // 1) 論理サイズを動画に合わせる
      if (
        canvas.width !== video.videoWidth ||
        canvas.height !== video.videoHeight
      ) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      // 2) 推論
      const segmentation = await bodyPixNet.segmentPerson(video);

      // 3) 背景を白で塗りつぶす見た目にするマスク
      const foregroundColor = { r: 0, g: 0, b: 0, a: 0 }; // 人物部分を透明に
      const backgroundColor = { r: 255, g: 255, b: 255, a: 255 }; // 背景を白に
      const mask = bodyPix.toMask(
        segmentation,
        foregroundColor, // 人物
        backgroundColor // 背景
      );

      // 4) 合成（flip は mirrored に合わせて true）
      bodyPix.drawMask(
        canvas,
        video,
        mask,
        1.0, // opacity: マスクを完全反映
        0, // maskBlurAmount: 0=輪郭くっきり
        true // flipHorizontal
      );
    }
  };

  // リアルタイムセグメンテーション
  useEffect(() => {
    let rafId: number;

    const loop = () => {
      runSegmentation();
      rafId = requestAnimationFrame(loop); // 描画タイミングに合わせて実行
    };

    if (bodyPixNet) {
      loop();
    }

    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId); // クリーンアップ
      }
    };
  }, [bodyPixNet]);

  return (
    <div style={{ padding: "20px" }}>
      <h2>BodyPix人物セグメンテーション</h2>

      {/* video（非表示・データソースとして使用） */}
      <video
        ref={videoRef}
        style={{ position: "absolute", left: "-9999px" }}
        muted
        playsInline
      />

      {/* セグメンテーション結果表示 */}
      <canvas ref={canvasRef} style={{ width: 640, height: 480 }} />

      <p>状態: {bodyPixNet ? "準備完了" : "モデル読み込み中..."}</p>
    </div>
  );
};

export default BodyPixTest;
