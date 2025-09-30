import React from "react";
import Game from "./components/GameCanvas";
import BodyPixTest from "./components/BodyPix";

const App: React.FC = () => {
  return (
    <div>
      <Game />
      <div style={{ padding: 20, borderTop: "2px solid #ddd", marginTop: 20 }}>
        <BodyPixTest />
      </div>
    </div>
  );
};

export default App;
