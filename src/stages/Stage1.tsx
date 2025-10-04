import Matter from "matter-js";

export function createStage1(
  world: Matter.World,
  ctx: CanvasRenderingContext2D
) {
  // 床の定義
  const groundWidth = 400;
  const groundHeight = 100;
  const groundX = 400;
  const groundY = 500 - groundHeight / 2;
  const ground = Matter.Bodies.rectangle(
    groundX,
    groundY,
    groundWidth,
    groundHeight,
    {
      isStatic: true,
      label: "Floor",
      collisionFilter: {
        category: 0x0001, // ← 床のカテゴリ
        mask: 0xffff, // 全てと衝突可能
      },
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
