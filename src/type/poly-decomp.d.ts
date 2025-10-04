declare module "poly-decomp" {
  type Point = [number, number];

  interface Decomp {
    quickDecomp(vertices: Point[]): Point[][];
    // 必要に応じて他の関数も追加可能
    isSimple(vertices: Point[]): boolean;
    removeCollinear(vertices: Point[], tolerance?: number): Point[];
  }

  const decomp: Decomp;
  export default decomp;
}
