'use client';
// Preview of RidePreloader under a hero-style wordmark. ?ride=stub uses the stub frames
// (node scripts/ride-stub.mjs), ?ride=live skips loading. Progress events are recorded in
// window.__preloader for tests.
import React from 'react';
import RidePreloader from '@/components/RidePreloader';
import { rideSource } from '@/components/sections/RideFrames';
import heroCopy from '@/content/home/hero.json';

type Log = { t0: number; progress: [number, number][]; readyAt: number | null };
declare global { interface Window { __preloader?: Log } }

export default function Page() {
  const [src, setSrc] = React.useState<string | null | undefined>(undefined);
  React.useEffect(() => {
    window.__preloader = { t0: performance.now(), progress: [], readyAt: null };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the source comes from the URL, read after hydration
    setSrc(rideSource(window.location.search));
  }, []);
  const log = () => window.__preloader as Log;
  return (
    <div style={{ minHeight: '100vh', fontFamily: 'Lato, sans-serif', background: '#386641', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
      <div style={{ fontSize: '28px', fontWeight: '900', letterSpacing: '-.035em', color: '#fff' }}>{heroCopy.logo}</div>
      <div style={{ minHeight: '16px' }}>
        {src !== undefined ? (
          <RidePreloader
            manifest={src}
            onProgress={(f: number) => log().progress.push([Math.round(performance.now() - log().t0), f])}
            onReady={() => { log().readyAt = Math.round(performance.now() - log().t0); }}
          />
        ) : null}
      </div>
    </div>
  );
}
