import Matter from "matter-js";

export function createStage1(world: Matter.World, ctx: CanvasRenderingContext2D) {
  const groundWidth = 350;
  const groundHeight = 20;
  const groundX = 225; // canvas中央 (450 / 2)
  const groundY = 580 - groundHeight / 2; // canvasの下にぴったり

  const ground = Matter.Bodies.rectangle(groundX, groundY, groundWidth, groundHeight, {
    isStatic: true,
    friction: 1.0,
    frictionStatic: 1.0,
    restitution: 0,
    label: "floor",
  });

  Matter.World.add(world, [ground]);

  const draw = () => {
    ctx.fillStyle = "brown";
    ctx.fillRect(
      ground.position.x - groundWidth / 2,
      ground.position.y + groundHeight / 2 - 3,
      groundWidth,
      groundHeight
    );
  };

  return { ground, draw };
}
