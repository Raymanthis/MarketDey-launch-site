'use client';
/* eslint-disable */
import React from 'react';
import IOSDevice from '@/components/shared/IOSDevice';
import content from '@/content/contributors.json';
import './ContributorsSection.global.css';

const START = 82;
const PLACES = content.card.places;
const ACTS = [[content.card.actions[0], 'ri-notification-3-line', 1, 'rgba(204,197,185,.35)', '#403d39'], [content.card.actions[1], 'ri-road-map-line', 5, 'rgba(217,150,43,.16)', '#8a5a0b'], [content.card.actions[2], 'ri-check-double-line', 10, '#e4eed4', '#386641'], [content.card.actions[3], 'ri-store-2-line', 50, '#e4eed4', '#386641']];
const pos = p => p <= 100 ? p / 100 * 0.42 : 0.42 + Math.min(1, (p - 100) / 900) * 0.58;
class ContributorsSection extends React.Component {
  state = { pts: START, qi: 0, phase: 'ask', thanks: '' };
  flyRef = React.createRef(); ptsRef = React.createRef();
  componentWillUnmount() { clearTimeout(this.t1); }
  award(e, n, after) {
    const src = e && e.currentTarget, dst = this.ptsRef.current, layer = this.flyRef.current;
    const land = () => { const was = this.state.pts; this.setState(s => ({ pts: s.pts + n })); if (dst && dst.animate) dst.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' }); if (was < 100 && was + n >= 100) this.levelUp(); if (after) after(); };
    if (!src || !dst || !layer || !layer.animate) { land(); return; }
    const a = src.getBoundingClientRect(), b = dst.getBoundingClientRect(), chip = document.createElement('span');
    chip.textContent = '+' + n; chip.style.cssText = 'position:fixed;left:0;top:0;height:32px;padding:0 12px;border-radius:16px;background:#a7c957;color:#252422;font:900 16px Lato,sans-serif;display:inline-flex;align-items:center;box-shadow:0 10px 24px -8px rgba(0,0,0,.4);white-space:nowrap';
    layer.appendChild(chip);
    const x0 = a.left + a.width / 2 - 20, y0 = a.top + a.height / 2 - 16, x1 = b.left + b.width / 2 - 20, y1 = b.top + b.height / 2 - 16, mx = (x0 + x1) / 2, my = Math.min(y0, y1) - 80;
    const an = chip.animate([{ transform: 'translate(' + x0 + 'px,' + y0 + 'px) scale(.6)', opacity: 0 }, { transform: 'translate(' + x0 + 'px,' + (y0 - 24) + 'px) scale(1.1)', opacity: 1, offset: 0.18 }, { transform: 'translate(' + mx + 'px,' + my + 'px) scale(1)', opacity: 1, offset: 0.6 }, { transform: 'translate(' + x1 + 'px,' + y1 + 'px) scale(.7)', opacity: 0.2 }], { duration: 900, easing: 'cubic-bezier(.4,0,.2,1)' });
    an.onfinish = () => { chip.remove(); land(); };
  }
  levelUp() { const layer = this.flyRef.current, dst = this.ptsRef.current; if (!layer || !dst || !layer.animate) return; const b = dst.getBoundingClientRect();
    for (let i = 0; i < 3; i++) { const r = document.createElement('span'); r.style.cssText = 'position:fixed;left:' + (b.left + b.width / 2 - 30) + 'px;top:' + (b.top + b.height / 2 - 30) + 'px;width:60px;height:60px;border-radius:30px;border:3px solid #a7c957;box-sizing:border-box'; layer.appendChild(r); r.animate([{ transform: 'scale(.3)', opacity: 1 }, { transform: 'scale(' + (2.4 + i) + ')', opacity: 0 }], { duration: 900 + i * 200, delay: i * 120, easing: 'ease-out' }).onfinish = () => r.remove(); } }
  answer(e, yes) { if (this.state.phase !== 'ask') return; const n = 3; this.setState({ phase: 'thanks', thanks: yes === null ? content.card.thanksSkipped : content.card.thanksAnswered });
    const next = () => { this.t1 = setTimeout(() => this.setState(s => ({ phase: 'ask', qi: (s.qi + 1) % PLACES.length })), 1300); };
    if (yes === null) next(); else this.award(e, n, next); }
  renderVals() {
    const p = this.state.pts, tier = p >= 1000 ? 2 : p >= 100 ? 1 : 0;
    const names = content.standing.tierNames, mult = content.standing.multipliers;
    const hint = tier === 0 ? (100 - p) + content.standing.hintTier0Suffix : tier === 1 ? content.standing.hintTier1Prefix + (1000 - p) + content.standing.hintTier1Suffix : content.standing.hintTier2;
    return {
      flyRef: this.flyRef, ptsRef: this.ptsRef,
      q: { place: PLACES[this.state.qi], count: (this.state.qi + 1) + content.card.countSeparator + PLACES.length },
      asking: this.state.phase === 'ask', thanks: this.state.phase === 'thanks', thanksTitle: this.state.thanks,
      ansYes: e => this.answer(e, true), ansNo: e => this.answer(e, false), ansSkip: e => this.answer(e, null),
      acts: ACTS.map(([label, icon, pts, bg, fg]) => ({ label, icon, pts: String(pts), bg, fg, go: e => this.award(e, pts) })),
      pts: String(p), tierName: names[tier] + content.standing.titleSeparator + mult[tier],
      barPct: (pos(p) * 100).toFixed(1) + '%',
      nodes: [0, 100, 1000].map((th, i) => ({ left: (pos(th) * 100) + '%', bg: p >= th ? '#4f772d' : '#fff', bd: p >= th ? '#4f772d' : 'rgba(37,36,34,.2)', sc: i === tier ? 1.15 : 1, label: content.standing.nodeLabels[i], cbg: i === tier ? (i === 2 ? '#4f772d' : '#e4eed4') : 'rgba(204,197,185,.35)', cfg: i === tier ? (i === 2 ? '#fff' : '#386641') : '#403d39' })),
      hint, canReset: p !== START, reset: () => this.setState({ pts: START, qi: 0, phase: 'ask' })
    };
  }
  render() {
    const v = { ...this.props, ...this.renderVals() };
    return (
      <div className="sc-host" data-sc-name="Contributors Section">
      <div data-screen-label="08 Contribute" style={{ position: 'relative', fontFamily: '\'Lato\',ui-sans-serif,system-ui,sans-serif', color: '#252422', padding: '120px 0', background: '#386641' }}>
        <div ref={v.flyRef} style={{ position: 'fixed', left: '0', top: '0', width: '0', height: '0', zIndex: '50', pointerEvents: 'none' }}>
        </div>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 32px' }}>
          <div style={{ color: '#fff', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,440px),1fr))', gap: '56px', alignItems: 'center', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', order: '0' }}>
              <div style={{ flex: 'none', marginTop: '64px' }}>
                <div style={{ zoom: '0.61' }}>
                  <div style={{ position: 'relative', width: '420px', height: '892px', borderRadius: '40px', padding: '3px', boxSizing: 'border-box', background: 'linear-gradient(90deg,#8f8c87 0%,#d2cfca 7%,#7b7873 50%,#d2cfca 93%,#8f8c87 100%)', boxShadow: '0 60px 90px -40px rgba(37,36,34,.6),inset 0 0 0 1px rgba(255,255,255,.25)' }}>
                    <div style={{ position: 'absolute', right: '-3px', top: '196px', width: '4px', height: '112px', borderRadius: '0 2px 2px 0', background: '#9a9792' }}>
                    </div>
                    <div style={{ position: 'absolute', right: '-3px', top: '336px', width: '4px', height: '62px', borderRadius: '0 2px 2px 0', background: '#9a9792' }}>
                    </div>
                    <div style={{ width: '100%', height: '100%', borderRadius: '37px', background: '#050505', padding: '6px', boxSizing: 'border-box' }}>
                      <div style={{ width: '402px', height: '874px', borderRadius: '31px', overflow: 'hidden', position: 'relative', background: '#faf9f6' }}>
                        <div data-screen-label="CF-01 on site light" style={{ height: '100%', position: 'relative', overflow: 'hidden', background: '#faf9f6', color: '#252422', fontFamily: '\'Lato\',ui-sans-serif,system-ui,\'Segoe UI\',Helvetica,Arial,sans-serif' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '58px 20px 34px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <div style={{ flex: 'none', width: '40px', height: '40px', borderRadius: '20px', background: '#ffffff', border: '1px solid rgba(37,36,34,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#252422' }}>
                                <i className="ri-close-line" style={{ fontSize: '20px', lineHeight: '1', width: '20px', height: '20px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                                </i>
                              </div>
                              <div style={{ fontSize: '13px', fontWeight: '700', color: '#403d39' }}>
                                {content.siteQuestionPhone.progress}
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                              <i className="ri-map-pin-line" style={{ fontSize: '15px', lineHeight: '1', width: '15px', height: '15px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none', color: '#403d39' }}>
                              </i>
                              <div style={{ fontSize: '13px', fontWeight: '600', color: '#403d39' }}>
                                {content.siteQuestionPhone.location}
                              </div>
                            </div>
                            <div style={{ fontSize: '32px', fontWeight: '800', letterSpacing: '-.03em', lineHeight: '1.08', textWrap: 'balance', color: '#252422' }}>
                              {content.siteQuestionPhone.title}
                            </div>
                            <div style={{ fontSize: '16px', lineHeight: '1.45', color: '#403d39' }}>
                              {content.siteQuestionPhone.subtitle}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
                              <div style={{ display: 'flex', gap: '10px' }}>
                                <div style={{ boxSizing: 'border-box', height: '56px', borderRadius: '28px', flex: '1', minWidth: '0', padding: '0 10px', textAlign: 'center', lineHeight: '1.2', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '16px', fontWeight: '700', background: '#4f772d', color: '#ffffff' }}>
                                  <i className="ri-check-line" style={{ fontSize: '20px', lineHeight: '1', width: '20px', height: '20px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                                  </i>
                                  {content.siteQuestionPhone.yes}
                                </div>
                                <div style={{ boxSizing: 'border-box', height: '56px', borderRadius: '28px', flex: '1', minWidth: '0', padding: '0 10px', textAlign: 'center', lineHeight: '1.2', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '16px', fontWeight: '700', border: '1.5px solid rgba(37,36,34,.22)', color: '#252422' }}>
                                  <i className="ri-close-line" style={{ fontSize: '20px', lineHeight: '1', width: '20px', height: '20px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                                  </i>
                                  {content.siteQuestionPhone.no}
                                </div>
                              </div>
                              <div style={{ boxSizing: 'border-box', height: '56px', borderRadius: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '16px', fontWeight: '700', background: 'rgba(204,197,185,.35)', color: '#252422' }}>
                                {content.siteQuestionPhone.notSure}
                              </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'row', gap: '10px', padding: '16px', borderRadius: '18px', background: '#e4eed4', border: '1px solid transparent' }}>
                              <i className="ri-map-pin-line" style={{ fontSize: '18px', lineHeight: '1', width: '18px', height: '18px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none', color: '#386641' }}>
                              </i>
                              <div style={{ fontSize: '13px', lineHeight: '1.45', color: '#403d39' }}>
                                {content.siteQuestionPhone.callout}
                              </div>
                            </div>
                            <div style={{ fontSize: '13px', lineHeight: '1.45', color: '#403d39' }}>
                              {content.siteQuestionPhone.footnote}
                            </div>
                          </div>
                        </div>
                        <div style={{ position: 'absolute', top: '0', left: '0', right: '0', height: '42px', padding: '0 26px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: '30', color: '#252422', fontSize: '14px', fontWeight: '700', pointerEvents: 'none' }}>
                          <span>
                            {content.siteQuestionPhone.statusTime}
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ display: 'flex', alignItems: 'flex-end', gap: '1.5px', height: '11px' }}>
                              <span style={{ width: '3px', height: '4px', borderRadius: '1px', background: '#252422' }}>
                              </span>
                              <span style={{ width: '3px', height: '6px', borderRadius: '1px', background: '#252422' }}>
                              </span>
                              <span style={{ width: '3px', height: '8.5px', borderRadius: '1px', background: '#252422' }}>
                              </span>
                              <span style={{ width: '3px', height: '11px', borderRadius: '1px', background: '#252422' }}>
                              </span>
                            </span>
                            <span style={{ fontSize: '11px', fontWeight: '900' }}>
                              {content.siteQuestionPhone.statusNetwork}
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '1px' }}>
                              <span style={{ width: '20px', height: '10px', borderRadius: '3px', border: '1.5px solid #252422', boxSizing: 'border-box', padding: '1px', display: 'flex' }}>
                                <span style={{ width: '70%', background: '#252422', borderRadius: '1px' }}>
                                </span>
                              </span>
                            </span>
                          </span>
                        </div>
                        <div style={{ position: 'absolute', top: '13px', left: '50%', marginLeft: '-8px', width: '16px', height: '16px', borderRadius: '50%', background: '#0a0a0a', boxShadow: '0 0 0 2px rgba(10,10,10,.35)', zIndex: '31' }}>
                        </div>
                        <div style={{ position: 'absolute', bottom: '9px', left: '50%', marginLeft: '-60px', width: '120px', height: '4px', borderRadius: '2px', background: 'rgba(37,36,34,.35)', zIndex: '31' }}>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ flex: 'none' }}>
                <div style={{ zoom: '0.61' }}>
                  <div style={{ position: 'relative', width: '426px', height: '898px', borderRadius: '70px', padding: '4px', boxSizing: 'border-box', background: 'linear-gradient(135deg,#a29d96 0%,#5a5651 16%,#2f2d2b 50%,#5a5651 84%,#a29d96 100%)', boxShadow: '0 60px 90px -40px rgba(37,36,34,.6),inset 0 0 0 1px rgba(255,255,255,.2)' }}>
                    <div style={{ position: 'absolute', left: '-3px', top: '168px', width: '4px', height: '32px', borderRadius: '2px 0 0 2px', background: '#55514c' }}>
                    </div>
                    <div style={{ position: 'absolute', left: '-3px', top: '226px', width: '4px', height: '62px', borderRadius: '2px 0 0 2px', background: '#55514c' }}>
                    </div>
                    <div style={{ position: 'absolute', left: '-3px', top: '300px', width: '4px', height: '62px', borderRadius: '2px 0 0 2px', background: '#55514c' }}>
                    </div>
                    <div style={{ position: 'absolute', right: '-3px', top: '262px', width: '4px', height: '98px', borderRadius: '0 2px 2px 0', background: '#55514c' }}>
                    </div>
                    <div style={{ position: 'absolute', right: '-3px', top: '520px', width: '4px', height: '64px', borderRadius: '0 2px 2px 0', background: '#55514c' }}>
                    </div>
                    <div style={{ width: '100%', height: '100%', borderRadius: '66px', background: '#050505', padding: '8px', boxSizing: 'border-box' }}>
                      <div style={{ width: '402px', height: '874px', borderRadius: '58px', overflow: 'hidden', background: '#000', position: 'relative' }}>
                        <div className="sc-host-x" style={{ display: 'contents' }}>
                          <IOSDevice>
                            <div data-screen-label="AC-03 light" style={{ height: '100%', position: 'relative', overflow: 'hidden', background: '#faf9f6', color: '#252422', fontFamily: '\'Lato\',ui-sans-serif,system-ui,\'Segoe UI\',Helvetica,Arial,sans-serif' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '58px 20px 34px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                  <div style={{ flex: 'none', width: '40px', height: '40px', borderRadius: '20px', background: '#ffffff', border: '1px solid rgba(37,36,34,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#252422' }}>
                                    <i className="ri-arrow-left-line" style={{ fontSize: '20px', lineHeight: '1', width: '20px', height: '20px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                                    </i>
                                  </div>
                                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#403d39' }}>
                                    {content.standingPhone.back}
                                  </div>
                                </div>
                                <div style={{ fontSize: '34px', fontWeight: '800', letterSpacing: '-.03em', lineHeight: '1.08', textWrap: 'balance', color: '#252422' }}>
                                  {content.standingPhone.title}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '18px', borderRadius: '22px', background: '#ffffff', border: '1px solid rgba(37,36,34,.08)' }}>
                                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px' }}>
                                    <div style={{ flex: '1', minWidth: '0' }}>
                                      <div style={{ fontSize: '13px', fontWeight: '700', color: '#386641' }}>
                                        {content.standingPhone.pointsLabel}
                                      </div>
                                      <div style={{ fontSize: '52px', fontWeight: '800', letterSpacing: '-.045em', lineHeight: '1', color: '#252422' }}>
                                        {content.standingPhone.pointsValue}
                                      </div>
                                    </div>
                                    <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: '6px', height: '32px', padding: '0 12px', borderRadius: '16px', background: '#e4eed4', color: '#386641', fontSize: '13px', fontWeight: '800' }}>
                                      <i className="ri-shield-star-line" style={{ fontSize: '16px', lineHeight: '1', width: '16px', height: '16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                                      </i>
                                      {content.standingPhone.badge}
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingTop: '2px' }}>
                                    <i className="ri-hourglass-2-line" style={{ fontSize: '20px', lineHeight: '1', width: '20px', height: '20px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none', color: '#8a5a0b' }}>
                                    </i>
                                    <div style={{ flex: '1', minWidth: '0' }}>
                                      <div style={{ fontSize: '16px', fontWeight: '700', color: '#252422' }}>
                                        {content.standingPhone.pendingTitle}
                                      </div>
                                      <div style={{ fontSize: '13px', lineHeight: '1.4', color: '#403d39' }}>
                                        {content.standingPhone.pendingNote}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px' }}>
                                    <div style={{ fontSize: '13px', fontWeight: '700', letterSpacing: '.02em', color: '#403d39' }}>
                                      {content.standingPhone.nextTierHeading}
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '16px', borderRadius: '20px', background: '#ffffff', border: '1px solid rgba(37,36,34,.08)' }}>
                                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px' }}>
                                      <div style={{ fontSize: '16px', fontWeight: '750', color: '#252422' }}>
                                        {content.standingPhone.nextTierName}
                                      </div>
                                      <div style={{ fontSize: '13px', fontWeight: '700', color: '#403d39' }}>
                                        {content.standingPhone.nextTierProgress}
                                      </div>
                                    </div>
                                    <div style={{ height: '10px', borderRadius: '5px', background: 'rgba(204,197,185,.35)', overflow: 'hidden' }}>
                                      <div style={{ width: '41%', height: '100%', background: '#4f772d' }}>
                                      </div>
                                    </div>
                                    <div style={{ fontSize: '13px', lineHeight: '1.45', color: '#403d39' }}>
                                      {content.standingPhone.nextTierNote}
                                    </div>
                                  </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px' }}>
                                    <div style={{ fontSize: '13px', fontWeight: '700', letterSpacing: '.02em', color: '#403d39' }}>
                                      {content.standingPhone.unlockHeading}
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', borderRadius: '18px', background: '#ffffff', border: '1px solid rgba(37,36,34,.08)', overflow: 'hidden' }}>
                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '14px 16px', borderBottom: '1px solid rgba(37,36,34,.08)' }}>
                                      <span style={{ flex: 'none', width: '34px', height: '34px', borderRadius: '17px', background: '#e4eed4', color: '#386641', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <i className="ri-user-line" style={{ fontSize: '18px', lineHeight: '1', width: '18px', height: '18px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                                        </i>
                                      </span>
                                      <div style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                          <div style={{ fontSize: '16px', fontWeight: '750', color: '#252422' }}>
                                            {content.standingPhone.tierNewReporter}
                                          </div>
                                        </div>
                                        <div style={{ fontSize: '13px', lineHeight: '1.45', color: '#403d39' }}>
                                          {content.standingPhone.tierNewReporterNote}
                                        </div>
                                      </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '14px 16px', borderBottom: '1px solid rgba(37,36,34,.08)' }}>
                                      <span style={{ flex: 'none', width: '34px', height: '34px', borderRadius: '17px', background: '#e4eed4', color: '#386641', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <i className="ri-shield-star-line" style={{ fontSize: '18px', lineHeight: '1', width: '18px', height: '18px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                                        </i>
                                      </span>
                                      <div style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                          <div style={{ fontSize: '16px', fontWeight: '750', color: '#252422' }}>
                                            {content.standingPhone.tierTrustedReporter}
                                          </div>
                                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', height: '26px', padding: '0 10px 0 8px', borderRadius: '13px', background: '#e4eed4', color: '#386641', fontSize: '12px', fontWeight: '800' }}>
                                            {content.standingPhone.youAreHere}
                                          </span>
                                        </div>
                                        <div style={{ fontSize: '13px', lineHeight: '1.45', color: '#403d39' }}>
                                          {content.standingPhone.tierTrustedReporterNote}
                                        </div>
                                      </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '14px 16px' }}>
                                      <span style={{ flex: 'none', width: '34px', height: '34px', borderRadius: '17px', background: 'rgba(204,197,185,.35)', color: '#403d39', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <i className="ri-shield-check-line" style={{ fontSize: '18px', lineHeight: '1', width: '18px', height: '18px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                                        </i>
                                      </span>
                                      <div style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                          <div style={{ fontSize: '16px', fontWeight: '750', color: '#252422' }}>
                                            {content.standingPhone.tierTownVerifier}
                                          </div>
                                        </div>
                                        <div style={{ fontSize: '13px', lineHeight: '1.45', color: '#403d39' }}>
                                          {content.standingPhone.tierTownVerifierNote}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', borderRadius: '18px', background: '#ffffff', border: '1px solid rgba(37,36,34,.08)', overflow: 'hidden' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '56px', padding: '12px 16px', borderBottom: '1px solid rgba(37,36,34,.08)' }}>
                                    <span style={{ flex: 'none', width: '34px', height: '34px', borderRadius: '17px', background: 'rgba(204,197,185,.35)', color: '#403d39', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                      <i className="ri-list-check-2" style={{ fontSize: '18px', lineHeight: '1', width: '18px', height: '18px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                                      </i>
                                    </span>
                                    <div style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                      <div style={{ fontSize: '16px', fontWeight: '650', color: '#252422' }}>
                                        {content.standingPhone.activityTitle}
                                      </div>
                                      <div style={{ fontSize: '13px', lineHeight: '1.35', color: '#403d39' }}>
                                        {content.standingPhone.activityNote}
                                      </div>
                                    </div>
                                    <i className="ri-arrow-right-s-line" style={{ fontSize: '20px', lineHeight: '1', width: '20px', height: '20px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none', color: '#403d39' }}>
                                    </i>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '56px', padding: '12px 16px' }}>
                                    <span style={{ flex: 'none', width: '34px', height: '34px', borderRadius: '17px', background: 'rgba(204,197,185,.35)', color: '#403d39', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                      <i className="ri-question-line" style={{ fontSize: '18px', lineHeight: '1', width: '18px', height: '18px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                                      </i>
                                    </span>
                                    <div style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                      <div style={{ fontSize: '16px', fontWeight: '650', color: '#252422' }}>
                                        {content.standingPhone.howPointsWork}
                                      </div>
                                    </div>
                                    <i className="ri-arrow-right-s-line" style={{ fontSize: '20px', lineHeight: '1', width: '20px', height: '20px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none', color: '#403d39' }}>
                                    </i>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </IOSDevice>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ fontSize: '14px', fontWeight: '700', color: '#a7c957' }}>
                  {content.copy.eyebrow}
                </div>
                <h2 style={{ margin: '0', fontSize: 'clamp(36px,4.2vw,52px)', fontWeight: '900', letterSpacing: '-.035em', lineHeight: '1.02', textWrap: 'balance' }}>
                  {content.copy.heading}
                </h2>
                <div style={{ fontSize: '18px', lineHeight: '1.5', color: '#e4eed4' }}>
                  {content.copy.body}
                </div>
              </div>
              <div style={{ borderRadius: '24px', background: '#faf9f6', color: '#252422', overflow: 'hidden', boxShadow: '0 30px 60px -30px rgba(0,0,0,.45)' }}>
                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', minHeight: '150px', boxSizing: 'border-box' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: '700', color: '#403d39' }}>
                      <i className="ri-map-pin-line" style={{ fontSize: '15px' }}>
                      </i>
                      <span className="sc-interp">{v.q.place}</span>
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: '900', color: '#8a857b' }}>
                      <span className="sc-interp">{v.q.count}</span>
                    </div>
                  </div>
                  {v.asking ? (
                    <>
                      <div style={{ fontSize: '26px', fontWeight: '900', letterSpacing: '-.025em' }}>
                        {content.card.question}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button data-pts="3" onClick={v.ansYes} style={{ height: '48px', padding: '0 20px', borderRadius: '24px', border: '0', background: '#386641', color: '#fff', font: '900 15px Lato,sans-serif', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px', transition: 'transform .15s ease,background .2s' }} className="scpcyes scpcpress">
                          <i className="ri-check-line">
                          </i>
                          {content.card.yes}
                        </button>
                        <button data-pts="3" onClick={v.ansNo} style={{ height: '48px', padding: '0 20px', borderRadius: '24px', border: '1.5px solid rgba(37,36,34,.16)', background: '#fff', color: '#252422', font: '900 15px Lato,sans-serif', cursor: 'pointer', transition: 'transform .15s ease,border-color .2s' }} className="scpcno scpcpress">
                          {content.card.no}
                        </button>
                        <button onClick={v.ansSkip} style={{ height: '48px', padding: '0 16px', borderRadius: '24px', border: '0', background: 'none', color: '#403d39', font: '700 15px Lato,sans-serif', cursor: 'pointer' }}>
                          {content.card.notSure}
                        </button>
                      </div>
                    </>
                  ) : null}
                  {v.thanks ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '96px' }}>
                        <span style={{ flex: 'none', width: '44px', height: '44px', borderRadius: '22px', background: '#e4eed4', color: '#386641', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>
                          <i className="ri-check-double-line">
                          </i>
                        </span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <div style={{ fontSize: '18px', fontWeight: '900' }}>
                            <span className="sc-interp">{v.thanksTitle}</span>
                          </div>
                          <div style={{ fontSize: '14px', color: '#403d39' }}>
                            {content.card.thanksNote}
                          </div>
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
                <div style={{ borderTop: '1px solid rgba(37,36,34,.08)' }}>
                  {v.acts.map((a, i) => (
                    <React.Fragment key={i}>
                      <button data-pts={a.pts} onClick={a.go} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', minHeight: '54px', padding: '8px 20px', border: '0', borderBottom: '1px solid rgba(37,36,34,.06)', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', transition: 'background .2s' }} className="scpcrow">
                        <span style={{ flex: 'none', width: '34px', height: '34px', borderRadius: '17px', background: a.bg, color: a.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '17px' }}>
                          <i className={a.icon}>
                          </i>
                        </span>
                        <span style={{ flex: '1', fontSize: '16px', fontWeight: '700', color: '#252422' }}>
                          <span className="sc-interp">{a.label}</span>
                        </span>
                        <span style={{ flex: 'none', height: '30px', minWidth: '52px', padding: '0 10px', borderRadius: '15px', background: '#e4eed4', color: '#386641', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '2px', fontSize: '15px', fontWeight: '900' }}>
                          <i className="ri-add-line" style={{ fontSize: '14px' }}>
                          </i>
                          <span className="sc-interp">{a.pts}</span>
                        </span>
                      </button>
                    </React.Fragment>
                  ))}
                </div>
                <div style={{ padding: '18px 20px 20px', display: 'flex', flexDirection: 'column', gap: '12px', background: '#f3f1ec' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <div style={{ fontSize: '12px', fontWeight: '900', letterSpacing: '.06em', color: '#8a857b' }}>
                        {content.card.standingLabel}
                      </div>
                      <div style={{ fontSize: '19px', fontWeight: '900' }}>
                        <span className="sc-interp">{v.tierName}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                      <span ref={v.ptsRef} style={{ display: 'inline-block', fontSize: '30px', fontWeight: '900', letterSpacing: '-.03em', color: '#386641' }}>
                        <span className="sc-interp">{v.pts}</span>
                      </span>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#403d39' }}>
                        {content.card.pointsUnit}
                      </span>
                    </div>
                  </div>
                  <div style={{ position: 'relative', height: '28px' }}>
                    <div style={{ position: 'absolute', left: '0', right: '0', top: '12px', height: '5px', borderRadius: '3px', background: 'rgba(37,36,34,.1)' }}>
                    </div>
                    <div style={{ position: 'absolute', left: '0', top: '12px', height: '5px', borderRadius: '3px', background: '#4f772d', width: v.barPct, transition: 'width .6s cubic-bezier(.2,.8,.2,1)' }}>
                    </div>
                    {v.nodes.map((n, i) => (
                      <React.Fragment key={i}>
                        <div style={{ position: 'absolute', top: '6px', left: n.left, width: '17px', height: '17px', marginLeft: '-8px', borderRadius: '9px', background: n.bg, border: `2px solid ${n.bd}`, boxSizing: 'border-box', transition: 'background .4s,border-color .4s,transform .4s', transform: `scale(${n.sc})` }}>
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                    {v.nodes.map((n, i) => (
                      <React.Fragment key={i}>
                        <span style={{ height: '28px', padding: '0 10px', borderRadius: '14px', background: n.cbg, color: n.cfg, display: 'inline-flex', alignItems: 'center', fontSize: '13px', fontWeight: '900', transition: 'background .4s,color .4s' }}>
                          <span className="sc-interp">{n.label}</span>
                        </span>
                      </React.Fragment>
                    ))}
                  </div>
                  <div style={{ fontSize: '14px', lineHeight: '1.4', color: '#403d39' }}>
                    <span className="sc-interp">{v.hint}</span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                <a href="#contribute" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '16px', fontWeight: '900', color: '#fff' }}>
                  {content.links.howItWorks}
                  <i className="ri-arrow-right-s-line">
                  </i>
                </a>
                {v.canReset ? (
                  <>
                    <button onClick={v.reset} style={{ border: '0', background: 'none', color: '#d7e5c0', font: '700 14px Lato,sans-serif', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '0' }}>
                      <i className="ri-restart-line">
                      </i>
                      {content.links.startOver}
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
    );
  }
}
export default ContributorsSection;
