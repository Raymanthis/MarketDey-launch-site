import LandmarkPhone from '@/components/sections/LandmarkPhone';

export const metadata = { robots: { index: false } };

export default function Page() {
  return (
    <div id="dc-root">
      <div className="sc-host" data-sc-name="orig">
        <div style={{ height: '100vh' }} />
        <LandmarkPhone />
        <div style={{ height: '100vh' }} />
      </div>
    </div>
  );
}
