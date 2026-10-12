import MarketSearchSection from '@/components/sections/MarketSearchSection';

export const metadata = { robots: { index: false } };

export default function Page() {
  return (
    <div id="dc-root">
      <div className="sc-host" data-sc-name="orig">
        <div style={{ height: '100vh' }} />
        <MarketSearchSection />
        <div style={{ height: '100vh' }} />
      </div>
    </div>
  );
}
