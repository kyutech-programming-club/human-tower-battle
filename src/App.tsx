import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./stages/Home";
import GameCanvas from "./components/GameCanvas";

function App() {
  return (
    <>
      <Router>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/stage1" element={<GameCanvas stage="stage1" />} />
          <Route path="/stage2" element={<GameCanvas stage="stage2" />} />
          <Route path="/stage3" element={<GameCanvas stage="stage3" />} />
        </Routes>
      </Router>
    </>
  );
}

export default App;
