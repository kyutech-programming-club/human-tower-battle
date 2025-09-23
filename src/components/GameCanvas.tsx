import styles from "./GameCanvas.module.css"
import React, { useEffect, useRef, useState } from "react";
import Matter from "matter-js";
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
    } else {
      stageFactory = createStage2;
    }

    const stageObj = stageFactory(world, ctx);

    // スペースキーでブロック生成
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isGameOver) {
        const x = 400 + (Math.random() - 0.5) * 400;
        const block = new Block(x, 0, 60, 60, { restitution: 0.2 });
        blockManagerRef.current.addBlock(block, world);
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

      if (!isGameOver) {
        blockManagerRef.current.blocks = blockManagerRef.current.blocks.filter((b) => {
          const pos = b.body.position;
          if (pos.y > canvas.height + 50 || pos.x < -50 || pos.x > canvas.width + 50) {
            blockManagerRef.current.removeBlock(b, world);
            setIsGameOver(true);
            return false;
          }
          return true;
        });
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
  }, [isGameOver, stage]);

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
