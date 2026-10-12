'use client';
/* eslint-disable */
import React from 'react';
import { IOSDevice } from '@/components/shared/IOSDevice';
import content from '@/content/landmark-phone.json';

const LM = content.landmarks;
class LandmarkPhone extends React.Component {
  static defaultProps = { step: 2 };
  renderVals() {
    const s = this.props.step ?? 2;
    const arrived = s >= 6;
    const seen = arrived ? 5 : Math.max(0, s - 1);
    return {
      arrRows: arrived ? '1fr' : '0fr', arrOp: arrived ? 1 : 0,
      progressLabel: s === 0 ? content.progress.intro : arrived ? content.progress.all : seen + content.progress.seenSuffix,
      segs: LM.map((_, i) => ({ w: arrived || i < seen ? '100%' : '0%' })),
      rows: LM.map((l, i) => { const n = i + 1, done = arrived || n < s, cur = !arrived && n === s;
        return { n, name: l.name, cue: l.cue, photo: l.photo,
          rad: cur ? '20px' : '16px', bg: done ? '#e4eed4' : '#fff', bd: cur ? '#4f772d' : done ? 'rgba(79,119,45,0)' : 'rgba(37,36,34,.08)', sh: cur ? '0 0 0 4px rgba(79,119,45,.12)' : '0 0 0 0 rgba(79,119,45,0)',
          bBg: cur || done ? '#4f772d' : 'rgba(79,119,45,0)', bBd: cur || done ? '#4f772d' : 'rgba(37,36,34,.22)', bFg: cur || done ? '#fff' : '#403d39',
          numOp: done ? 0 : 1, numSc: done ? 0.4 : 1, chkOp: done ? 1 : 0, chkSc: done ? 1 : 0.3, chkRot: done ? '0deg' : '-60deg',
          fs: cur ? '18px' : '15px', fc: cur || done ? '#252422' : '#403d39', seenOp: done ? 1 : 0, seenX: done ? '0px' : '10px',
          rows: cur ? '1fr' : '0fr', bodyOp: cur ? 1 : 0 }; })
    };
  }
  render() {
    const v = { ...this.props, ...this.renderVals() };
    return (
      <div className="sc-host" data-sc-name="Landmark Phone">
    <div style={{ position: 'relative', width: '426px', height: '898px', borderRadius: '70px', padding: '4px', boxSizing: 'border-box', background: 'linear-gradient(135deg,#a29d96 0%,#5a5651 16%,#2f2d2b 50%,#5a5651 84%,#a29d96 100%)', boxShadow: '0 60px 90px -40px rgba(37,36,34,.6),inset 0 0 0 1px rgba(255,255,255,.2)', fontFamily: '\'Lato\',ui-sans-serif,system-ui,sans-serif' }}>
      <div style={{ position: 'absolute', left: '-3px', top: '168px', width: '4px', height: '32px', borderRadius: '2px 0 0 2px', background: '#55514c' }}></div>
      <div style={{ position: 'absolute', left: '-3px', top: '226px', width: '4px', height: '62px', borderRadius: '2px 0 0 2px', background: '#55514c' }}></div>
      <div style={{ position: 'absolute', left: '-3px', top: '300px', width: '4px', height: '62px', borderRadius: '2px 0 0 2px', background: '#55514c' }}></div>
      <div style={{ position: 'absolute', right: '-3px', top: '262px', width: '4px', height: '98px', borderRadius: '0 2px 2px 0', background: '#55514c' }}></div>
      <div style={{ width: '100%', height: '100%', borderRadius: '66px', background: '#050505', padding: '8px', boxSizing: 'border-box' }}>
        <div style={{ width: '402px', height: '874px', borderRadius: '58px', overflow: 'hidden', background: '#000', position: 'relative' }}>
          <div className="sc-host-x" style={{ display: 'contents' }}><IOSDevice>
            <div style={{ height: '100%', position: 'relative', overflow: 'hidden', background: '#faf9f6', color: '#252422', fontFamily: '\'Lato\',ui-sans-serif,system-ui,sans-serif' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '58px 20px 34px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ flex: 'none', width: '44px', height: '44px', borderRadius: '22px', background: '#fff', border: '1px solid rgba(37,36,34,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}><i className="ri-close-line"></i></div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#403d39' }}>{content.header.market}</div>
                  <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '4px', height: '24px', padding: '0 9px 0 7px', borderRadius: '12px', background: 'rgba(217,150,43,.16)', color: '#8a5a0b', fontSize: '11px', fontWeight: '800' }}><i className="ri-information-line"></i>{content.header.badge}</span>
                </div>
                <div style={{ fontSize: '30px', fontWeight: '800', letterSpacing: '-.03em', lineHeight: '1.08' }}>{content.title}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {v.segs.map((g, i) => <React.Fragment key={i}><div style={{ flex: '1', height: '5px', borderRadius: '3px', background: 'rgba(204,197,185,.5)', overflow: 'hidden' }}><div style={{ height: '100%', width: `${g.w}`, borderRadius: '3px', background: '#4f772d', transition: 'width 1.6s cubic-bezier(.45,0,.2,1)' }}></div></div></React.Fragment>)}
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#403d39' }}>{v.progressLabel}</div>
                </div>
                <div style={{ display: 'grid', gridTemplateRows: `${v.arrRows}`, opacity: `${v.arrOp}`, transition: 'grid-template-rows .7s cubic-bezier(.2,.8,.2,1),opacity .5s' }}><div style={{ overflow: 'hidden', minHeight: '0' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '18px', borderRadius: '20px', background: '#a7c957', marginBottom: '2px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}><span style={{ flex: 'none', width: '44px', height: '44px', borderRadius: '22px', background: '#252422', color: '#a7c957', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}><i className="ri-check-line"></i></span><div style={{ fontSize: '24px', fontWeight: '900', letterSpacing: '-.03em' }}>{content.arrived.title}</div></div>
                    <div style={{ fontSize: '15px', lineHeight: '1.4' }}>{content.arrived.body}</div>
                    <div style={{ height: '48px', borderRadius: '24px', background: '#252422', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: '700' }}>{content.arrived.done}</div>
                  </div>
                </div></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {v.rows.map((r, i) => <React.Fragment key={i}>
                    <div style={{ display: 'flex', flexDirection: 'column', borderRadius: `${r.rad}`, background: `${r.bg}`, border: `1.5px solid ${r.bd}`, boxShadow: `${r.sh}`, transition: 'background .5s,border-color .5s,box-shadow .5s,border-radius .5s', overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '52px', padding: '6px 14px' }}>
                        <span style={{ position: 'relative', flex: 'none', width: '28px', height: '28px', borderRadius: '14px', boxSizing: 'border-box', background: `${r.bBg}`, border: `1.5px solid ${r.bBd}`, color: `${r.bFg}`, transition: 'background .4s,border-color .4s,color .4s' }}>
                          <span style={{ position: 'absolute', inset: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '900', opacity: `${r.numOp}`, transform: `scale(${r.numSc})`, transition: 'opacity .25s,transform .3s' }}>{r.n}</span>
                          <i className="ri-check-line" style={{ position: 'absolute', inset: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', opacity: `${r.chkOp}`, transform: `scale(${r.chkSc}) rotate(${r.chkRot})`, transition: 'opacity .35s .2s,transform .55s .2s cubic-bezier(.3,1.6,.5,1)' }}></i>
                        </span>
                        <div style={{ flex: '1', fontSize: `${r.fs}`, fontWeight: '800', letterSpacing: '-.02em', color: `${r.fc}`, transition: 'font-size .4s,color .4s' }}>{r.name}</div>
                        <div style={{ fontSize: '12px', fontWeight: '800', color: '#386641', opacity: `${r.seenOp}`, transform: `translateX(${r.seenX})`, transition: 'opacity .4s .35s,transform .5s .35s' }}>{content.seen}</div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateRows: `${r.rows}`, transition: 'grid-template-rows .65s cubic-bezier(.2,.8,.2,1)' }}><div style={{ overflow: 'hidden', minHeight: '0' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '0 12px 12px', opacity: `${r.bodyOp}`, transition: 'opacity .4s' }}>
                          <div style={{ height: '128px', borderRadius: '14px', background: 'repeating-linear-gradient(135deg,rgba(37,36,34,.07) 0 8px,transparent 8px 16px)', border: '1px solid rgba(37,36,34,.08)', display: 'flex', alignItems: 'flex-end', padding: '8px', boxSizing: 'border-box', font: '10px/1.2 ui-monospace,Menlo,monospace', color: '#403d39' }}>{`${content.photoPrefix}${r.photo}`}</div>
                          <div style={{ fontSize: '15px', lineHeight: '1.4', color: '#403d39' }}>{r.cue}</div>
                          <div style={{ display: 'flex', gap: '8px' }}><div style={{ flex: '1', height: '48px', borderRadius: '24px', background: '#4f772d', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', fontWeight: '700' }}>{content.actions.yes}</div><div style={{ flex: '1', height: '48px', borderRadius: '24px', border: '1.5px solid rgba(37,36,34,.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', fontWeight: '700' }}>{content.actions.no}</div></div>
                        </div>
                      </div></div>
                    </div>
                  </React.Fragment>)}
                </div>
              </div>
            </div>
          </IOSDevice></div>
        </div>
      </div>
    </div>
      </div>
    );
  }
}

export default LandmarkPhone;
