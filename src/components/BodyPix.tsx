import { useRef, useEffect, useState, useCallback } from "react";
import * as tf from "@tensorflow/tfjs";
import * as bodyPix from "@tensorflow-models/body-pix";

// 定数
const SEGMENTATION_CONFIG = {
  FOREGROUND_COLOR: { r: 0, g: 0, b: 0, a: 0 }, // 人物部分を透明に（元映像を表示）
  BACKGROUND_COLOR: { r: 240, g: 240, b: 240, a: 255 }, // 背景を透明に
  OPACITY: 1.0,
  BLUR_AMOUNT: 2.0,
  FLIP_HORIZONTAL: true,
} as const;

const CANVAS_STYLE = {
  width: 450,
  height: 300,
} as const;

// カスタムフック: BodyPixモデルの初期化
const useBodyPixModel = () => {
  const [model, setModel] = useState<bodyPix.BodyPix | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initializeModel = async () => {
      try {
        await tf.setBackend("webgl");
        await tf.ready();
        const net = await bodyPix.load();
        setModel(net);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "モデルの読み込みに失敗しました"
        );
      } finally {
        setIsLoading(false);
      }
    };

    initializeModel();
  }, []);

  return { model, isLoading, error };
};

// カスタムフック: カメラストリームの初期化
const useVideoStream = (videoRef: React.RefObject<HTMLVideoElement | null>) => {
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true; // コンポーネントがマウントされているかを追跡

    const initializeVideo = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });

        if (!isMounted) return; // アンマウント後は処理しない

        if (videoRef.current) {
          const video = videoRef.current;

          // 既存のストリームがある場合は停止
          if (video.srcObject) {
            const existingStream = video.srcObject as MediaStream;
            existingStream.getTracks().forEach((track) => track.stop());
          }

          video.srcObject = stream;

          // loadedmetadataイベントを待ってからplay()を実行
          const handleLoadedMetadata = async () => {
            if (!isMounted) return;

            try {
              await video.play();
              if (isMounted) {
                setIsVideoReady(true);
              }
            } catch (playError) {
              if (isMounted) {
                setError(
                  playError instanceof Error
                    ? playError.message
                    : "ビデオの再生に失敗しました"
                );
              }
            }
          };

          if (video.readyState >= 1) {
            // メタデータが既に読み込まれている場合
            handleLoadedMetadata();
          } else {
            // メタデータの読み込みを待つ
            video.addEventListener("loadedmetadata", handleLoadedMetadata, {
              once: true,
            });
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(
            err instanceof Error ? err.message : "カメラの初期化に失敗しました"
          );
        }
      }
    };

    initializeVideo();

    // クリーンアップ
    return () => {
      isMounted = false;
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
        videoRef.current.srcObject = null;
      }
    };
  }, [videoRef]);

  return { isVideoReady, error };
};

const BodyPix: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafIdRef = useRef<number | undefined>(undefined);

  const {
    model,
    isLoading: isModelLoading,
    error: modelError,
  } = useBodyPixModel();
  const { isVideoReady, error: videoError } = useVideoStream(videoRef);

  // セグメンテーション実行
  const runSegmentation = useCallback(async () => {
    if (!model || !videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video.videoWidth || !video.videoHeight) return;

    // キャンバスサイズを動画に合わせる
    if (
      canvas.width !== video.videoWidth ||
      canvas.height !== video.videoHeight
    ) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    try {
      // セグメンテーション実行
      const segmentation = await model.segmentPerson(video);

      // マスク作成
      const mask = bodyPix.toMask(
        segmentation,
        SEGMENTATION_CONFIG.FOREGROUND_COLOR,
        SEGMENTATION_CONFIG.BACKGROUND_COLOR
      );

      // 結果を描画
      bodyPix.drawMask(
        canvas,
        video,
        mask,
        SEGMENTATION_CONFIG.OPACITY,
        SEGMENTATION_CONFIG.BLUR_AMOUNT,
        SEGMENTATION_CONFIG.FLIP_HORIZONTAL
      );
    } catch (error) {
      console.error("セグメンテーション実行エラー:", error);
    }
  }, [model]);

  // リアルタイムセグメンテーションのループ
  useEffect(() => {
    if (!model || !isVideoReady) return;

    const loop = () => {
      runSegmentation();
      rafIdRef.current = requestAnimationFrame(loop);
    };

    loop();

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [model, isVideoReady, runSegmentation]);

  // 透過PNGとして保存
  const handleSavePng = useCallback(() => {
    if (!canvasRef.current || !model || !videoRef.current) return;

    const video = videoRef.current;
    const originalCanvas = canvasRef.current;

    // 保存用の一時的なcanvasを作成
    const tempCanvas = document.createElement("canvas");
    const tempCtx = tempCanvas.getContext("2d");
    if (!tempCtx) return;

    tempCanvas.width = originalCanvas.width;
    tempCanvas.height = originalCanvas.height;

    // セグメンテーション実行（保存用）
    model
      .segmentPerson(video)
      .then((segmentation) => {
        // 元の映像を描画
        tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);

        // ImageDataを取得してピクセル操作
        const imageData = tempCtx.getImageData(
          0,
          0,
          tempCanvas.width,
          tempCanvas.height
        );
        const data = imageData.data; // RGBA配列
        const mask = segmentation.data; // セグメンテーション結果（0 or 1）

        // 背景部分（mask[i] === 0）を透明にする
        for (let i = 0; i < mask.length; i++) {
          if (mask[i] === 0) {
            // 背景ピクセルのアルファ値を0に設定（透明）
            data[i * 4 + 3] = 0;
          }
          // 人物部分（mask[i] === 1）はそのまま（不透明）
        }

        // 加工したImageDataを戻す
        tempCtx.putImageData(imageData, 0, 0);

        // 透過PNGとして保存
        tempCanvas.toBlob((blob) => {
          if (!blob) return;

          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `bodypix_transparent_${Date.now()}.png`;
          link.click();
          URL.revokeObjectURL(url);
        }, "image/png");
      })
      .catch((error) => {
        console.error("透過画像保存エラー:", error);
      });
  }, [model]);

  // ステータス表示
  const getStatusText = () => {
    if (modelError || videoError) {
      return `エラー: ${modelError || videoError}`;
    }
    if (isModelLoading) {
      return "モデル読み込み中...";
    }
    if (!isVideoReady) {
      return "カメラ初期化中...";
    }
    return "準備完了";
  };

  const isReady = model && isVideoReady && !modelError && !videoError;

  return (
    <div>
      {/* 非表示のビデオ要素（データソース） */}
      <video
        ref={videoRef}
        style={{ position: "absolute", left: "-9999px" }}
        muted
        playsInline
      />

      {/* セグメンテーション結果表示 */}
      <div
        style={{
          ...CANVAS_STYLE,
          display: "inline-block",
        }}
      >
        <canvas ref={canvasRef} style={CANVAS_STYLE} />
      </div>
      
      <button onClick={handleSavePng} disabled={!isReady}>
        透過PNGを保存
      </button>

      <p>状態: {getStatusText()}</p>
    </div>
  );
};

export default BodyPix;
