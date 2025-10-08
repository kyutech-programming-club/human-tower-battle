import styles from "./Home.module.css"
import { Link } from "react-router-dom";
import React from "react";


const Home = () => {
  return (
    <div className={styles.container}>
      {/* 背景 */}
      <div className={styles.background}>
        <div className={styles.sky}></div>
        <div className={`${styles.cloud} ${styles.cloud1}`}></div>
        <div className={`${styles.cloud} ${styles.cloud2}`}></div>
        <div className={`${styles.cloud} ${styles.cloud3}`}></div>
        <div className={styles.mountain}></div>
        <div className={styles.ground}></div>
      </div>

      {/* 中央コンテンツ */}
      <div className={styles.content}>
        <h1 className={styles.title}>人間タワーバトル</h1>
        <nav>
          <ul className={styles.navList}>
            <li className={styles.navItem}><Link to="/stage1">ステージ1</Link></li>
            <li className={styles.navItem}><Link to="/stage2">ステージ2</Link></li>
            <li className={styles.navItem}><Link to="/stage3">ステージ3</Link></li>
          </ul>
        </nav>
      </div>
    </div>
  );
};

export default Home;
