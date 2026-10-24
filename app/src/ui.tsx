import type React from "react";

export function Segments({ total, typed, confirmed }: { total: number; typed: number; confirmed: number }) {
  return (
    <div className="segs">
      <div className="cells">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={`cell${i < confirmed ? " conf" : i < typed ? " typed" : ""}`} />
        ))}
      </div>
      <div className="legend">
        <span>yazdın {typed}</span>
        <span className="c">zincirde {confirmed}</span>
      </div>
    </div>
  );
}

export function Shell({ status, children }: { status: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="phone">
      <header className="ptop">
        <span className="wordmark" lang="en">
          BlitzType<span className="cur" />
        </span>
        {status}
      </header>
      {children}
    </div>
  );
}
