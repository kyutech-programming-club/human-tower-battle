import styles from "./GameCanvas.module.css"
import React, { useEffect, useRef, useState } from "react";
import Matter from "matter-js";
import Png from "../img/43sb4.png";
import concaveman from "concaveman";
import { ImageToDict } from "./ImageToDict";
import { useNavigate } from "react-router-dom";
import { Block } from "../game/Block";
import { BlockManager } from "../game/BlockManager";
import { createStage1 } from "../stages/Stage1.tsx";
import { createStage2 } from "../stages/Stage2.tsx";

type StageFactory = (world: Matter.World, ctx: CanvasRenderingContext2D) => { draw: () => void };

interface GameCanvasProps {
  stage: "stage1" | "stage2"; // ← propsでステージを選べるように
}

const GameCanvas: React.FC<GameCanvasProps> = ({ stage }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef(Matter.Engine.create());
  const navigate = useNavigate();
  const blockManagerRef = useRef(new BlockManager());
  const [isGameOver, setIsGameOver] = useState(false);
  const [position, setPosition] = useState(400);
  const scale = 1;
  const [edgePoints, setEdgePoints] = useState<{ x: number; y: number }[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let animationFrameId: number;
    const engine = engineRef.current;
    const world = engine.world;
    const spawnTargetImg = async () => {
      const points = await ImageToDict(Png); // points に確実に取得
      setEdgePoints(points);
      const scaledPoints = scalePoints(points, scale, scale);

      const polygon = concaveman(scaledPoints.map((p) => [p.x, p.y]));

      // polygon は [[x1,y1],[x2,y2],...] の形式で返るので
      const vertices = polygon.map(([x, y]) => ({ x, y }));
      const avg = getAveragePoint(points);
      const TargetImg = Matter.Bodies.fromVertices(
        canvas.width / 2 - avg.x * scale,
        -avg.x * scale,
        [vertices],
        {
          label: "TargetImg",
          render: {
            sprite: {
              texture: Png,
              xScale: 1,
              yScale: 1,
            },
          },
        },
        false
      );
      console.log(TargetImg);
      Matter.World.add(engineRef.current.world, [TargetImg]);
    };


    // ステージ選択
    let stageFactory: StageFactory;
    if (stage === "stage1") {
      stageFactory = createStage1;
    } else {
      stageFactory = createStage2;
    }
    const stageObj = stageFactory(world, ctx);

    // スペースキーでブロック生成
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isGameOver) {
        // const block = new Block(position, 0, 60, 60, { restitution: 0.2 });
        // blockManagerRef.current.addBlock(block, world);
        spawnTargetImg();
      }
      if (e.key === "ArrowLeft") {
        setPosition((prev) => {
          const newPos = prev - 10;
          console.log("new position:", newPos);
          return newPos;
        });
      }

      if (e.key === "ArrowRight") {
        setPosition((prev) => {
          const newPos = prev + 10;
          console.log("new position:", newPos);
          return newPos;
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    const update = () => {
      Matter.Engine.update(engine, 1000 / 60);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // ステージ描画
      stageObj.draw();

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

      world.bodies.forEach((body) => {
        if (body.label === "TargetImg") {
          const img = new Image();
          img.src = Png;

          ctx.save();
          ctx.translate(body.position.x, body.position.y);
          ctx.rotate(body.angle);
          const avg = getAveragePoint(edgePoints);
          const offsetX = avg.x * scale;
          const offsetY = avg.y * scale;
          // PNGの見た目を一致させる
          ctx.drawImage(
            img,
            -offsetX,
            -offsetY,
            img.width * scale,
            img.height * scale
          );
          ctx.restore();

          // 当たり判定（ポリゴン）表示
          ctx.strokeStyle = "rgba(0,0,255,0.5)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          body.vertices.forEach((v, i) => {
            if (i === 0) ctx.moveTo(v.x, v.y);
            else ctx.lineTo(v.x, v.y);
          });
          ctx.closePath();
          ctx.stroke();
        }
      });

      // 画面外ブロック削除 & GAME OVER判定
      if (!isGameOver) {
        // ブロックと world.bodies を一括で画面外判定
        const bodiesToCheck = [
          ...blockManagerRef.current.blocks.map((b) => b.body),
          ...world.bodies.filter(
            (b) => b.label === "TargetImg" || b.label === "pointCloud"
          ),
        ];

        bodiesToCheck.forEach((body) => {
          const pos = body.position;
          if (
            pos.y > canvas.height + 50 ||
            pos.x < -50 ||
            pos.x > canvas.width + 50
          ) {
            // ブロックなら manager からも削除
            const block = blockManagerRef.current.blocks.find(
              (b) => b.body === body
            );
            if (block) {
              blockManagerRef.current.removeBlock(block, world);
            } else {
              // TargetImg や pointCloud は world から直接削除
              Matter.World.remove(world, body);
            }
            setIsGameOver(true);
          }
        });

        // blockManagerRef.current.blocks = blockManagerRef.current.blocks.filter(
        //   (b) => {
        //     const pos = b.body.position;
        //     if (
        //       pos.y > canvas.height + 50 ||
        //       pos.x < -50 ||
        //       pos.x > canvas.width + 50
        //     ) {
        //       blockManagerRef.current.removeBlock(b, world);
        //       setIsGameOver(true);
        //       return false;
        //     }
        //     return true;
        //   }
        // );
      }

      if (isGameOver) {
        ctx.fillStyle = "red";
        ctx.font = "40px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("GAME OVER", canvas.width / 2, canvas.height / 2);
      } else {
        animationFrameId = requestAnimationFrame(update);
      }
    };

    update();

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      cancelAnimationFrame(animationFrameId);
    };
  }, [isGameOver, position, edgePoints]);

  const restartGame = () => {
    const newEngine = Matter.Engine.create();
    blockManagerRef.current.removeAll(engineRef.current.world);
    engineRef.current = newEngine;
    setIsGameOver(false);
  };

  return (
    <div style={{ width: "100vw", height: "100vh", display: "flex", justifyContent: "center", alignItems: "center", position: "relative", backgroundColor: "#f0f0f0" }}>
      <canvas ref={canvasRef} width={800} height={500} style={{ border: "2px solid black" }} />
      
      {/* RESTARTダイアログ */}
      {isGameOver && (
        <button
          onClick={restartGame}
          className={styles.restartButton}
        >
          RESTART
        </button>
      )}

      {/* ホーム画面に戻るボタン */}
      <button
        onClick={() => navigate("/")}
        style={{
          position: "absolute",
          top: "90%",
          left: "50%",
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

// GameCanvas.tsx

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
