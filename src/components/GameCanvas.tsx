import styles from "./GameCanvas.module.css";
import React, { useEffect, useRef, useState, useCallback } from "react";
import Matter from "matter-js";
import BodyPix, { type BodyPixRef } from "./BodyPix.tsx";
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

  // BodyPixの参照
  const bodyPixRef = useRef<BodyPixRef>(null);

  // refs to avoid stale-closure issues
  const stageObjRef = useRef<{ draw: () => void } | null>(null);
  const isGameOverRef = useRef<boolean>(false);
  const countdownRef = useRef<number | null>(null);

  const [isGameOver, setIsGameOver] = useState(false);
  const [blockCount, setBlockCount] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [position, setPosition] = useState(400);

  const [isSpawning, setIsSpawning] = useState(false); // スペースキー処理中フラグ
  // IDベースの画像管理
  const [imageMap, setImageMap] = useState<Map<number, HTMLImageElement>>(
    new Map()
  );
  const [currentImageId, setCurrentImageId] = useState<number | null>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null); // Object URLを保存

  // 自動ブロック生成制御
  const [autoBlockGeneration, setAutoBlockGeneration] = useState(false);
  const [lastProcessedImageId, setLastProcessedImageId] = useState<
    number | null
  >(null);

  // 統一制御用のstate
  type AutoModeState = "idle" | "capturing" | "saving" | "generating" | "error";
  const [autoModeState, setAutoModeState] = useState<AutoModeState>("idle");
  const [nextBlockCountdown, setNextBlockCountdown] = useState<number>(0);

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

  // 統一自動制御機能
  useEffect(() => {
    if (!autoBlockGeneration || isGameOver) return;

    console.log("統一自動制御モード開始");

    const executeAutoSequence = async () => {
      // ゲームオーバーチェック（実行前）
      if (isGameOver) {
        console.log("ゲームオーバーのため自動制御を停止");
        return;
      }

      try {
        // 1. 撮影開始
        setAutoModeState("capturing");
        console.log("1. 撮影開始");

        // 2. BodyPixで保存実行
        setAutoModeState("saving");
        console.log("2. 保存開始");
        const imageId = await bodyPixRef.current?.saveToIndexedDB();

        if (!imageId) {
          throw new Error("画像保存に失敗しました");
        }

        console.log("3. 保存完了", imageId);

        // 少し待機（IndexedDB書き込み完了を確実にする）
        await new Promise((resolve) => setTimeout(resolve, 200));

        // ゲームオーバーチェック（ブロック生成前）
        if (isGameOver) {
          console.log("ゲームオーバーのためブロック生成をスキップ");
          setAutoModeState("idle");
          return;
        }

        // 4. ブロック生成開始
        setAutoModeState("generating");
        console.log("4. ブロック生成開始");
        await spawnTargetImg();
        setBlockCount((prev) => prev + 1);

        setLastProcessedImageId(imageId);
        console.log("5. 完了");
        setAutoModeState("idle");
      } catch (error) {
        console.error("統一自動制御エラー:", error);
        setAutoModeState("error");
        // エラーが発生してもモードはリセット
        setTimeout(() => setAutoModeState("idle"), 1000);
      }
    };

    // 改良版: 処理完了を待ってから次のカウントダウンを開始
    let countdownValue = 5;
    let isExecuting = false; // 処理中フラグ
    setNextBlockCountdown(countdownValue);

    const countdownInterval = setInterval(async () => {
      // ゲームオーバーチェック（カウントダウン中）
      if (isGameOver) {
        console.log("ゲームオーバーのためカウントダウンを停止");
        clearInterval(countdownInterval);
        setAutoModeState("idle");
        setNextBlockCountdown(0);
        return;
      }

      // 処理中の場合は待機
      if (isExecuting) {
        console.log("前回の処理が実行中のため、カウントダウンを一時停止");
        return;
      }

      countdownValue--;
      setNextBlockCountdown(countdownValue);

      if (countdownValue === 0) {
        // BodyPixが準備できているかチェック
        if (bodyPixRef.current?.isReady()) {
          isExecuting = true; // 処理開始フラグ
          console.log("カウントダウン完了 - 処理開始");

          try {
            await executeAutoSequence();
          } catch (error) {
            console.error("自動制御実行エラー:", error);
          } finally {
            isExecuting = false; // 処理完了フラグ
            countdownValue = 5; // 処理完了後にリセット
            setNextBlockCountdown(countdownValue);
            console.log("処理完了 - 次のカウントダウン開始");
          }
        } else {
          console.log("BodyPix未準備のためスキップ");
          setAutoModeState("error");
          setTimeout(() => setAutoModeState("idle"), 1000);
          countdownValue = 5; // リセット
          setNextBlockCountdown(countdownValue);
        }
      }
    }, 1000);

    return () => {
      console.log("統一自動制御モード停止");
      clearInterval(countdownInterval);
      setAutoModeState("idle");
      setNextBlockCountdown(0);
    };
  }, [autoBlockGeneration, isGameOver]); // isGameOverを依存配列に追加

  // 初期化時に現在の最新IDを設定
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

      const { points, size, centroid } = await recognizeBorder(imageToUse);
      // setEdgePoints(points);
      console.log("recognizeBorder完了:", points.length, "points");

      // 表示倍率（画面でどのサイズで見せるか）
      const desiredDisplayedWidth = 150; // ←お好みで
      const desiredDisplayedHeight = (desiredDisplayedWidth * size.h) / size.w; // アスペクト維持
      const sx = desiredDisplayedWidth / size.w; // 画像px → 画面px の倍率
      const sy = desiredDisplayedHeight / size.h;

      // CCW補正 → ワールド座標へ（= 表示倍率でスケール）
      const vertices: [number, number][] = ensureCCW(
        points.map((p) => [p.x * sx, p.y * sy] as [number, number])
      );
      console.log("vertices生成完了:", vertices.length, "vertices");

      // 凸分割
      const convexPolygons: [number, number][][] = decomp.quickDecomp(vertices);
      console.log("凸分割完了:", convexPolygons.length, "polygons");

      // Matter.Vector[][] に変換
      const matterPolygons: Matter.Vector[][] = convexPolygons.map((polygon) =>
        polygon.map(([x, y]) => ({ x, y }))
      );

      // 各パートを重心原点にシフトして作成
      const parts = matterPolygons.map((polygon, index) => {
        const centroid = getCentroid(polygon);
        const shifted = polygon.map((v) => ({
          x: v.x - centroid.x,
          y: v.y - centroid.y,
        }));
        const body = Matter.Bodies.fromVertices(
          centroid.x,
          centroid.y,
          [shifted],
          {
            label: "TargetImg",
            isStatic: false, // ← 落ちてくるので動的
            friction: 0.6,
            frictionStatic: 0.9,
            restitution: 0.02,
            density: 0.02,
          }
        );
        console.log(`Part ${index} 生成完了:`, centroid);
        return body;
      });

      // compound body
      const compoundBody = Matter.Body.create({ parts, label: "TargetImg" });
      (compoundBody as any).imageId = imageId;
      // スプライト基準（0〜1）: 輪郭重心を基準点にする
      const xOffset = centroid.x / size.w;
      const yOffset = centroid.y / size.h;

      (compoundBody as any).render = (compoundBody as any).render || {};
      (compoundBody as any).render.sprite = {
        texture: imageToUse,
        xScale: sx,
        yScale: sy,
        xOffset,
        yOffset,
      };

      // 生成（スポーン）位置を“中心”で決める（AABB左上合わせは不要）
      const spawnX = 200;
      const spawnY = 80; // 画面上部から落とす
      Matter.Body.setPosition(compoundBody, { x: spawnX, y: spawnY });

      // ちょっと回転させて落としたい場合
      // Matter.Body.setAngle(compoundBody, 0.1);

      // 物理世界へ追加（現在のエンジンのworldを使用）
      Matter.World.add(engineRef.current.world, compoundBody);
      console.log("sprite方式でWorldに追加 / オブジェクト生成完了！");
    } catch (error) {
      console.error("オブジェクト生成に失敗しました:", error);
    } finally {
      setIsSpawning(false); // 処理完了フラグをリセット
    }
  }, [isSpawning, currentImageUrl, currentImageId]);

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
        setBlockCount((prev) => prev + 1);
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

        // 親Bodyの位置と角度に合わせて描画（ボディごとのスプライト情報を使用）
        const sprite = (body as any).render?.sprite;
        if (!sprite) {
          // スプライト情報が無ければスキップ
          continue;
        }

        ctx.save();
        ctx.translate(body.position.x, body.position.y);
        ctx.rotate(body.angle);

        const imgW = image.width;
        const imgH = image.height;
        // スプライトのオフセットは画像サイズに対する割合なので、ピクセルに変換
        const dx = imgW * sprite.xOffset * sprite.xScale;
        const dy = imgH * sprite.yOffset * sprite.yScale;

        ctx.drawImage(
          image,
          -dx,
          -dy,
          imgW * sprite.xScale,
          imgH * sprite.yScale
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
  }, [position, stage, spawnTargetImg]);

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

    // 新規追加: 最新IDをリセット
    setLastProcessedImageId(null);

    // 新規追加: 自動制御状態をリセット
    setAutoModeState("idle");
    setNextBlockCountdown(0);
    console.log("自動制御状態をリセットしました");

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
          width={500}
          height={780}
          className={styles.canvas}
        />
        <div className={styles.bodypixWrapper}>
          <BodyPix ref={bodyPixRef} />
        </div>
        <div className={styles.sky}>
          <div className={`${styles.cloud} ${styles.cloud1}`}></div>
          <div className={`${styles.cloud} ${styles.cloud2}`}></div>
          <div className={`${styles.cloud} ${styles.cloud3}`}></div>
        </div>
      </div>

       <div className={styles.sun}>
          <div className={styles.sunCore}></div>
        </div>

      {isGameOver && (
        <div className={styles.gameOverOverlay}>
          <p className={styles.gameOverText}>GAME OVER</p>
          {countdown !== null && (
            <p className={styles.countdownText}>{countdown}</p>
          )}
        </div>
      )}

      {/* ブロック人数表示 */}
      <div
        style={{
          position: "absolute",
          top: "20px",
          left: "230px",
          zIndex: 10,
          padding: "4px 8px",
          backgroundColor: "rgba(255,255,255,0.7)",
          borderRadius: "4px",
          fontSize: "32px",
          fontWeight: "bold",
        }}
      >
        人数: {blockCount}人
      </div>

      {/* 新規追加: 自動ブロック生成制御UI */}
      <div className={styles.autoBlockGeneration}>
        <button
          onClick={() => setAutoBlockGeneration(!autoBlockGeneration)}
          className={`${styles.autoBlockGenerationButton} ${
            autoBlockGeneration
              ? styles.autoBlockGenerationButtonOn
              : styles.autoBlockGenerationButtonOff
          }`}
        >
          自動ブロック生成: {autoBlockGeneration ? "ON" : "OFF"}
        </button>

        <button
          onClick={() => bodyPixRef.current?.saveToIndexedDB()}
          disabled={!bodyPixRef.current?.isReady()}
          className={styles.manualSaveButton}
          style={{
            opacity: !bodyPixRef.current?.isReady() ? 0.5 : 1, // ←動的部分だけ残す
          }}
        >
          手動保存
        </button>

        <div className={styles.autoBlockInfo}>
          {autoBlockGeneration ? (
            <>
              <div>状態: {autoModeState}</div>
              <div className={styles.autoBlockInfoSmall}>
                次のブロック: {nextBlockCountdown}秒
              </div>
            </>
          ) : (
            <div>手動保存モード</div>
          )}

          <div className={styles.autoBlockInfoSmall}>
            カメラ: {bodyPixRef.current?.getStatus() || "初期化中..."}
          </div>
        </div>
      </div>

      {/* ホーム画面に戻るボタン */}
      <button onClick={() => navigate("/")} className={styles.homeButton}>
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

// getAveragePoint removed: no longer used

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
