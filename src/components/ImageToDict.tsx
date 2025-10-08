export function ImageToDict(imagePath: string): Promise<{x:number,y:number}[]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = imagePath;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject("Canvas not supported");

      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, img.width, img.height).data;

      const points: {x:number, y:number}[] = [];
      const width = img.width;
      const height = img.height;

      for (let y = 0; y < height; y += 2) {
        for (let x = 0; x < width; x += 2) {
          const i = (y * width + x) * 4;
          if (data[i + 3] <= 10) continue;

          const neighbors = [
            ((y - 1) * width + x) * 4,
            ((y + 1) * width + x) * 4,
            (y * width + (x - 1)) * 4,
            (y * width + (x + 1)) * 4,
          ];

          const isEdge = neighbors.some(
            n => n < 0 || n >= data.length || data[n + 3] <= 10
          );

          if (isEdge) points.push({x, y});
        }
      }

      resolve(points);
    };
    img.onerror = (e) => reject(e);
  });
}

