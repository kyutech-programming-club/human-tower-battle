// concaveman.d.ts
declare module "concaveman" {
  function concaveman(
    points: [number, number][],
    concavity?: number,
    lengthThreshold?: number
  ): [number, number][];

  export default concaveman;
}
