'use client';
import React from 'react';
import content from '@/content/landmark-phone.json';

/* Compact "Check I'm here" sheet for phones and tablets: the same content and steps as the
   desktop phone mock-up (LandmarkPhone), reflowed into a bottom card over the street frame.
   `step` is the same value LandmarkPhone takes (0 intro, 1..5 landmark, 6 arrived). Display only,
   like the mock-up: the journey is driven by scrolling. */
const LM = content.landmarks;
const ink = '#252422', sub = '#403d39', green = '#4f772d';

export default function LandmarkSheet({ step = 0 }) {
  const arrived = step >= 6, seen = arrived ? 5 : Math.max(0, step - 1), cur = arrived ? -1 : step - 1, l = cur >= 0 ? LM[cur] : null;
  const label = step === 0 ? content.progress.intro : arrived ? content.progress.all : seen + content.progress.seenSuffix;
  return (
    <div data-m="lm-sheet-card" style={{ width: 'min(calc(100% - 24px), 480px)', boxSizing: 'border-box', padding: '10px 16px 16px', borderRadius: '26px', background: 'rgba(250,249,246,.97)', boxShadow: '0 -10px 50px -18px rgba(37,36,34,.45), 0 0 0 1px rgba(37,36,34,.06)', color: ink, fontFamily: "'Lato',ui-sans-serif,system-ui,sans-serif", display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ alignSelf: 'center', width: '38px', height: '4px', borderRadius: '2px', background: 'rgba(37,36,34,.18)' }}></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ fontSize: '20px', fontWeight: '800', letterSpacing: '-.03em', lineHeight: '1.1' }}>{content.title}</div>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '4px', height: '24px', padding: '0 9px 0 7px', borderRadius: '12px', background: 'rgba(217,150,43,.16)', color: '#8a5a0b', fontSize: '12px', fontWeight: '800', whiteSpace: 'nowrap' }}><i className="ri-information-line"></i>{content.header.badge}</span>
      </div>
      <div style={{ fontSize: '13px', fontWeight: '700', color: sub, marginTop: '-4px' }}>{content.header.market}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          {LM.map((_, i) => <div key={i} style={{ flex: '1', height: '5px', borderRadius: '3px', background: 'rgba(204,197,185,.5)', overflow: 'hidden' }}><div style={{ height: '100%', width: arrived || i < seen ? '100%' : '0%', borderRadius: '3px', background: green, transition: 'width 1.6s cubic-bezier(.45,0,.2,1)' }}></div></div>)}
        </div>
        <div style={{ fontSize: '14px', fontWeight: '700', color: sub }}>{label}</div>
      </div>
      {l ? <div key={'l' + cur} data-m="lm-sheet-in" style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px', borderRadius: '20px', background: '#fff', border: '1.5px solid ' + green, boxShadow: '0 0 0 4px rgba(79,119,45,.12)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ flex: 'none', width: '30px', height: '30px', borderRadius: '15px', background: green, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '900' }}>{cur + 1}</span>
          <div style={{ fontSize: '18px', fontWeight: '800', letterSpacing: '-.02em', lineHeight: '1.15' }}>{l.name}</div>
        </div>
        <div style={{ fontSize: '15px', lineHeight: '1.4', color: sub }}>{l.cue}</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ flex: '1', height: '46px', borderRadius: '23px', background: green, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', fontWeight: '700' }}>{content.actions.yes}</div>
          <div style={{ flex: '1', height: '46px', borderRadius: '23px', border: '1.5px solid rgba(37,36,34,.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', fontWeight: '700' }}>{content.actions.no}</div>
        </div>
      </div> : null}
      {arrived ? <div key="arr" data-m="lm-sheet-in" style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '14px', borderRadius: '20px', background: '#a7c957' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}><span style={{ flex: 'none', width: '40px', height: '40px', borderRadius: '20px', background: ink, color: '#a7c957', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}><i className="ri-check-line"></i></span><div style={{ fontSize: '22px', fontWeight: '900', letterSpacing: '-.03em', lineHeight: '1.1' }}>{content.arrived.title}</div></div>
        <div style={{ fontSize: '15px', lineHeight: '1.4' }}>{content.arrived.body}</div>
        <div style={{ height: '46px', borderRadius: '23px', background: ink, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: '700' }}>{content.arrived.done}</div>
      </div> : null}
    </div>
  );
}
