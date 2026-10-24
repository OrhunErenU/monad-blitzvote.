import { useEffect, useState } from "react";
import type { Hex } from "viem";
import { CONFIG, loadKey, saveKey } from "./chain";
import { useHashRoute } from "./hooks";
import Play, { Landing } from "./Play";
import Race from "./Race";
import Admin from "./Admin";

export default function App() {
  const route = useHashRoute();
  const [pk, setPk] = useState<Hex | null>(() => loadKey());

  // QR opens  …/#/p/0x<64 hex>  — store the key, then drop it from the URL bar
  useEffect(() => {
    const m = route.match(/^\/p\/(0x[0-9a-fA-F]{64})(?:\?.*)?$/);
    if (m) {
      const key = m[1] as Hex;
      saveKey(key);
      setPk(key);
      history.replaceState(null, "", `${location.pathname}${location.search}#/?c=${CONFIG.address}`);
    }
  }, [route]);

  if (route.startsWith("/admin")) return <Admin />;
  if (/^0x0{40}$/i.test(CONFIG.address)) {
    return (
      <div className="phone">
        <div className="pbody">
          <span className="kicker">Kurulum</span>
          <h1 className="headline">Kontrat adresi yok</h1>
          <p className="lede">
            QR kartındaki bağlantıyı kullan ya da organizatör panelinden (<a href="#/admin">#/admin</a>) deploy et.
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
