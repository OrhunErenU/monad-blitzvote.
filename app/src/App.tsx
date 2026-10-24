import { useEffect, useState } from "react";
import type { Hex } from "viem";
import { CONFIG, loadKey, saveKey } from "./chain";
import { useHashRoute } from "./hooks";
import Screen from "./Screen";
import Vote, { Landing } from "./Vote";

export default function App() {
  const route = useHashRoute();
  const [pk, setPk] = useState<Hex | null>(() => loadKey());

  // QR opens  …/#/v/0x<64 hex>  — store the key, then drop it from the URL bar
  useEffect(() => {
    const m = route.match(/^\/v\/(0x[0-9a-fA-F]{64})$/);
    if (m) {
      const key = m[1] as Hex;
      saveKey(key);
      setPk(key);
      history.replaceState(null, "", `${location.pathname}${location.search}#/`);
    }
  }, [route]);

  if (/^0x0{40}$/i.test(CONFIG.address)) {
    return (
      <div className="voter">
        <div className="empty">
          <h2>Kontrat adresi ayarlı değil</h2>
          <p className="dim">
            contracts klasöründe <code>npm run deploy</code> çalıştır ya da VITE_BLITZVOTE_ADDRESS ver.
          </p>
        </div>
      </div>
    );
  }
  if (route.startsWith("/screen")) return <Screen />;
  if (pk) return <Vote pk={pk} />;
  if (route.startsWith("/v/")) return null;
  return <Landing />;
}
