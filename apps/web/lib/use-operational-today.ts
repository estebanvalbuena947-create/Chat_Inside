'use client';
import { useEffect, useState } from 'react';
import { operationalDayKey } from './operational-time';

/** Changes only at local business midnight, even with a tab left open overnight. */
export function useOperationalToday() {
  const [day, setDay] = useState(() => operationalDayKey(new Date()));
  useEffect(() => {
    const update = () => setDay(operationalDayKey(new Date()));
    const timer = window.setInterval(update, 30000);
    window.addEventListener('focus', update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', update);
    };
  }, []);
  return day;
}
