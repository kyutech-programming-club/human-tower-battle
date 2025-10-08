import Matter from "matter-js";

export const createCustomEngine = () => {
  const engine = Matter.Engine.create();
  engine.world.gravity.y = 1; // 重力
  return engine;
};

// 共通の物理特性（摩擦・反発など）
export const defaultBodyOptions: Matter.IChamferableBodyDefinition = {
  friction: 0.8,       // 摩擦（滑り防止）
  frictionStatic: 1.0, // 静止摩擦（積み上がり防止に重要）
  frictionAir: 0.01,   // 空気抵抗
  restitution: 0.0,    // 反発係数（跳ね返り）
  density: 0.001,      // 密度
};
