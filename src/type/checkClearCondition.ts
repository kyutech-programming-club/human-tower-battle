import Matter from "matter-js";

export const checkClearCondition = (
  world: Matter.World,
  thresholdY: number
): boolean => {
  const targetBodies = world.bodies.filter(b => b.label === "TargetImg");
  if (targetBodies.length === 0) return false;

  const minY = Math.min(...targetBodies.map(b => b.bounds.min.y));
  return minY < thresholdY;
};
