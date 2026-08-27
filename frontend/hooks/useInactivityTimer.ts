import { useEffect, useRef, useState, useCallback } from 'react';

interface UseInactivityTimerOptions {
  timeout: number;
  warningTime: number;
  onWarning: () => void;
  onTimeout: () => void;
  enabled?: boolean;
}

const EVENTS = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart', 'keypress'];

export function useInactivityTimer({
  timeout,
  warningTime,
  onWarning,
  onTimeout,
  enabled = true
}: UseInactivityTimerOptions) {
  const [remaining, setRemaining] = useState(timeout);
  const [isWarning, setIsWarning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const warnedRef = useRef(false);

  const reset = useCallback(() => {
    lastActivityRef.current = Date.now();
    warnedRef.current = false;
    setIsWarning(false);
    setRemaining(timeout);
  }, [timeout]);

  useEffect(() => {
    if (!enabled) return;

    const handleActivity = () => {
      if (warnedRef.current) return;
      lastActivityRef.current = Date.now();
      setIsWarning(false);
    };

    EVENTS.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      EVENTS.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    // Fresh inactivity clock whenever the timer (re)activates (e.g. after a
    // logout → re-login). A stale lastActivityRef/warnedRef from a previous
    // warning otherwise triggers onTimeout within ~1s of the next login.
    lastActivityRef.current = Date.now();
    warnedRef.current = false;
    setIsWarning(false);
    setRemaining(timeout);
  }, [enabled, timeout]);

  useEffect(() => {
    if (!enabled) return;

    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - lastActivityRef.current) / 1000);
      const left = Math.max(0, timeout - elapsed);

      setRemaining(left);

      if (left <= warningTime && !warnedRef.current) {
        warnedRef.current = true;
        setIsWarning(true);
        onWarning();
      }

      if (left <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        onTimeout();
      }
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timeout, warningTime, onWarning, onTimeout, enabled]);

  return { remaining, isWarning, reset };
}
