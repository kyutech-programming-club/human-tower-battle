import styles from "./GameCanvas.module.css";
import React, { useEffect, useRef, useState, useCallback } from "react";
import Matter from "matter-js";
import BodyPix from "./BodyPix.tsx";
import { useNavigate } from "react-router-dom";
import { BlockManager } from "./BlockManager.tsx";
import { createStage1 } from "../stages/Stage1.tsx";
import { createStage2 } from "../stages/Stage2.tsx";
import { recognizeBorder } from "./RecognizeBorder.tsx";
import decomp from "poly-decomp";
import { createStage3 } from "../stages/Stage3.tsx";
import {
  getLatestImageIdFromIndexedDB,
  getImageFromIndexedDB,
} from "../utils/db.ts";

type StageFactory = (
  world: Matter.World,
  ctx: CanvasRenderingContext2D
) => { draw: () => void };

interface GameCanvasProps {
  stage: "stage1" | "stage2" | "stage3"; // ← propsでステージを選べるように
}

const GameCanvas: React.FC<GameCanvasProps> = ({ stage }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef(Matter.Engine.create());
  const navigate = useNavigate();
  const blockManagerRef = useRef(new BlockManager());

  // refs to avoid stale-closure issues
  const stageObjRef = useRef<{ draw: () => void } | null>(null);
  const isGameOverRef = useRef<boolean>(false);
  const countdownRef = useRef<number | null>(null);
  const blockCountRef = useRef<number>(0);

  const [isGameOver, setIsGameOver] = useState(false);
  const [blockCount, setBlockCount] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [position, setPosition] = useState(400);
  const scale = 0.3;
  const [edgePoints, setEdgePoints] = useState<{ x: number; y: number }[]>([]);
  const [isSpawning, setIsSpawning] = useState(false); // スペースキー処理中フラグ
  // IDベースの画像管理
  const [imageMap, setImageMap] = useState<Map<number, HTMLImageElement>>(
    new Map()
  );
  const [currentImageId, setCurrentImageId] = useState<number | null>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null); // Object URLを保存

  // 新規追加: 自動ブロック生成制御
  const [autoBlockGeneration, setAutoBlockGeneration] = useState(false);
  const [lastProcessedImageId, setLastProcessedImageId] = useState<
    number | null
  >(null);

  // 最新画像をプリロードするuseEffect
  useEffect(() => {
    const preloadLatestImage = async () => {
      try {
        const latestImageId = await getLatestImageIdFromIndexedDB();

        if (latestImageId !== null && latestImageId !== currentImageId) {
          // 新しい画像がある場合
          const imageUrl = await getImageFromIndexedDB(latestImageId);
          if (imageUrl) {
            const img = new Image();
            img.onload = () => {
              console.log(
                `最新画像ID ${latestImageId} プリロード完了:`,
                img.width,
                img.height
              );
              setCurrentImageId(latestImageId);
              setCurrentImageUrl(imageUrl); // Object URLを保存
              setImageMap((prev) => new Map(prev).set(latestImageId, img));
            };
            img.onerror = () => {
              console.error(`最新画像ID ${latestImageId} プリロード失敗`);
            };
            img.src = imageUrl;
          } else {
            console.error(`画像ID ${latestImageId} の取得に失敗しました`);
          }
        } else if (latestImageId === null) {
          // DBに画像がない場合はエラーを出力
          console.error(
            "IndexedDBに保存された画像がありません。BodyPixで画像を保存してください。"
          );
        }
      } catch (error) {
        console.error("最新画像のプリロードに失敗:", error);
      }
    };

    preloadLatestImage();

    // 定期的にチェック（5秒間隔）
    const interval = setInterval(preloadLatestImage, 5000);

    return () => clearInterval(interval);
  }, []); // 空の依存配列に変更

  // コンポーネントアンマウント時のクリーンアップ
  useEffect(() => {
    return () => {
      // Object URLを解放してメモリリークを防ぐ
      imageMap.forEach((img, id) => {
        if (id !== -1) {
          // デフォルト画像以外
          URL.revokeObjectURL(img.src);
        }
      });

      // currentImageUrlも解放（Object URLの場合のみ）
      if (currentImageUrl && currentImageUrl.startsWith("blob:")) {
        URL.revokeObjectURL(currentImageUrl);
      }
    };
  }, []); // 空の依存配列でアンマウント時のみ実行

  // 新規追加: 自動ブロック生成機能
  useEffect(() => {
    if (!autoBlockGeneration) return;

    console.log("GameCanvas自動ブロック生成モード開始");
    const interval = setInterval(async () => {
      try {
        console.log("GameCanvas自動処理チェック中...");

        // 最新画像IDを取得
        const latestImageId = await getLatestImageIdFromIndexedDB();

        if (latestImageId === null) {
          console.log(
            "IndexedDBに画像がありません（BodyPixで画像を保存してください）"
          );
          return;
        }

        // 新しい画像があるかチェック
        if (
          latestImageId !== lastProcessedImageId &&
          !isSpawning &&
          !isGameOver
        ) {
          console.log(
            `新しい画像検出（ID: ${latestImageId}）→ブロック生成開始`
          );

          try {
            await spawnTargetImg();
            setLastProcessedImageId(latestImageId);
            console.log("GameCanvas自動ブロック生成完了");
          } catch (error) {
            console.error("GameCanvasブロック生成エラー:", error);
          }
        } else if (latestImageId === lastProcessedImageId) {
          console.log("GameCanvas新しい画像なし");
        } else if (isSpawning) {
          console.log("GameCanvasスポーン処理中のため待機");
        } else if (isGameOver) {
          console.log("GameCanvasゲームオーバー中のため待機");
        }
      } catch (error) {
        console.error("GameCanvas自動処理エラー:", error);
      }
    }, 6000); // 6秒間隔でチェック

    return () => {
      console.log("GameCanvas自動ブロック生成モード停止");
      clearInterval(interval);
    };
  }, [autoBlockGeneration, lastProcessedImageId, isSpawning, isGameOver]);

  // 新規追加: 初期化時に現在の最新IDを設定
  useEffect(() => {
    const initializeLastProcessedId = async () => {
      try {
        const latestId = await getLatestImageIdFromIndexedDB();
        setLastProcessedImageId(latestId);
        console.log("GameCanvas初期化: 最新画像ID =", latestId);
      } catch (error) {
        console.error("GameCanvas初期化エラー:", error);
      }
    };

    initializeLastProcessedId();
  }, []);

  // spawnTargetImg関数をuseCallbackとして独立
  const spawnTargetImg = useCallback(async () => {
    // 処理中の場合は早期リターン
    if (isSpawning) {
      console.log("処理中のため、スキップします");
      return;
    }

    setIsSpawning(true);

    try {
      // まず最新の画像をチェック
      const latestImageId = await getLatestImageIdFromIndexedDB();

      if (latestImageId === null) {
        console.error(
          "画像がIndexedDBに保存されていません。先にBodyPixで画像を生成・保存してください。"
        );
        return;
      }

      // 現在のIDと異なる場合は最新画像をロード
      let imageToUse = currentImageUrl;
      let imageId = currentImageId;

      if (latestImageId !== currentImageId) {
        console.log(
          `新しい画像を検出（ID: ${latestImageId}）、プリロード中...`
        );
        const newImageUrl = await getImageFromIndexedDB(latestImageId);
        if (newImageUrl) {
          const img = new Image();
          await new Promise<void>((resolve, reject) => {
            img.onload = () => {
              setCurrentImageId(latestImageId);
              setCurrentImageUrl(newImageUrl);
              setImageMap((prev) => new Map(prev).set(latestImageId, img));
              imageToUse = newImageUrl;
              imageId = latestImageId;
              console.log(`新しい画像ID ${latestImageId} のプリロード完了`);
              resolve();
            };
            img.onerror = () =>
              reject(new Error(`画像ID ${latestImageId} のロードに失敗`));
            img.src = newImageUrl;
          });
        } else {
          console.error(`画像ID ${latestImageId} の取得に失敗しました`);
          return;
        }
      }

      if (!imageToUse) {
        console.error("使用可能な画像がありません。");
        return;
      }

      const test = await recognizeBorder(imageToUse);
      setEdgePoints(test);
      console.log("recognizeBorder完了:", test.length, "points");

      // CCW補正して [number, number][] に
      const vertices: [number, number][] = ensureCCW(
        test.map((p) => [p.x * scale, p.y * scale] as [number, number])
      );
      console.log("vertices生成完了:", vertices.length, "vertices");

      // 凸分割
      const convexPolygons: [number, number][][] = decomp.quickDecomp(vertices);
      console.log("凸分割完了:", convexPolygons.length, "polygons");

      // Matter.js の Vector[][] に変換
      const matterPolygons: Matter.Vector[][] = convexPolygons.map((polygon) =>
        polygon.map(([x, y]) => ({ x, y }))
      );

      // 各凸ポリゴンから Body を作成
      const parts = matterPolygons.map((polygon, index) => {
        const centroid = getCentroid(polygon);
        const shiftedPolygon = polygon.map((v) => ({
          x: v.x - centroid.x,
          y: v.y - centroid.y,
        }));

        const body = Matter.Bodies.fromVertices(
          centroid.x, // 各パートの重心位置
          centroid.y,
          [shiftedPolygon],
          {
            isStatic: false,
            friction: 0.1,
            restitution: 0.3,
          }
        );

        console.log(`Part ${index} 生成完了:`, centroid);
        return body;
      });

      // すべてのpartsを1つのcompound bodyに統合
      const compoundBody = Matter.Body.create({
        parts: parts,
        label: "TargetImg",
      });

      // BodyにカスタムプロパティとしてimageIdを追加
      (compoundBody as any).imageId = imageId;

      // 統合されたbodyの位置を設定
      Matter.Body.setPosition(compoundBody, { x: 225, y: 50 });

      // 1つのcompound bodyをworldに追加
      console.log("1つのcompound bodyをWorldに追加");
      Matter.World.add(engineRef.current.world, compoundBody);
      console.log("オブジェクト生成完了！");

      engineRef.current.positionIterations = 10;
      engineRef.current.velocityIterations = 10;
    } catch (error) {
      console.error("オブジェクト生成に失敗しました:", error);
    } finally {
      setIsSpawning(false); // 処理完了フラグをリセット
    }
  }, [isSpawning, currentImageUrl, currentImageId, scale, edgePoints]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let animationFrameId: number;
    const engine = engineRef.current;
    const world = engine.world;

    // ステージ選択
    let stageFactory: StageFactory;
    if (stage === "stage1") {
      stageFactory = createStage1;
    } else if (stage === "stage2") {
      stageFactory = createStage2;
    } else {
      stageFactory = createStage3;
    }
    stageObjRef.current = stageFactory(world, ctx);

    // エンターキーでブロック生成
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.code === "Enter" && !isGameOver && !isSpawning) {
        console.log("エンターキー押下 → 手動ブロック生成");
        spawnTargetImg();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    const update = () => {
      const engine = engineRef.current;
      const world = engine.world;

      // 物理を進めるかどうか
      if (!isGameOverRef.current) {
        Matter.Engine.update(engine, 1000 / 60);
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // ブロックカウント表示
      ctx.fillStyle = "black";
      ctx.font = "20px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`人数: ${blockCountRef.current}人`, 10, 30);

      // ステージ描画
      stageObjRef.current?.draw();

      // ブロック描画
      ctx.fillStyle = "blue";
      blockManagerRef.current.blocks.forEach((b) => {
        const pos = b.body.position;
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(b.body.angle);
        ctx.fillRect(-30, -30, 60, 60);
        ctx.restore();
      });

      // 親Bodyのpartsをループ
      for (const body of world.bodies) {
        if (body.label !== "TargetImg") continue;

        // BodyからimageIdを取得
        const bodyImageId = (body as any).imageId;

        let image: HTMLImageElement | null = null;

        // 画像ID -1の場合はレンダリングしない（デフォルト画像なし）
        if (bodyImageId === -1) {
          continue; // 描画をスキップ
        }

        if (typeof bodyImageId === "number" && bodyImageId > 0) {
          // IndexedDBの画像の場合（プリロード済みから取得）
          image = imageMap.get(bodyImageId) || null;
        }

        if (!image) continue;

        // 親Bodyの位置と角度に合わせて描画
        ctx.save();
        ctx.translate(body.position.x, body.position.y);
        ctx.rotate(body.angle);

        // Body全体の中心に画像を合わせる
        const centroid = getAveragePoint(edgePoints);

        ctx.drawImage(
          image,
          -centroid.x * scale,
          -centroid.y * scale,
          image.width * scale,
          image.height * scale
        );

        ctx.restore();

        // 当たり判定（子パーツ）はそのまま描画
        body.parts.forEach((part) => {
          if (part.id === body.id) return;

          ctx.strokeStyle = "rgba(0,0,255,0.5)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          part.vertices.forEach((v, i) => {
            if (i === 0) ctx.moveTo(v.x, v.y);
            else ctx.lineTo(v.x, v.y);
          });
          ctx.closePath();
          ctx.stroke();
        });
      } // ← for...ofループを閉じる

      // 画面外ブロック削除 & GAME OVER判定（毎フレーム最新の world を参照）
      if (!isGameOverRef.current) {
        const bodiesToCheck = [
          ...blockManagerRef.current.blocks.map((b) => b.body),
          ...engineRef.current.world.bodies.filter(
            (b) => b.label === "TargetImg" || b.label === "pointCloud"
          ),
        ];

        bodiesToCheck.forEach((body) => {
          const pos = body.position;
          if (
            pos.y > canvas.height + 30 ||
            pos.x < -10 ||
            pos.x > canvas.width + 10
          ) {
            const block = blockManagerRef.current.blocks.find(
              (b) => b.body === body
            );
            if (block) {
              blockManagerRef.current.removeBlock(
                block,
                engineRef.current.world
              );
            } else {
              Matter.World.remove(engineRef.current.world, body);
            }
            // GAME OVER
            setIsGameOver(true);
          }
        });
      }

      animationFrameId = requestAnimationFrame(update);
    };

    update();

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      cancelAnimationFrame(animationFrameId);
    };
  }, [position, edgePoints, stage, spawnTargetImg]);

  // restartGame をコンポーネント内で定義（useEffect の外側で参照可能に）
  const restartGame = () => {
    console.log("=== restartGame called ===");

    const oldEngine = engineRef.current;
    try {
      if (oldEngine) {
        Matter.World.clear(oldEngine.world, true);
        Matter.Engine.clear(oldEngine);
      }
    } catch (err) {
      console.warn("World clear warning:", err);
    }

    try {
      blockManagerRef.current.removeAll(oldEngine?.world);
    } catch (e) {
      // ignore
    }
    blockManagerRef.current.blocks = [];

    const newEngine = Matter.Engine.create();
    engineRef.current = newEngine;

    // stage を再作成
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (ctx) {
      let stageFactory: StageFactory;
      if (stage === "stage1") stageFactory = createStage1;
      else if (stage === "stage2") stageFactory = createStage2;
      else stageFactory = createStage3;

      stageObjRef.current = stageFactory(newEngine.world, ctx);
    }

    setIsGameOver(false);
    isGameOverRef.current = false;

    setCountdown(null);
    countdownRef.current = null;

    setBlockCount(0);
    blockCountRef.current = 0;

    // 新規追加: 最新IDをリセット
    setLastProcessedImageId(null);

    console.log(
      "restartGame finished; newEngine bodies:",
      engineRef.current.world.bodies.length
    );
  };

  // 自動リスタート処理
  useEffect(() => {
    if (isGameOver) {
      setCountdown(3);
      const interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev === null) return null;
          if (prev <= 1) {
            clearInterval(interval);
            restartGame();
            return null;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isGameOver]);

  return (
    <div className={styles.container}>
      <div className={styles.canvasWrapper}>
        <canvas
          ref={canvasRef}
          width={450}
          height={634}
          className={styles.canvas}
        />
        <div className={styles.bodypixWrapper}>
          <BodyPix />
        </div>
        <div className={styles.sky}>
          <div className={`${styles.cloud} ${styles.cloud1}`}></div>
          <div className={`${styles.cloud} ${styles.cloud2}`}></div>
          <div className={`${styles.cloud} ${styles.cloud3}`}></div>
        </div>
      </div>

      {isGameOver && (
        <div className={styles.gameOverOverlay}>
          <p className={styles.gameOverText}>GAME OVER</p>
          {countdown !== null && (
            <p className={styles.countdownText}>{countdown}</p>
          )}
        </div>
      )}

      {/* 新規追加: 自動ブロック生成制御UI */}
      <div
        style={{
          position: "absolute",
          top: "10px",
          right: "10px",
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          backgroundColor: "rgba(255,255,255,0.9)",
          padding: "8px",
          borderRadius: "4px",
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
        }}
      >
        <button
          onClick={() => setAutoBlockGeneration(!autoBlockGeneration)}
          style={{
            fontSize: "14px",
            padding: "6px 12px",
            backgroundColor: autoBlockGeneration ? "#4CAF50" : "#f44336",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          自動ブロック生成: {autoBlockGeneration ? "ON" : "OFF"}
        </button>

        <div
          style={{
            fontSize: "12px",
            color: "#666",
            textAlign: "center",
            lineHeight: "1.2",
          }}
        >
          {autoBlockGeneration ? (
            <>
              <div>6秒間隔でチェック中</div>
              <div style={{ fontSize: "10px", color: "#999" }}>
                最新ID: {lastProcessedImageId ?? "未取得"}
              </div>
            </>
          ) : (
            "スペースキーで手動実行"
          )}
        </div>
      </div>

      {/* ホーム画面に戻るボタン */}
      <button
        onClick={() => navigate("/")}
        style={{
          position: "absolute",
          top: "88%",
          left: "80%",
          transform: "translateX(-50%)",
          fontSize: "20px",
          padding: "8px 16px",
          zIndex: 10,
        }}
      >
        ホームに戻る
      </button>
    </div>
  );
};

export default GameCanvas;

export const getVerticesFromSvg = async (path: string) => {
  const svgDoc = await fetch(path)
    .then((response) => response.text())
    .then((svgString) => {
      // SVG文字列からpathデータを抽出
      const parser = new DOMParser();
      return parser.parseFromString(svgString, "image/svg+xml");
    });
  const pathDatas = svgDoc.querySelectorAll("path");
  if (!pathDatas) return;
  // pathデータをverticesに変換
  const vertices = Array.from(pathDatas).map((pathData) => {
    return Matter.Svg.pathToVertices(pathData, 10);
  });
  return vertices;
};

const getAveragePoint = (points: { x: number; y: number }[]) => {
  if (points.length === 0) return { x: 0, y: 0 };

  const sum = points.reduce(
    (acc, p) => {
      acc.x += p.x;
      acc.y += p.y;
      return acc;
    },
    { x: 0, y: 0 }
  );

  return {
    x: sum.x / points.length,
    y: sum.y / points.length,
  };
};

function ensureCCW(vertices: [number, number][]): [number, number][] {
  let sum = 0;
  for (let i = 0; i < vertices.length; i++) {
    const [x1, y1] = vertices[i];
    const [x2, y2] = vertices[(i + 1) % vertices.length];
    sum += (x2 - x1) * (y2 + y1);
  }
  return sum > 0 ? vertices.reverse() : vertices;
}

import { Vector } from "matter-js";

function getCentroid(polygon: Vector[]): Vector {
  let xSum = 0,
    ySum = 0;
  for (let v of polygon) {
    xSum += v.x;
    ySum += v.y;
  }
  const n = polygon.length;
  return { x: xSum / n, y: ySum / n };
}
