import Matter from "matter-js";

export function createStage1(world: Matter.World, ctx: CanvasRenderingContext2D) {
  // 床の定義
  const groundWidth = 400;
  const groundHeight = 20;
  const groundX = 400;
  const groundY = 500 - groundHeight / 2;
  const ground = Matter.Bodies.rectangle(groundX, groundY, groundWidth, groundHeight, { isStatic: true });

  Matter.World.add(world, [ground]);

  // 描画関数
  const draw = () => {
    const canvasWidth = ctx.canvas.width;
    const canvasHeight = ctx.canvas.height;

    // 背景
    const gradient = ctx.createLinearGradient(0, 0, 0, canvasHeight);
    gradient.addColorStop(0, "#87ceeb"); 
    gradient.addColorStop(1, "#ffffff"); 
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // 草原
    ctx.fillStyle = "#7CFC00"; 
    ctx.fillRect(0, groundY + groundHeight / 2, canvasWidth, canvasHeight - groundY);

    // 雲（簡単に円で描画）
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(150, 80, 30, 0, Math.PI * 2);
    ctx.arc(180, 80, 40, 0, Math.PI * 2);
    ctx.arc(210, 80, 30, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(300, 120, 25, 0, Math.PI * 2);
    ctx.arc(330, 120, 35, 0, Math.PI * 2);
    ctx.arc(360, 120, 25, 0, Math.PI * 2);
    ctx.fill();

    // 床
    ctx.fillStyle = "saddlebrown";
    ctx.fillRect(
      ground.position.x - groundWidth / 2,
      ground.position.y - groundHeight / 2,
      groundWidth,
      groundHeight
    );
  };

  return { ground, draw };
}

