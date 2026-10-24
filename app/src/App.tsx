import { useEffect, useState } from "react";
import type { Hex } from "viem";
import { CONFIG, loadKey, saveKey } from "./chain";
import { useHashRoute } from "./hooks";
import Play, { Landing } from "./Play";
import Race from "./Race";

export default function App() {
  const route = useHashRoute();
  const [pk, setPk] = useState<Hex | null>(() => loadKey());

  // QR opens  …/#/p/0x<64 hex>  — store the key, then drop it from the URL bar
  useEffect(() => {
    const m = route.match(/^\/p\/(0x[0-9a-fA-F]{64})$/);
    if (m) {
      const key = m[1] as Hex;
      saveKey(key);
      setPk(key);
      history.replaceState(null, "", `${location.pathname}${location.search}#/`);
    }
  }, [route]);

  if (/^0x0{40}$/i.test(CONFIG.address)) {
    return (
      <div className="phone">
        <div className="center">
          <h2>Kontrat adresi ayarlı değil</h2>
          <p className="dim">
            contracts klasöründe <code>npm run deploy</code> çalıştır ya da VITE_BLITZTYPE_ADDRESS ver.
          </p>
        </div>
      </div>
    );
  }
  if (route.startsWith("/screen")) return <Race />;
  if (pk) return <Play pk={pk} />;
  if (route.startsWith("/p/")) return null;
  return <Landing />;
}
