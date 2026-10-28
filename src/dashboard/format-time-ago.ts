import { useEffect, useState } from "react";

const units = [
  { suffix: "d", seconds: 86_400 },
  { suffix: "h", seconds: 3_600 },
  { suffix: "m", seconds: 60 },
] as const;

/** A short age for a column: "3d", "2h", "5m" or "now". */
export const formatAge = (isoDate: string, now = Date.now()) => {
  const secondsAgo = Math.max(0, (now - new Date(isoDate).getTime()) / 1000);
  const match = units.find(({ seconds }) => secondsAgo >= seconds);

  return match ? `${Math.floor(secondsAgo / match.seconds)}${match.suffix}` : "now";
};

/** Now, a minute at a time: an age keeps counting while its row, unchanged, is not rendered anew. */
export const useNow = () => {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);

    return () => clearInterval(timer);
  }, []);

  return now;
};
