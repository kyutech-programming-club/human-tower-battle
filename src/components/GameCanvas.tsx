import styles from "./GameCanvas.module.css";
import React, { useEffect, useRef, useState } from "react";
import Matter from "matter-js";
import Png from "../img/IMG_2955.png";
import concaveman from "concaveman";
import { ImageToDict } from "./ImageToDict";
import BodyPix from "./BodyPix.tsx";
import { useNavigate } from "react-router-dom";
import { BlockManager } from "./BlockManager.tsx";
import { createStage1 } from "../stages/Stage1.tsx";
import { createStage2 } from "../stages/Stage2.tsx";
import { recognizeBorder } from "./RecognizeBorder.tsx";
import decomp from "poly-decomp";
import { createStage3 } from "../stages/Stage3.tsx";

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
  const scale = 0.05;
  const [edgePoints, setEdgePoints] = useState<{ x: number; y: number }[]>([]);

  // keep refs in sync with state
  useEffect(() => {
    isGameOverRef.current = isGameOver;
  }, [isGameOver]);
  useEffect(() => {
    countdownRef.current = countdown;
  }, [countdown]);
  useEffect(() => {
    blockCountRef.current = blockCount;
  }, [blockCount]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let animationFrameId: number;
    const engine = engineRef.current;
    const world = engine.world;

    // const spawnTargetImg = async () => {
    //   const points = await ImageToDict(Png); // points に確実に取得
    //   const test = await recognizeBorder(Png);
    //   // const vertices: [number, number][] = test.map((p) => [p.x, p.y]);
    //   const vertices: [number, number][] = ensureCCW(
    //     test.map((p) => [p.x, p.y] as [number, number])
    //   );
    //   console.log(vertices);
    //   const convexPolygons:= decomp.quickDecomp(vertices);
    //   console.log(convexPolygons);
    //   const parts = convexPolygons.map(
    //     (polygon) =>
    //       Matter.Bodies.fromVertices(
    //         400,
    //         0,
    //         polygon,
    //         {
    //           isStatic: false,
    //           friction: 0.1,
    //           restitution: 0.1,
    //         },
    //         true
    //       ) // ここを true にすると自動修正でBody作成
    //   );

    //   const body = Matter.Body.create({
    //     parts,
    //     position: { x:400, y:0 },
    //   });

    //   // console.log(test)
    //   // setEdgePoints(points);
    //   // const scaledPoints = scalePoints(points, scale, scale);

    //   // const polygon = concaveman(scaledPoints.map((p) => [p.x, p.y]));

    //   // // polygon は [[x1,y1],[x2,y2],...] の形式で返るので
    //   // const vertices = polygon.map(([x, y]) => ({ x, y }));
    //   // const avg = getAveragePoint(points);
    //   // const TargetImg = Matter.Bodies.fromVertices(
    //   //   canvas.width / 2 - avg.x * scale,
    //   //   -avg.x * scale,
    //   //   [vertices],
    //   //   {
    //   //     label: "TargetImg",
    //   //     render: {
    //   //       sprite: {
    //   //         texture: Png,
    //   //         xScale: 1,
    //   //         yScale: 1,
    //   //       },
    //   //     },
    //   //   },
    //   //   false
    //   // );
    //   // Matter.World.add(engineRef.current.world, [TargetImg]);
    // };

    // stageFactory を決める
    let stageFactory: StageFactory;
    if (stage === "stage1") stageFactory = createStage1;
    else if (stage === "stage2") stageFactory = createStage2;
    else stageFactory = createStage3;

    // 最初に stageObj を作成して ref に保持
    stageObjRef.current = stageFactory(engineRef.current.world, ctx);        
        
    const spawnTargetImg = async () => {
      const test = await recognizeBorder(Png);
      setEdgePoints(test);
      // CCW補正して [number, number][] に
      const vertices: [number, number][] = ensureCCW(
        test.map((p) => [p.x * scale, p.y * scale] as [number, number])
      );
      // 凸分割
      const convexPolygons: [number, number][][] = decomp.quickDecomp(vertices);

      // Matter.js の Vector[][] に変換
      const matterPolygons: Matter.Vector[][] = convexPolygons.map((polygon) =>
        polygon.map(([x, y]) => ({ x, y }))
      );

      // 各凸ポリゴンから Body を作成

      // Body を生成
      const parts = matterPolygons.map((polygon) => {
      const centroid = getCentroid(polygon);
      const shiftedPolygon = polygon.map((v) => ({
        x: v.x - centroid.x,
        y: v.y - centroid.y,
      }));

      return Matter.Bodies.fromVertices(
        200 + centroid.x,
        centroid.y,
        [shiftedPolygon],
        {
          label: "TargetImg",
          isStatic: false,
          friction: 1.0,         // 最大動摩擦
          frictionStatic: 1.0,   // 最大静止摩擦
          restitution: 0,        // 反発なし
          density: 0.01,
        },
        false
      );
    });

    // 複数パーツをまとめて1つの Body に
    const body = Matter.Body.create({
      parts,
      label: "TargetImg",
    });

    // スリープしないように設定（止まったままにしたいなら有効）
    Matter.Body.set(body, { sleepThreshold: Infinity });

    // ワールドに追加（parts[0]やTargetImgではなく body）
    Matter.World.add(engineRef.current.world, body);

    setBlockCount((prev) => prev + 1);

    // 精度調整
    engineRef.current.positionIterations = 10;
    engineRef.current.velocityIterations = 10;
    };

      // handleKeyDown: カウント中は無視、GameOver時はSpaceでrestart、それ以外はSpaceでspawn
    const handleKeyDown = async (e: KeyboardEvent) => {
      // カウント中は無視
      if (countdownRef.current !== null) return;

      if (isGameOverRef.current) {
        if (e.code === "Space") {
          restartGame();
        }
        return;
      }

      if (e.code === "Space") {
        // spawnTargetImgは内部で async 処理をするが、ここで await する必要はない
        // await spawnTargetImg(); // optional
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

      // world 内の TargetImg を描画
      world.bodies.forEach((body) => {
        const img = new Image();
        img.src = Png;

        // 親Bodyのpartsをループ
        world.bodies.forEach((body) => {
          if (body.label !== "TargetImg") return;

          const img = new Image();
          img.src = Png;

          // 親Bodyの位置と角度に合わせて描画
          ctx.save();
          ctx.translate(body.position.x, body.position.y);
          ctx.rotate(body.angle);

          // Body全体の中心に画像を合わせる
          const centroid = getAveragePoint(edgePoints);
          ctx.drawImage(
            img,
            -centroid.x * scale,
            -centroid.y * scale,
            img.width * scale,
            img.height * scale
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
        });
      });

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
            isGameOverRef.current = true;
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
  }, [position, edgePoints, stage]);

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
        <canvas ref={canvasRef} width={450} height={580} className={styles.canvas} />
        <BodyPix />
      </div>
      {isGameOver && (
        <div className={styles.gameOverOverlay}>
          <p className={styles.gameOverText}>GAME OVER</p>
          {countdown !== null && (
            <p className={styles.countdownText}>{countdown}</p>
          )}
        </div>
      )}

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

const scalePoints = (
  points: { x: number; y: number }[],
  scaleX: number,
  scaleY: number
) => points.map((p) => ({ x: p.x * scaleX, y: p.y * scaleY }));

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
