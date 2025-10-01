import Matter from "matter-js";

export function createStage2(world: Matter.World, ctx: CanvasRenderingContext2D) {
  // 足場1
  const ground1 = Matter.Bodies.rectangle(300, 480, 300, 20, { isStatic: true });
  // 足場2
  const ground2 = Matter.Bodies.rectangle(600, 350, 200, 20, { isStatic: true });

  Matter.World.add(world, [ground1, ground2]);

  const draw = () => {
    const canvasWidth = ctx.canvas.width;
    const canvasHeight = ctx.canvas.height;

    // 背景
    const gradient = ctx.createLinearGradient(0, 0, 0, canvasHeight);
    gradient.addColorStop(0, "#87ceeb"); 
    gradient.addColorStop(1, "#ffffff"); 
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // 雲をいくつか描画
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(150, 80, 30, 0, Math.PI * 2);
    ctx.arc(180, 80, 40, 0, Math.PI * 2);
    ctx.arc(210, 80, 30, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(450, 130, 25, 0, Math.PI * 2);
    ctx.arc(480, 130, 35, 0, Math.PI * 2);
    ctx.arc(510, 130, 25, 0, Math.PI * 2);
    ctx.fill();

    // 足場1
    ctx.fillStyle = "saddlebrown";
    ctx.fillRect(ground1.position.x - 150, ground1.position.y - 10, 300, 20);

    // 足場2
    ctx.fillRect(ground2.position.x - 100, ground2.position.y - 10, 200, 20);
  };

  return { grounds: [ground1, ground2], draw };
}