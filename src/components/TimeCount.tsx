import { useState, useEffect } from "react";

export default function Timer() {
  const [count, setCount] = useState(0);  
  const [round, setRound] = useState(0);   

  useEffect(() => {
    const interval = setInterval(() => {
      setCount((prev) => {
        if (prev === 5) {
          setRound((r) => r + 1);
          return 0;
        }
        return prev + 1;
      });
    }, 1000); 

    return () => clearInterval(interval); 
  }, []);

  return (
    <div>
      <h1>タイマー</h1>
      <p>{count} 秒</p>
      <p>ラウンド {round}</p>
    </div>
  );
}