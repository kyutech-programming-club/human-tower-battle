import Matter from "matter-js";

export class Block {
  body: Matter.Body;

  constructor(x: number, y: number, width: number, height: number, options?: Matter.IChamferableBodyDefinition) {
    this.body = Matter.Bodies.rectangle(x, y, width, height, options);
  }
}
