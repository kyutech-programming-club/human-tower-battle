import Matter from "matter-js";
import { Block } from "./Block";

export class BlockManager {
  blocks: Block[] = [];

  addBlock(block: Block, world: Matter.World) {
    this.blocks.push(block);
    Matter.World.add(world, block.body);
  }

  removeBlock(block: Block, world: Matter.World) {
    Matter.World.remove(world, block.body);
    this.blocks = this.blocks.filter((b) => b !== block);
  }

  removeAll(world: Matter.World) {
    this.blocks.forEach((b) => Matter.World.remove(world, b.body));
    this.blocks = [];
  }
}
