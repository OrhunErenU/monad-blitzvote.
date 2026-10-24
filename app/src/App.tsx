import { useEffect, useState } from "react";
import type { Hex } from "viem";
import { generatePrivateKey } from "viem/accounts";
import { CONFIG, loadKey, saveKey } from "./chain";
import { useHashRoute } from "./hooks";
import Play from "./Play";
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

  // no card: any player route makes a wallet in this browser; the player funds it themselves
  useEffect(() => {
    if (!pk && !route.startsWith("/admin") && !route.startsWith("/screen") && !route.startsWith("/p/")) {
      const key = generatePrivateKey();
      saveKey(key);
      setPk(key);
    }
  }, [route, pk]);

  if (route.startsWith("/admin")) return <Admin />;
  if (/^0x0{40}$/i.test(CONFIG.address)) {
    return (
      <div className="phone">
        <div className="pbody">
          <span className="kicker">Setup</span>
          <h1 className="headline">No contract address</h1>
          <p className="lede">
            Open the link on your QR card, or deploy from the organizer panel (<a href="#/admin">#/admin</a>).
          </p>
        </div>
      </div>
    );
  }
  if (route.startsWith("/screen")) return <Race />;
  if (route.startsWith("/solo")) return pk ? <Play pk={pk} initialMode="solo" /> : null;
  if (route.startsWith("/play")) return pk ? <Play pk={pk} initialMode="room" /> : null;
  // straight into the game: a wallet is made in this browser on first visit
  if (pk) return <Play pk={pk} />;
  return null;
}
