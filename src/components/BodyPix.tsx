import { useRef, useEffect, useState, useCallback } from "react";
import * as tf from "@tensorflow/tfjs";
import * as bodyPix from "@tensorflow-models/body-pix";
import { saveCanvasToIndexedDB } from "../utils/db";

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
  const [autoSave, setAutoSave] = useState(false);

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

  // IndexedDBに透過PNGを保存
  const handleSaveToIndexedDB = useCallback(async () => {
    if (!canvasRef.current || !model || !videoRef.current) {
      console.warn("保存に必要な要素が準備できていません。");
      return;
    }

    try {
      const video = videoRef.current;
      const originalCanvas = canvasRef.current;

      // 保存用の一時的なcanvasを作成
      const tempCanvas = document.createElement("canvas");
      const tempCtx = tempCanvas.getContext("2d");
      if (!tempCtx) {
        console.error("Canvas コンテキストの取得に失敗しました。");
        return;
      }

      tempCanvas.width = originalCanvas.width;
      tempCanvas.height = originalCanvas.height;

      // セグメンテーション実行（保存用）
      const segmentation = await model.segmentPerson(video);

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

      // IndexedDBに保存
      const id = await saveCanvasToIndexedDB(tempCanvas);
      console.log(`画像がIndexedDBに保存されました！（ID: ${id}）`);
      return id;
    } catch (error) {
      console.error("IndexedDBへの保存エラー:", error);
      throw error;
    }
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

  // 5秒間隔で自動保存
  useEffect(() => {
    if (!autoSave || !isReady) return;

    console.log("BodyPix自動保存モード開始（5秒間隔）");
    const interval = setInterval(async () => {
      console.log("BodyPix自動保存実行中...");
      try {
        await handleSaveToIndexedDB();
      } catch (error) {
        console.error("BodyPix自動保存エラー:", error);
      }
    }, 5000);

    return () => {
      console.log("BodyPix自動保存モード停止");
      clearInterval(interval);
    };
  }, [autoSave, isReady, handleSaveToIndexedDB]);

  return (
    <>
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

        <p>状態: {getStatusText()}</p>
      </div>

      {/* UI部分を拡張 */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          marginTop: "8px",
          flexDirection: "column",
        }}
      >
        {/* 手動保存ボタン */}
        <button
          onClick={handleSaveToIndexedDB}
          disabled={!isReady}
          style={{
            padding: "8px 16px",
            fontSize: "14px",
            backgroundColor: "#2196F3",
            color: "white",
            border: "none",
            borderRadius: "4px",
          }}
        >
          手動保存
        </button>

        {/* 自動保存切り替え */}
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "14px",
            cursor: isReady ? "pointer" : "not-allowed",
          }}
        >
          <input
            type="checkbox"
            checked={autoSave}
            onChange={(e) => setAutoSave(e.target.checked)}
            disabled={!isReady}
            style={{ cursor: isReady ? "pointer" : "not-allowed" }}
          />
          <span style={{ color: isReady ? "black" : "#999" }}>
            自動保存（5秒間隔）
            {autoSave && isReady ? " 🔄" : ""}
          </span>
        </label>

        {/* 状態表示 */}
        <div
          style={{
            fontSize: "12px",
            textAlign: "center",
            color: autoSave && isReady ? "green" : "#666",
            fontWeight: autoSave && isReady ? "bold" : "normal",
          }}
        >
          {autoSave && isReady ? "自動保存実行中" : "手動保存モード"}
        </div>
      </div>
    </>
  );
};

export default BodyPix;
