import Matter from "matter-js";

export class Block {
  body: Matter.Body;

  constructor(
    x: number,
    y: number,
    width: number,
    height: number,
    options?: Matter.IChamferableBodyDefinition
  ) {
    // デフォルトの物理特性を設定
    const defaultOptions: Matter.IChamferableBodyDefinition = {
      friction: 10, // 動摩擦係数
      frictionStatic: 20, // 静止摩擦係数
      restitution: 0, // 反発
      density: 0.01, // 質量
      ...options, // 上書き可能
    };

    this.body = Matter.Bodies.rectangle(x, y, width, height, defaultOptions);
  }
}
