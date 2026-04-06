import { useEffect, useRef, useState } from 'react';

export interface AnimatedCounterProps {
  value: number;
  format?: (n: number) => string;
}

export function AnimatedCounter({ value, format }: AnimatedCounterProps) {
  const [display, setDisplay] = useState(value);
  const prevValue = useRef(value);
  const rafId = useRef<number>(0);

  useEffect(() => {
    const from = prevValue.current;
    const to = value;
    prevValue.current = value;

    if (from === to) {
      setDisplay(to);
      return;
    }

    const duration = 300;
    const start = performance.now();

    function tick(now: number) {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      // ease-out: 1 - (1 - t)^3
      const eased = 1 - Math.pow(1 - t, 3);
      const current = from + (to - from) * eased;

      setDisplay(current);

      if (t < 1) {
        rafId.current = requestAnimationFrame(tick);
      } else {
        setDisplay(to);
      }
    }

    rafId.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId.current);
    };
  }, [value]);

  const rendered = format ? format(display) : String(Math.round(display));

  return <>{rendered}</>;
}
