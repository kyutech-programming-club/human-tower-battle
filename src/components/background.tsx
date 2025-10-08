import React from "react";
import "./background.css";

const Background: React.FC = () => {
  return (
  <div className="background">
  {/* 雲 */}
      <div className="cloud cloud1" />
      <div className="cloud cloud2" />
      <div className="cloud cloud3" />

      {/* 地面 */}
      <div className="ground" />

      {/* 台座 */}
      <div className="platform" />
    </div>
    );
};