import React from "react";
import styles from "./BlockSizeController.module.css";

interface BlockSizeControllerProps {
  currentSize: number;
  onSizeChange: (newSize: number) => void;
  disabled?: boolean; // ブロックが存在する場合は無効化
}

const BlockSizeController: React.FC<BlockSizeControllerProps> = ({
  currentSize,
  onSizeChange,
  disabled = false,
}) => {
  const minSize = 80;
  const maxSize = 400;
  const step = 20;

  const handleDecrease = () => {
    const newSize = Math.max(minSize, currentSize - step);
    onSizeChange(newSize);
  };

  const handleIncrease = () => {
    const newSize = Math.min(maxSize, currentSize + step);
    onSizeChange(newSize);
  };

  return (
    <div className={styles.container}>
      <div className={styles.title}>ブロックサイズ</div>

      <div className={styles.controls}>
        <button
          onClick={handleDecrease}
          disabled={disabled || currentSize <= minSize}
          className={`${styles.button} ${styles.decreaseButton}`}
        >
          -
        </button>

        <div
          className={`${styles.sizeDisplay} ${disabled ? styles.disabled : ""}`}
        >
          {currentSize}px
        </div>

        <button
          onClick={handleIncrease}
          disabled={disabled || currentSize >= maxSize}
          className={`${styles.button} ${styles.increaseButton}`}
        >
          +
        </button>
      </div>

      <div
        className={`${styles.description} ${disabled ? styles.disabled : ""}`}
      >
        {disabled
          ? "自動ブロック生成ON時は変更不可"
          : `${minSize}〜${maxSize}px (${step}刻み)`}
      </div>
    </div>
  );
};

export default BlockSizeController;
