import React, { useEffect, useRef, useState } from "react";
import Matter from "matter-js";
import { Block } from "../game/Block";
import { BlockManager } from "../game/BlockManager";

const GameCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef(Matter.Engine.create());
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

    // 床
    const groundWidth = 400;
    const groundHeight = 20;
    const groundX = 400;
    const groundY = 500 - groundHeight / 2;
    const ground = Matter.Bodies.rectangle(groundX, groundY, groundWidth, groundHeight, { isStatic: true });
    Matter.World.add(world, [ground]);

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

      // 床描画
      ctx.fillStyle = "brown";
      ctx.fillRect(ground.position.x - groundWidth / 2, ground.position.y - groundHeight / 2, groundWidth, groundHeight);

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

      // 画面外ブロック削除 & GAME OVER判定
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
  }, [isGameOver]);

  // リスタート
  const restartGame = () => {
    const newEngine = Matter.Engine.create();
    blockManagerRef.current.removeAll(engineRef.current.world);
    engineRef.current = newEngine;
    setIsGameOver(false);
  };

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        position: "relative",
        backgroundColor: "#f0f0f0",
      }}
    >
      <canvas ref={canvasRef} width={800} height={500} style={{ border: "2px solid black" }} />
      {isGameOver && (
        <button
          onClick={restartGame}
          style={{
            position: "absolute",
            top: "60%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            fontSize: "24px",
            padding: "10px 20px",
            zIndex: 10,
          }}
        >
          RESTART
        </button>
      )}
    </div>
  );
};

export default GameCanvas;
