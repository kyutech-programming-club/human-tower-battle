import { Dexie, type Table } from "dexie";

// image
export interface ImageRecord {
  id?: number; // 主キー (auto-increment)
  blob: Blob; // 実データ
  createdAt: number; // ソート用タイムスタンプ
}

class ImageDB extends Dexie {
  images!: Table<ImageRecord, number>;

  constructor() {
    super("imageDB"); // DB名（同一オリジン内で固有に）
    this.version(1).stores({
      // ++id: オートインクリメント主キー、createdAtにインデックス
      images: "++id, createdAt",
    });
  }
}

const db = new ImageDB();

// Canvas要素から透過PNG形式のBlobを生成する関数
export async function canvasToPngBlob(
  canvas: HTMLCanvasElement
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Canvas to Blob conversion failed"));
      }
    }, "image/png"); // 透過PNG形式で出力
  });
}

// 画像をIndexedDBに保存する関数
export async function saveImageToIndexedDB(blob: Blob): Promise<number> {
  try {
    const id = await db.images.add({
      blob: blob,
      createdAt: Date.now(),
    });
    console.log("画像が保存されました。ID:", id);
    return id;
  } catch (error) {
    console.error("画像の保存に失敗しました:", error);
    throw error;
  }
}

// Canvas要素から直接IndexedDBに保存する便利関数
export async function saveCanvasToIndexedDB(
  canvas: HTMLCanvasElement
): Promise<number> {
  try {
    const blob = await canvasToPngBlob(canvas);
    const id = await saveImageToIndexedDB(blob);
    return id;
  } catch (error) {
    console.error("Canvas画像の保存に失敗しました:", error);
    throw error;
  }
}

// 最新の保存画像のIDを取得する関数
export async function getLatestImageIdFromIndexedDB(): Promise<number | null> {
  try {
    // createdAt でソートして最新の1件を取得
    const latestImageRecord = await db.images
      .orderBy("createdAt")
      .reverse()
      .first();
    if (latestImageRecord && latestImageRecord.id) {
      return latestImageRecord.id;
    }
    return null;
  } catch (error) {
    console.error("最新画像IDの取得に失敗しました:", error);
    throw error;
  }
}

// 指定IDの保存画像をObject URLとして取得する関数
export async function getImageFromIndexedDB(
  id: number
): Promise<string | null> {
  // IDのバリデーション
  if (typeof id !== "number" || id < 1 || !Number.isInteger(id)) {
    console.error("無効なIDです:", id);
    return null;
  }

  try {
    const imageRecord = await db.images.get(id);
    if (imageRecord) {
      // BlobからObject URLを作成して返す
      return URL.createObjectURL(imageRecord.blob);
    }
    return null;
  } catch (error) {
    console.error("画像の取得に失敗しました:", error);
    throw error;
  }
}
