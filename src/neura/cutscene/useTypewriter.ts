import { useCallback, useEffect, useMemo, useState } from 'react';

export function useTypewriter(
  text: string,
  {
    active = true,
    speedMs = 22,
  }: {
    active?: boolean;
    speedMs?: number;
  } = {},
) {
  const [visibleChars, setVisibleChars] = useState(() => (active ? 0 : text.length));

  useEffect(() => {
    setVisibleChars(active ? 0 : text.length);
  }, [active, text]);

  useEffect(() => {
    if (!active || visibleChars >= text.length) return undefined;

    const id = window.setInterval(() => {
      setVisibleChars((current) => Math.min(text.length, current + 1));
    }, Math.max(8, speedMs));

    return () => window.clearInterval(id);
  }, [active, speedMs, text.length, visibleChars]);

  const revealAll = useCallback(() => {
    setVisibleChars(text.length);
  }, [text.length]);

  const visibleText = useMemo(() => text.slice(0, visibleChars), [text, visibleChars]);

  return {
    visibleText,
    isComplete: visibleChars >= text.length,
    revealAll,
  };
}
