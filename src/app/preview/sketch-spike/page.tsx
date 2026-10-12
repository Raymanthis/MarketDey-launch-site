import { Suspense } from 'react';
import SketchSpike from '@/components/spike/SketchSpike';

export const metadata = { robots: { index: false } };

type Params = { src?: string | string[]; stats?: string | string[] };

async function Viewer({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.src) ? sp.src[0] : sp.src;
  const src = raw && /^[a-z0-9_-]+$/i.test(raw) ? raw : 'spike';
  const stats = (Array.isArray(sp.stats) ? sp.stats[0] : sp.stats) === '1';
  return <SketchSpike src={src} stats={stats} />;
}

export default function Page({ searchParams }: { searchParams: Promise<Params> }) {
  return (
    <Suspense fallback={<div style={{ height: '400vh', background: '#f7f5ef' }} />}>
      <Viewer searchParams={searchParams} />
    </Suspense>
  );
}
