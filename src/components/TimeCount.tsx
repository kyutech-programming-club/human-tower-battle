import { useState, useEffect } from "react";

export default function Timer() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCount((prev) => (prev + 1) % 6); 
    }, 1000); 

    return () => clearInterval(interval); 
  }, []);

  return (
    <div>
      <h1>タイマー</h1>
      <p> {count} 秒</p>
    </div>
  );
}