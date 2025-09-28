import Matter from "matter-js";

export function createStage2(world: Matter.World, ctx: CanvasRenderingContext2D) {
  // 足場1
  const ground1 = Matter.Bodies.rectangle(300, 480, 300, 20, { isStatic: true });
  // 足場2
  const ground2 = Matter.Bodies.rectangle(600, 350, 200, 20, { isStatic: true });

  Matter.World.add(world, [ground1, ground2]);

  const draw = () => {
    ctx.fillStyle = "brown";
    ctx.fillRect(ground1.position.x - 150, ground1.position.y - 10, 300, 20);
    ctx.fillRect(ground2.position.x - 100, ground2.position.y - 10, 200, 20);
  };

  return { grounds: [ground1, ground2], draw };
}
