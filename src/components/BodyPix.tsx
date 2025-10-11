import {
  useRef,
  useEffect,
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import * as tf from "@tensorflow/tfjs";
import * as bodyPix from "@tensorflow-models/body-pix";
import { saveCanvasToIndexedDB } from "../utils/db";

// =======================================
// 定数
// =======================================
const SEGMENTATION_CONFIG = {
  OPACITY: 1.0,
  BLUR_AMOUNT: 2.0,
  FLIP_HORIZONTAL: true,
} as const;

const CANVAS_STYLE = {
  width: 500,
  height: 333,
} as const;

// =======================================
// グリーン検出 & 共通処理（追加）
// =======================================

// RGB(0..255) → HSV(度/0..1/0..1)
const rgbToHsv = (r: number, g: number, b: number) => {
  const rf = r / 255,
    gf = g / 255,
    bf = b / 255;
  const max = Math.max(rf, gf, bf),
    min = Math.min(rf, gf, bf);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    switch (max) {
      case rf:
        h = ((gf - bf) / d) % 6;
        break;
      case gf:
        h = (bf - rf) / d + 2;
        break;
      case bf:
        h = (rf - gf) / d + 4;
        break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  const v = max;
  return { h, s, v };
};

// クロマキー（緑）とみなす範囲：現場に応じて調整可
const GREEN_KEY = {
  H_MIN: 70, // 黄緑寄りなら 60 に下げる
  H_MAX: 160, // 青緑寄りなら 170 へ上げる
  S_MIN: 0.25, // 彩度しきい
  V_MIN: 0.2, // 明度しきい
};

const isGreenPixel = (r: number, g: number, b: number) => {
  const { h, s, v } = rgbToHsv(r, g, b);
  return (
    h >= GREEN_KEY.H_MIN &&
    h <= GREEN_KEY.H_MAX &&
    s >= GREEN_KEY.S_MIN &&
    v >= GREEN_KEY.V_MIN
  );
};

// 人物マスク（0/1）から「緑っぽい部分」を除いた補正マスクを返す
const refineMaskWithGreen = (
  personMask: Uint8Array | Int32Array | number[],
  imageData: ImageData
) => {
  const data = imageData.data; // RGBA
  const n = personMask.length;
  const refined = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (personMask[i] === 1) {
      const idx = i * 4;
      const r = data[idx],
        g = data[idx + 1],
        b = data[idx + 2];
      refined[i] = isGreenPixel(r, g, b) ? 0 : 1;
    } else {
      refined[i] = 0;
    }
  }
  return refined;
};

// BodyPixのデフォルト推論オプション
const DEFAULT_SEGMENT_OPTS = {
  flipHorizontal: SEGMENTATION_CONFIG.FLIP_HORIZONTAL,
  internalResolution: "medium" as const,
  segmentationThreshold: 0.7,
};

/**
 * 共通処理：
 * 1) segmentPerson
 * 2) (必要なら反転して) video を canvas に描画
 * 3) imageData を取得
 * 4) 緑除去補正マスク生成
 * 5) αを書き換え（人物=255, 背景=0）
 * 6) putImageData
 */
const segmentDrawAndApplyAlpha = async (params: {
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  model: bodyPix.BodyPix;
  segmentOpts?: Partial<typeof DEFAULT_SEGMENT_OPTS>;
}) => {
  const { video, canvas, model, segmentOpts } = params;
  const opts = { ...DEFAULT_SEGMENT_OPTS, ...(segmentOpts ?? {}) };

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D context not available");

  // キャンバスサイズ同期
  if (
    canvas.width !== video.videoWidth ||
    canvas.height !== video.videoHeight
  ) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }

  // 1) セグメンテーション
  const segmentation = await model.segmentPerson(video, opts);
  const segW = segmentation.width;
  const segH = segmentation.height;
  // マスク（0/1）を取得
  let personMask: Uint8Array | Int32Array | number[] = segmentation.data;
  // キャンバス描画を左右反転しているため、マスクも左右反転して揃える
  if (opts.flipHorizontal) {
    const flipped = new Uint8Array(segW * segH);
    for (let y = 0; y < segH; y++) {
      const row = y * segW;
      for (let x = 0; x < segW; x++) {
        // 左右入れ替え
        flipped[row + x] = (personMask as any)[row + (segW - 1 - x)];
      }
    }
    personMask = flipped;
  }

  // 2) フレーム描画（必要なら左右反転）
  ctx.save();
  if (opts.flipHorizontal) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, canvas.width, 
    canvas.height);
  ctx.restore();

  // 3) ピクセル取得
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  // 4) 緑除去補正マスク
  const refinedMask = refineMaskWithGreen(personMask as Uint8Array, imageData);

  // 5) αを書き換え（人物=255 / 背景=0）
  const data = imageData.data;
  for (let i = 0; i < refinedMask.length; i++) {
    data[i * 4 + 3] = refinedMask[i] ? 255 : 0;
  }

  // 6) 描画更新
  ctx.putImageData(imageData, 0, 0);

  return { refinedMask, imageData, ctx };
};

// =======================================
// カスタムフック: BodyPixモデルの初期化
// =======================================
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

// =======================================
// カスタムフック: カメラストリームの初期化
// =======================================
const useVideoStream = (videoRef: React.RefObject<HTMLVideoElement | null>) => {
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const initializeVideo = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });

        if (!isMounted) return;

        if (videoRef.current) {
          const video = videoRef.current;

          // 既存ストリームがある場合は停止
          if (video.srcObject) {
            const existingStream = video.srcObject as MediaStream;
            existingStream.getTracks().forEach((track) => track.stop());
          }

          video.srcObject = stream;

          const handleLoadedMetadata = async () => {
            if (!isMounted) return;
            try {
              await video.play();
              if (isMounted) setIsVideoReady(true);
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
            handleLoadedMetadata();
          } else {
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

// =======================================
// コンポーネント本体
// =======================================

// 外部から呼び出し可能な関数の型定義
export interface BodyPixRef {
  saveToIndexedDB: () => Promise<number | undefined>;
  isReady: () => boolean;
  getStatus: () => string;
}

interface BodyPixProps {
  onSaveComplete?: (imageId: number) => void;
}

const BodyPix = forwardRef<BodyPixRef, BodyPixProps>(
  ({ onSaveComplete }, ref) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rafIdRef = useRef<number | undefined>(undefined);

    const {
      model,
      isLoading: isModelLoading,
      error: modelError,
    } = useBodyPixModel();
    const { isVideoReady, error: videoError } = useVideoStream(videoRef);

    // セグメンテーション（ライブ表示）
    const runSegmentation = useCallback(async () => {
      if (!model || !videoRef.current || !canvasRef.current) return;
      try {
        await segmentDrawAndApplyAlpha({
          video: videoRef.current,
          canvas: canvasRef.current,
          model,
          // segmentOpts: { segmentationThreshold: 0.75 }, // 必要なら上書き
          segmentOpts: { flipHorizontal: true }
        });
      } catch (error) {
        console.error("セグメンテーション実行エラー:", error);
      }
    }, [model]);

    // リアルタイムループ
    useEffect(() => {
      if (!model || !isVideoReady) return;

      const loop = () => {
        runSegmentation();
        rafIdRef.current = requestAnimationFrame(loop);
      };

      loop();

      return () => {
        if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      };
    }, [model, isVideoReady, runSegmentation]);

    // IndexedDBに透過PNGを保存
    const handleSaveToIndexedDB = useCallback(async () => {
      if (!model || !videoRef.current) {
        console.warn("保存に必要な要素が準備できていません。");
        return;
      }

      try {
        const video = videoRef.current;

        // 保存は一時キャンバスを使用（UIキャンバスには触れない）
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = video.videoWidth;
        tempCanvas.height = video.videoHeight;

        await segmentDrawAndApplyAlpha({
          video,
          canvas: tempCanvas,
          model,
          segmentOpts: { flipHorizontal: true }
        });

        const id = await saveCanvasToIndexedDB(tempCanvas);
        console.log(`画像がIndexedDBに保存されました！（ID: ${id}）`);

        // 保存完了コールバック実行
        if (onSaveComplete && id) {
          onSaveComplete(id);
        }

        return id;
      } catch (error) {
        console.error("IndexedDBへの保存エラー:", error);
        throw error;
      }
    }, [model, onSaveComplete]);

    // 外部から呼び出し可能な関数を公開
    useImperativeHandle(
      ref,
      () => ({
        saveToIndexedDB: handleSaveToIndexedDB,
        isReady: () => !!(model && isVideoReady && !modelError && !videoError),
        getStatus: () => {
          if (modelError || videoError)
            return `エラー: ${modelError || videoError}`;
          if (isModelLoading) return "モデル読み込み中...";
          if (!isVideoReady) return "カメラ初期化中...";
          return "準備完了";
        },
      }),
      [
        handleSaveToIndexedDB,
        model,
        isVideoReady,
        modelError,
        videoError,
        isModelLoading,
      ]
    );

    return (
      <div>
        {/* 非表示のビデオ要素（データソース） */}
        <video
          ref={videoRef}
          style={{ position: "absolute", left: "-9999px"}}
          muted
          playsInline
        />

        {/* セグメンテーション結果表示 */}
        <div style={{ ...CANVAS_STYLE, display: "inline-block" }}>
          <canvas ref={canvasRef} style={CANVAS_STYLE} />
        </div>
      </div>
    );
  }
);

BodyPix.displayName = "BodyPix";

export default BodyPix;
