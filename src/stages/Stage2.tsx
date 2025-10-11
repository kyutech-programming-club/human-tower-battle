import Matter from "matter-js";

export function createStage2(world: Matter.World, ctx: CanvasRenderingContext2D) {
  // キャンバス幅（描画位置計算用）
  const CANVAS_WIDTH = 500;

  // 左側の足場リスト
  const leftGrounds = [
    { x: 250, y: 1000, w: 320, h: 20 },
    { x: 90, y: 980, w: 50, h: 20 },
    { x: 70, y: 960, w: 50, h: 20 },
    { x: 50, y: 940, w: 50, h: 20 },
    { x: 70, y: 980, w: 50, h: 20 },
    { x: 50, y: 960, w: 50, h: 20 },
    { x: 30, y: 940, w: 50, h: 20 },
    { x: 30, y: 920, w: 50, h: 20 },
    { x: 10, y: 920, w: 50, h: 20 },
    { x: 10, y: 900, w: 50, h: 20 },
  ];

  // 左右両方の足場をまとめる配列
  const allGrounds: { body: Matter.Body; width: number; height: number }[] = [];

  // 左側を生成
  leftGrounds.forEach((g) => {
    const body = Matter.Bodies.rectangle(g.x, g.y, g.w, g.h, {
      isStatic: true,
      friction: 1.0,
      frictionStatic: 1.0,
      restitution: 0,
      label: "floor",
    });
    allGrounds.push({ body, width: g.w, height: g.h });
  });

  // 右側を生成（x座標を左右反転）
  leftGrounds.forEach((g) => {
    const mirroredX = CANVAS_WIDTH - g.x;
    const body = Matter.Bodies.rectangle(mirroredX, g.y, g.w, g.h, {
      isStatic: true,
      friction: 1.0,
      frictionStatic: 1.0,
      restitution: 0,
      label: "floor",
    });
    allGrounds.push({ body, width: g.w, height: g.h });
  });

  // ワールドに追加
  Matter.World.add(
    world,
    allGrounds.map((g) => g.body)
  );

  // 描画関数
  const draw = () => {
    ctx.fillStyle = "green";
    allGrounds.forEach((g) => {
      const { x, y } = g.body.position;
      ctx.fillRect(x - g.width / 2, y - g.height / 2, g.width, g.height);
    });
  };

  return {
    grounds: allGrounds,
    draw,
  };
}
