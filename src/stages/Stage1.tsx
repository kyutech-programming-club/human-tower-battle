import Matter from "matter-js";

export function createStage1(
  world: Matter.World,
  ctx: CanvasRenderingContext2D
) {
  // 床の定義
  const groundWidth = 350;
  const groundHeight = 20;
  const groundX = 225;
  const groundY = 590 - groundHeight / 2;
  const ground = Matter.Bodies.rectangle(
    groundX,
    groundY,
    groundWidth,
    groundHeight,
    {
      isStatic: true,
      friction: 1.0, // 最大摩擦
      frictionStatic: 1.0, // 静止摩擦
      restitution: 0, // 反発なし
      label: "floor",
    }
  );

  Matter.World.add(world, [ground]);

  // 描画関数を返す
  const draw = () => {
    ctx.fillStyle = "brown";
    ctx.fillRect(
      ground.position.x - groundWidth / 2,
      ground.position.y - groundHeight / 2,
      groundWidth,
      groundHeight
    );
  };

  return { ground, draw };
}
