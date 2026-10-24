import { useEffect, useRef, useState } from "react";
import { readSnapshot, type Snapshot } from "./chain";

export function useSnapshot(intervalMs = 1500) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tick = useRef(0);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      if (document.hidden && tick.current > 0) return; // background tabs don't hammer the RPC
      try {
        const s = await readSnapshot();
        if (alive) {
          setSnap(s);
          setError(null);
        }
      } catch (e) {
        if (alive) setError((e as Error).message?.split("\n")[0] ?? "RPC hatası");
      }
    };
    run();
    const id = setInterval(() => {
      tick.current++;
      run();
    }, intervalMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [intervalMs]);

  return { snap, error };
}

export function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash.replace(/^#/, "") || "/";
}
