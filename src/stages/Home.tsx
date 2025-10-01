import styles from "./Home.module.css";
import { Link } from "react-router-dom";

const Home = () => {
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>人間タワーバトル</h1>
      
      <div className={styles.menu}>
        <Link to="/stage1" className={styles.button}>ステージ1</Link>
        <Link to="/stage2" className={styles.button}>ステージ2</Link>
      </div>

    </div>
  );
};

export default Home;
