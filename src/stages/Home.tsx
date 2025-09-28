import styles from "./Home.module.css"
import { Link } from "react-router-dom";

const Home = () => {
  return (
    <div>
      <h1>ホーム画面</h1>
      <nav>
        <ul>
          <li className={styles.scoreItem}><Link to="/stage1">ステージ1</Link></li>
          <li className={styles.scoreItem}><Link to="/stage2">ステージ2</Link></li>
        </ul>
      </nav>
    </div>
  );
};

export default Home;
