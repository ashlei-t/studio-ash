import { useEffect, useRef, useState } from "react";

export function useTypingEffect(text, speed = 14) {
  const [displayed, setDisplayed] = useState(text || "");
  const [done, setDone] = useState(true);
  const prevRef = useRef(text);
  const mountRef = useRef(false);

  useEffect(() => {
    if (!mountRef.current) {
      mountRef.current = true;
      prevRef.current = text;
      return;
    }
    if (text === prevRef.current) return;
    prevRef.current = text;

    // Intentional sync from an external prop (`text`) into local typing state.
    // The effect only runs when `text` actually changes, so this is bounded.
    if (!text) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplayed("");
      setDone(true);
      return;
    }

    setDone(false);
    let i = 0;
    setDisplayed("");
    const id = setInterval(() => {
      i += 1 + Math.floor(Math.random() * 2);
      if (i >= text.length) {
        i = text.length;
        clearInterval(id);
        setDone(true);
      }
      setDisplayed(text.slice(0, i));
    }, speed);
    return () => clearInterval(id);
  }, [text, speed]);

  return { displayed, done };
}
