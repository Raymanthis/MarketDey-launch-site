'use client';
// Preloads the Landmarks Journey ride frames while the visitor watches the hero, and shows a small
// percentage label meant to sit under the Marketdey wordmark ("Loading 47%").
//
// Frames go into the shared RideFrames cache (src/components/sections/RideFrames.js), so the
// section never downloads them again. Loading runs in the store, not in this component: it keeps
// going in the background after onReady, even if the label is unmounted.
//
// Props
//   manifest    manifest URL (default: the real frames; pass null to skip -> ready at once), or
//               RIDE_MODEL ('model'): the live street model's glb download (RideModel.js)
//   onProgress  (fraction 0..1) => void, on every loaded frame
//   onReady     () => void, once: at 100%, or after 20 s if the first 64 entries of
//               manifest.order are loaded, or immediately if the manifest fails (the section then
//               uses the live street)
import React from 'react';
import copy from '@/content/preloader.json';
import { RIDE_MANIFEST, RIDE_MODEL, rideStore } from '@/components/sections/RideFrames';
import { modelStore } from '@/components/sections/RideModel';

const LABEL = { font: '700 13px Lato, sans-serif', color: 'rgba(255,255,255,.85)', letterSpacing: '.04em', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };

/** @param {{ manifest?: string | null, onProgress?: (fraction: number) => void, onReady?: () => void, style?: React.CSSProperties }} props */
export default function RidePreloader({ manifest = RIDE_MANIFEST, onProgress, onReady, style }) {
  const [view, setView] = React.useState({ pct: 0, ready: false });
  const cb = React.useRef({ onProgress, onReady });
  React.useEffect(() => { cb.current = { onProgress, onReady }; });
  React.useEffect(() => {
    let fired = false, last = -1;
    const handle = s => {
      if (s.fraction !== last) { last = s.fraction; if (cb.current.onProgress) cb.current.onProgress(s.fraction); }
      setView({ pct: Math.floor(s.fraction * 100), ready: s.ready });
      if (s.ready && !fired) { fired = true; if (cb.current.onReady) cb.current.onReady(); }
    };
    if (!manifest) { handle({ fraction: 0, ready: true }); return undefined; }
    return manifest === RIDE_MODEL ? modelStore().subscribe(handle) : rideStore(manifest).subscribe(handle);
  }, [manifest]);
  return (
    <div role="status" aria-live="polite" style={style ? { ...LABEL, ...style } : LABEL}>
      {view.ready ? copy.ready : `${copy.loading} ${view.pct}%`}
    </div>
  );
}
