import Matter from "matter-js";

export function createStage2(
  world: Matter.World,
  ctx: CanvasRenderingContext2D
) {
  // 足場の設定
  const ground1 = {
    body: Matter.Bodies.rectangle(250, 740, 100, 20, {
      isStatic: true,
      friction: 1.0, // 最大摩擦
      frictionStatic: 1.0, // 静止摩擦
      restitution: 0, // 反発なし
      label: "floor",
    }),
    width: 100,
    height: 20,
  };
  const ground2 = {
    body: Matter.Bodies.rectangle(370, 670, 50, 20, {
      isStatic: true,
      friction: 1.0, // 最大摩擦
      frictionStatic: 1.0, // 静止摩擦
      restitution: 0, // 反発なし
      label: "floor",
    }),
    width: 50,
    height: 20,
  };
  const ground3 = {
    body: Matter.Bodies.rectangle(370, 470, 50, 20, {
      isStatic: true,
      friction: 1.0, // 最大摩擦
      frictionStatic: 1.0, // 静止摩擦
      restitution: 0, // 反発なし
      label: "floor",
    }),
    width: 50,
    height: 20,
  };

  // ワールドに追加
  Matter.World.add(world, [ground1.body, ground2.body, ground3.body]);

  // 描画関数
  const draw = () => {
    ctx.fillStyle = "green";

    const grounds = [ground1, ground2, ground3];

    grounds.forEach((g) => {
      const { x, y } = g.body.position;
      ctx.fillRect(x - g.width / 2, y - g.height / 2, g.width, g.height);
    });
  };

  return { grounds: [ground1, ground2, ground3], draw };
}
