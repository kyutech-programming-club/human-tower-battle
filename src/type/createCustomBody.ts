import Matter from "matter-js";
import { defaultBodyOptions } from "./physicsConfig";

export const createBlock = (x: number, y: number, w = 60, h = 60) => {
  return Matter.Bodies.rectangle(x, y, w, h, {
    ...defaultBodyOptions,
    label: "block",
  });
};
