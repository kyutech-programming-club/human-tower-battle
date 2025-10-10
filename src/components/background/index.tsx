import React from "react";
import styles from "../styles/background.module.css";

interface BackgroundProps {
  children?: React.ReactNode;
}

const Background: React.FC<BackgroundProps> = ({ children }) => {
  return (
    <div className={styles.sky}>
      <div className={styles.cloud}></div>
      <div className={styles.cloud}></div>
      <div className={styles.cloud}></div>
      <div className={styles.sun}></div>
      {children}
    </div>
  );
};

export default Background;
