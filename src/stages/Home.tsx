import styles from "./Home.module.css";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import Background from "../components/background";

const Home = () => {
  // スコア一覧を入れる state を追加
  const [scores, setScores] = useState<number[]>([]);

  // ページが開かれたときに localStorage からスコアを読み取る
  useEffect(() => {
    const stored = localStorage.getItem("scoreHistory");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) setScores(parsed);
      } catch (e) {
        console.error("スコア読み込みエラー:", e);
      }
    }
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.row}>
        {/* スコア表示部分 */}
        <div className={styles.scoreSection}>
          <h2>過去のスコア（上位5件）</h2>
          <ul>
            {scores.length > 0 ? (
              scores.map((s, i) => (
                <li key={i}>
                  第{i + 1}位：{s}人
                </li>
              ))
            ) : (
              <li>まだスコアがありません</li>
            )}
          </ul>
        </div>

        {/* 中央コンテンツ */}
        <div className={styles.content}>
          <h1 className={styles.title}>人間タワーバトル</h1>
          <nav>
            <ul className={styles.navList}>
              <li className={styles.navItem}>
                <Link to="/stage1">ステージ1</Link>
              </li>
              <li className={styles.navItem}>
                <Link to="/stage2">ステージ2</Link>
              </li>
              <li className={styles.navItem}>
                <Link to="/stage3">ステージ3</Link>
              </li>
            </ul>
          </nav>
        </div>

        {/* 🔹 操作説明 */}
        <div className={styles.howToPlay}>
          <h2>🎮 概要・注意 </h2>
          <ul>
            <li>ブロックが落ちた人数を競います！</li>
            <li>ブロックが画面外に出るとゲームオーバー！</li>
            <li>撮影中はしっかり止まってね。</li>
            <li></li>
          </ul>
        </div>
      </div>
      {/* 背景 */}
      <Background
        children={
          <>
            <div className={styles.mountain}></div>
            <div className={styles.ground}></div>
          </>
        }
      />
    </div>
  );
};

export default Home;
