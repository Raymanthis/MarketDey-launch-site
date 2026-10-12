'use client';
/* eslint-disable */
import React from 'react';
import ImageSlot from '@/components/shared/ImageSlot';
import content from '@/content/audiences.json';

const c = content;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = t => t * t * (3 - 2 * t);
const LABELS = content.rail.labels;
class AudiencesSection extends React.Component {
  state = { si: 0, pp: [0, 0, 0] };
  rootRef = React.createRef(); stageRef = React.createRef(); railRef = React.createRef();
  p = 0; cur = 0; mx = 0; my = 0; tmx = 0; tmy = 0;
  componentDidMount() {
    this.onScroll = () => this.measure(); window.addEventListener('scroll', this.onScroll, { passive: true }); window.addEventListener('resize', this.onScroll);
    this.measure(); this.cur = this.p;
    const loop = () => { if (this.dead) return; this.raf = requestAnimationFrame(loop); this.tick(); }; this.raf = requestAnimationFrame(loop);
  }
  componentWillUnmount() { this.dead = true; cancelAnimationFrame(this.raf); window.removeEventListener('scroll', this.onScroll); window.removeEventListener('resize', this.onScroll); }
  measure() {
    const el = this.rootRef.current; if (!el) return; const vh = window.innerHeight, r = el.getBoundingClientRect();
    this.p = clamp(-r.top / Math.max(1, r.height - vh), 0, 1); this.vis = r.top < vh && r.bottom > 0;
    const si = Math.min(2, Math.floor(this.p * 3)), pp = [0, 1, 2].map(i => Math.round(clamp(this.p * 3 - i, 0, 1) * 40) / 40);
    const s = this.state; if (s.si !== si || pp.some((v, i) => v !== s.pp[i])) this.setState({ si, pp });
  }
  tick() {
    if (!this.vis) return; const st = this.stageRef.current; if (!st) return;
    this.cur += (this.p - this.cur) * 0.12; this.mx += (this.tmx - this.mx) * 0.06; this.my += (this.tmy - this.my) * 0.06;
    st.style.setProperty('--mx', this.mx.toFixed(3)); st.style.setProperty('--my', this.my.toFixed(3));
    const p = this.cur, vh = window.innerHeight;
    const ss = (x0, x1, v) => ease(clamp((v - x0) / (x1 - x0), 0, 1));
    const rl = this.railRef.current; if (rl) rl.style.opacity = (1 - ss(0.94, 0.995, p)).toFixed(3);
    st.querySelectorAll('[data-ch]').forEach(ch => {
      const i = +ch.getAttribute('data-ch'), ue = p * 3 - i, u = clamp(ue, 0, 1);
      const bgIn = i === 0 ? 1 : ss(-0.06, 0.08, ue), bgOut = i === 2 ? 0 : ss(0.9, 1.02, ue), bo = bgIn * (1 - bgOut);
      const bg = ch.querySelector('[data-bg]'); if (bg) { bg.style.opacity = bo.toFixed(3); const im = bg.firstElementChild; if (im) im.style.translate = '0 ' + ((0.25 - u) * vh * 0.08).toFixed(1) + 'px'; bg.style.visibility = bo < 0.002 ? 'hidden' : 'visible'; }
      const tIn = i === 0 ? 1 : ss(0, 0.12, ue), tOut = i === 2 ? 0 : ss(0.86, 0.98, ue), op = tIn * (1 - tOut), bl = (1 - tIn) * 22 + tOut * 22, tx = ch.querySelector('[data-tx]');
      if (tx) { tx.style.transform = 'none'; tx.style.filter = bl > 0.2 ? 'blur(' + bl.toFixed(1) + 'px)' : 'none'; tx.style.opacity = op.toFixed(3); tx.style.visibility = op < 0.002 ? 'hidden' : 'visible'; tx.style.pointerEvents = op > 0.5 ? 'auto' : 'none'; }
      ch.querySelectorAll('[data-det]').forEach((d, k) => { const sp = k ? 1.5 : 1, y = (0.45 - ue) * vh * 1.25 * sp; d.style.transform = 'translate3d(0,' + y.toFixed(1) + 'px,0)'; d.style.opacity = '1'; d.style.filter = 'none'; d.style.visibility = Math.abs(y) > vh * 1.6 ? 'hidden' : 'visible'; });
      ch.querySelectorAll('[data-mv]').forEach(d => { const sp = +d.getAttribute('data-sp') / 2.4, c = i === 2 ? 0.55 : 0.96, y = (c - ue) * vh * 3.4 * sp; d.style.transform = 'translate3d(0,' + y.toFixed(1) + 'px,0)'; d.style.visibility = Math.abs(y) > vh * 1.5 ? 'hidden' : 'visible'; });
    });
  }
  goTo(i) { const el = this.rootRef.current; if (!el) return; const top = el.getBoundingClientRect().top + window.scrollY, span = el.offsetHeight - window.innerHeight; window.scrollTo({ top: top + span * [0.4, 1.5, 2.5][i] / 3, behavior: 'smooth' }); }
  renderVals() {
    const si = this.state.si;
    return {
      rootRef: this.rootRef, stageRef: this.stageRef, railRef: this.railRef,
      onMove: e => { const r = e.currentTarget.getBoundingClientRect(); this.tmx = (e.clientX - r.left) / r.width - 0.5; this.tmy = (e.clientY - r.top) / r.height - 0.5; },
      tabs: LABELS.map((label, i) => ({ label, pct: (this.state.pp[i] * 100) + '%', fg: i === si ? '#252422' : 'rgba(37,36,34,.45)', lop: i === si ? 1 : 0, go: () => this.goTo(i) }))
    };
  }
  render() {
    const v = { ...this.props, ...this.renderVals() };
    return (
      <div className="sc-host" data-sc-name="Audiences Section">
        <div ref={v.rootRef} data-screen-label="02 Who it's for" style={{position:"relative",height:"500vh",background:"#faf9f6",fontFamily:"'Lato',ui-sans-serif,system-ui,sans-serif",color:"#252422"}}>
          <div ref={v.stageRef} onPointerMove={v.onMove} style={{position:"sticky",top:"0",height:"100vh",overflow:"hidden","--mx":"0","--my":"0"}}>
            <div data-ch="0" style={{position:"absolute",inset:"0",pointerEvents:"none"}}>
              <div data-bg="1" style={{position:"absolute",inset:"0",opacity:"0",willChange:"opacity,transform"}}>
                <div style={{position:"absolute",inset:"-6%",transform:"translate3d(calc(var(--mx) * -14px),calc(var(--my) * -10px),0)",pointerEvents:"auto"}}><ImageSlot id={c.commuters.slots.bg.id} shape="rect" placeholder={c.commuters.slots.bg.placeholder} src={c.commuters.slots.bg.src} alt={c.commuters.slots.bg.alt} /></div>
                <div style={{position:"absolute",inset:"0",background:"linear-gradient(90deg,rgba(250,249,246,.97) 0%,rgba(250,249,246,.86) 38%,rgba(250,249,246,.15) 72%,rgba(250,249,246,0) 100%),linear-gradient(0deg,rgba(250,249,246,.9) 0%,rgba(250,249,246,0) 36%),linear-gradient(180deg,#faf9f6 0%,rgba(250,249,246,0) 22%)"}}></div>
              </div>
              <div data-det="1" data-sp="1" style={{position:"absolute",right:"clamp(176px,14vw,240px)",top:"12vh",width:"clamp(170px,20vw,300px)",aspectRatio:"4/5",willChange:"transform"}}>
                <div style={{position:"absolute",inset:"0",transform:"translate3d(calc(var(--mx) * 22px),calc(var(--my) * 16px),0) rotate(3deg)",borderRadius:"22px",overflow:"hidden",boxShadow:"0 40px 80px -34px rgba(37,36,34,.55)",border:"6px solid #fff",pointerEvents:"auto"}}><ImageSlot id={c.commuters.slots.detail.id} shape="rect" placeholder={c.commuters.slots.detail.placeholder} src={c.commuters.slots.detail.src} alt={c.commuters.slots.detail.alt} /></div>
              </div>
              <div data-det="1" data-sp="1.55" style={{position:"absolute",right:"clamp(250px,25vw,420px)",top:"58vh",width:"clamp(140px,15vw,230px)",aspectRatio:"4/3",willChange:"transform"}}>
                <div style={{position:"absolute",inset:"0",transform:"translate3d(calc(var(--mx) * 34px),calc(var(--my) * 24px),0) rotate(-4deg)",borderRadius:"18px",overflow:"hidden",boxShadow:"0 30px 60px -28px rgba(37,36,34,.5)",border:"5px solid #fff",pointerEvents:"auto"}}><ImageSlot id={c.commuters.slots.detail2.id} shape="rect" placeholder={c.commuters.slots.detail2.placeholder} src={c.commuters.slots.detail2.src} alt={c.commuters.slots.detail2.alt} /></div>
              </div>
              <div data-mv="1" data-sp="1.9" style={{position:"absolute",left:"clamp(10px,2vw,28px)",top:"24vh",width:"clamp(84px,9vw,132px)",aspectRatio:"3/4",willChange:"transform"}}><div style={{position:"absolute",inset:"0",transform:"translate3d(calc(var(--mx) * 12px),calc(var(--my) * 10px),0) rotate(6deg)",borderRadius:"14px",overflow:"hidden",boxShadow:"0 22px 44px -22px rgba(37,36,34,.45)",border:"4px solid #fff",pointerEvents:"auto"}}><ImageSlot id={c.commuters.slots.m1.id} shape="rect" placeholder={c.commuters.slots.m1.placeholder} src={c.commuters.slots.m1.src} alt={c.commuters.slots.m1.alt} /></div></div>
              <div data-mv="1" data-sp="2.4" style={{position:"absolute",left:"clamp(130px,30vw,440px)",top:"74vh",width:"clamp(76px,7.5vw,112px)",aspectRatio:"1/1",willChange:"transform"}}><div style={{position:"absolute",inset:"0",transform:"translate3d(calc(var(--mx) * 20px),calc(var(--my) * 16px),0) rotate(-5deg)",borderRadius:"14px",overflow:"hidden",boxShadow:"0 22px 44px -22px rgba(37,36,34,.45)",border:"4px solid #fff",pointerEvents:"auto"}}><ImageSlot id={c.commuters.slots.m2.id} shape="rect" placeholder={c.commuters.slots.m2.placeholder} src={c.commuters.slots.m2.src} alt={c.commuters.slots.m2.alt} /></div></div>
              <div data-mv="1" data-sp="2.9" style={{position:"absolute",left:"clamp(60px,14vw,220px)",top:"-6vh",width:"clamp(70px,7vw,104px)",aspectRatio:"4/5",willChange:"transform"}}><div style={{position:"absolute",inset:"0",transform:"translate3d(calc(var(--mx) * 28px),calc(var(--my) * 22px),0) rotate(4deg)",borderRadius:"14px",overflow:"hidden",boxShadow:"0 22px 44px -22px rgba(37,36,34,.45)",border:"4px solid #fff",pointerEvents:"auto"}}><ImageSlot id={c.commuters.slots.m3.id} shape="rect" placeholder={c.commuters.slots.m3.placeholder} src={c.commuters.slots.m3.src} alt={c.commuters.slots.m3.alt} /></div></div>
              <div data-tx="1" style={{position:"absolute",left:"0",right:"0",top:"50%",transformOrigin:"20% 50%",opacity:"0",willChange:"transform,opacity,filter"}}>
                <div style={{maxWidth:"1200px",margin:"0 auto",padding:"0 32px",display:"flex",flexDirection:"column",gap:"20px",transform:"translateY(-50%)"}}>
                  <div style={{display:"flex",alignItems:"center",gap:"14px"}}><span style={{fontSize:"14px",fontWeight:"900",letterSpacing:".12em",color:"#4f772d"}}>{c.commuters.number}</span><span style={{width:"48px",height:"2px",background:"#4f772d"}}></span><span style={{fontSize:"14px",fontWeight:"900",letterSpacing:".12em"}}>{c.commuters.label}</span></div>
                  <h2 style={{margin:"0",maxWidth:"min(760px,54vw)",fontSize:"clamp(44px,6.6vw,100px)",fontWeight:"900",letterSpacing:"-.045em",lineHeight:".94",textWrap:"balance"}}>{c.commuters.heading}</h2>
                  <div style={{display:"flex",gap:"28px",alignItems:"flex-end",flexWrap:"wrap",maxWidth:"min(760px,54vw)"}}><div style={{maxWidth:"440px",fontSize:"clamp(16px,1.4vw,19px)",lineHeight:"1.5",color:"#403d39",textWrap:"pretty"}}>{c.commuters.body}</div><div style={{display:"flex",gap:"12px",alignItems:"center",padding:"12px 16px 12px 12px",borderRadius:"18px",background:"#fff",border:"1px solid rgba(37,36,34,.08)",boxShadow:"0 24px 48px -24px rgba(37,36,34,.35)"}}><span style={{flex:"none",width:"38px",height:"38px",borderRadius:"19px",background:"rgba(217,150,43,.18)",color:"#8a5a0b",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"18px"}}><i className="ri-notification-3-line"></i></span><div style={{display:"flex",flexDirection:"column",gap:"2px"}}><div style={{fontSize:"14px",fontWeight:"900"}}>{c.commuters.card.title}</div><div style={{fontSize:"13px",color:"#403d39"}}>{c.commuters.card.text}</div></div></div></div>
                </div>
              </div>
            </div>
            <div data-ch="1" style={{position:"absolute",inset:"0",pointerEvents:"none"}}>
              <div data-bg="1" style={{position:"absolute",inset:"0",opacity:"0",willChange:"opacity,transform"}}>
                <div style={{position:"absolute",inset:"-6%",transform:"translate3d(calc(var(--mx) * -14px),calc(var(--my) * -10px),0)",pointerEvents:"auto"}}><ImageSlot id={c.shoppers.slots.bg.id} shape="rect" placeholder={c.shoppers.slots.bg.placeholder} src={c.shoppers.slots.bg.src} alt={c.shoppers.slots.bg.alt} /></div>
                <div style={{position:"absolute",inset:"0",background:"linear-gradient(270deg,rgba(250,249,246,.97) 0%,rgba(250,249,246,.86) 38%,rgba(250,249,246,.15) 72%,rgba(250,249,246,0) 100%),linear-gradient(0deg,rgba(250,249,246,.9) 0%,rgba(250,249,246,0) 36%),linear-gradient(180deg,#faf9f6 0%,rgba(250,249,246,0) 22%)"}}></div>
              </div>
              <div data-det="1" data-sp="1" style={{position:"absolute",left:"clamp(176px,14vw,240px)",top:"12vh",width:"clamp(170px,20vw,300px)",aspectRatio:"4/5",willChange:"transform"}}>
                <div style={{position:"absolute",inset:"0",transform:"translate3d(calc(var(--mx) * 22px),calc(var(--my) * 16px),0) rotate(-3deg)",borderRadius:"22px",overflow:"hidden",boxShadow:"0 40px 80px -34px rgba(37,36,34,.55)",border:"6px solid #fff",pointerEvents:"auto"}}><ImageSlot id={c.shoppers.slots.detail.id} shape="rect" placeholder={c.shoppers.slots.detail.placeholder} src={c.shoppers.slots.detail.src} alt={c.shoppers.slots.detail.alt} /></div>
              </div>
              <div data-det="1" data-sp="1.55" style={{position:"absolute",left:"clamp(24px,4vw,64px)",top:"52vh",width:"clamp(140px,15vw,230px)",aspectRatio:"4/3",willChange:"transform"}}>
                <div style={{position:"absolute",inset:"0",transform:"translate3d(calc(var(--mx) * 34px),calc(var(--my) * 24px),0) rotate(4deg)",borderRadius:"18px",overflow:"hidden",boxShadow:"0 30px 60px -28px rgba(37,36,34,.5)",border:"5px solid #fff",pointerEvents:"auto"}}><ImageSlot id={c.shoppers.slots.detail2.id} shape="rect" placeholder={c.shoppers.slots.detail2.placeholder} src={c.shoppers.slots.detail2.src} alt={c.shoppers.slots.detail2.alt} /></div>
              </div>
              <div data-mv="1" data-sp="1.9" style={{position:"absolute",right:"clamp(180px,17vw,260px)",top:"24vh",width:"clamp(84px,9vw,132px)",aspectRatio:"3/4",willChange:"transform"}}><div style={{position:"absolute",inset:"0",transform:"translate3d(calc(var(--mx) * 12px),calc(var(--my) * 10px),0) rotate(6deg)",borderRadius:"14px",overflow:"hidden",boxShadow:"0 22px 44px -22px rgba(37,36,34,.45)",border:"4px solid #fff",pointerEvents:"auto"}}><ImageSlot id={c.shoppers.slots.m1.id} shape="rect" placeholder={c.shoppers.slots.m1.placeholder} src={c.shoppers.slots.m1.src} alt={c.shoppers.slots.m1.alt} /></div></div>
              <div data-mv="1" data-sp="2.4" style={{position:"absolute",right:"clamp(130px,30vw,440px)",top:"74vh",width:"clamp(76px,7.5vw,112px)",aspectRatio:"1/1",willChange:"transform"}}><div style={{position:"absolute",inset:"0",transform:"translate3d(calc(var(--mx) * 20px),calc(var(--my) * 16px),0) rotate(-5deg)",borderRadius:"14px",overflow:"hidden",boxShadow:"0 22px 44px -22px rgba(37,36,34,.45)",border:"4px solid #fff",pointerEvents:"auto"}}><ImageSlot id={c.shoppers.slots.m2.id} shape="rect" placeholder={c.shoppers.slots.m2.placeholder} src={c.shoppers.slots.m2.src} alt={c.shoppers.slots.m2.alt} /></div></div>
              <div data-mv="1" data-sp="2.9" style={{position:"absolute",right:"clamp(60px,14vw,220px)",top:"-6vh",width:"clamp(70px,7vw,104px)",aspectRatio:"4/5",willChange:"transform"}}><div style={{position:"absolute",inset:"0",transform:"translate3d(calc(var(--mx) * 28px),calc(var(--my) * 22px),0) rotate(4deg)",borderRadius:"14px",overflow:"hidden",boxShadow:"0 22px 44px -22px rgba(37,36,34,.45)",border:"4px solid #fff",pointerEvents:"auto"}}><ImageSlot id={c.shoppers.slots.m3.id} shape="rect" placeholder={c.shoppers.slots.m3.placeholder} src={c.shoppers.slots.m3.src} alt={c.shoppers.slots.m3.alt} /></div></div>
              <div data-tx="1" style={{position:"absolute",left:"0",right:"0",top:"50%",transformOrigin:"80% 50%",opacity:"0",willChange:"transform,opacity,filter"}}>
                <div style={{maxWidth:"1200px",margin:"0 auto",padding:"0 32px",display:"flex",flexDirection:"column",gap:"20px",alignItems:"flex-end",textAlign:"right",transform:"translateY(-50%)"}}>
                  <div style={{display:"flex",alignItems:"center",gap:"14px"}}><span style={{fontSize:"14px",fontWeight:"900",letterSpacing:".12em"}}>{c.shoppers.label}</span><span style={{width:"48px",height:"2px",background:"#4f772d"}}></span><span style={{fontSize:"14px",fontWeight:"900",letterSpacing:".12em",color:"#4f772d"}}>{c.shoppers.number}</span></div>
                  <h2 style={{margin:"0",maxWidth:"min(760px,54vw)",fontSize:"clamp(44px,6.6vw,100px)",fontWeight:"900",letterSpacing:"-.045em",lineHeight:".94",textWrap:"balance"}}>{c.shoppers.heading}</h2>
                  <div style={{display:"flex",gap:"28px",alignItems:"flex-end",flexWrap:"wrap",justifyContent:"flex-end",maxWidth:"min(760px,54vw)"}}><div style={{display:"flex",gap:"12px",alignItems:"center",padding:"10px 16px 10px 10px",borderRadius:"18px",background:"#fff",border:"1px solid rgba(37,36,34,.08)",textAlign:"left",boxShadow:"0 24px 48px -24px rgba(37,36,34,.35)"}}><div style={{flex:"none",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",width:"46px",height:"50px",borderRadius:"12px",background:"#4f772d",color:"#fff"}}><div style={{fontSize:"10px",fontWeight:"900",letterSpacing:".06em",color:"#d7e5c0"}}>{c.shoppers.card.dow}</div><div style={{fontSize:"20px",fontWeight:"900",lineHeight:"1.1"}}>{c.shoppers.card.day}</div></div><div style={{display:"flex",flexDirection:"column",gap:"2px"}}><div style={{fontSize:"15px",fontWeight:"900"}}>{c.shoppers.card.title}</div><div style={{fontSize:"13px",color:"#403d39"}}>{c.shoppers.card.text}</div></div></div><div style={{maxWidth:"440px",fontSize:"clamp(16px,1.4vw,19px)",lineHeight:"1.5",color:"#403d39",textWrap:"pretty"}}>{c.shoppers.body}</div></div>
                </div>
              </div>
            </div>
            <div data-ch="2" style={{position:"absolute",inset:"0",pointerEvents:"none"}}>
              <div data-bg="1" style={{position:"absolute",inset:"0",opacity:"0",willChange:"opacity,transform"}}>
                <div style={{position:"absolute",inset:"-6%",transform:"translate3d(calc(var(--mx) * -14px),calc(var(--my) * -10px),0)",pointerEvents:"auto"}}><ImageSlot id={c.seekers.slots.bg.id} shape="rect" placeholder={c.seekers.slots.bg.placeholder} src={c.seekers.slots.bg.src} alt={c.seekers.slots.bg.alt} /></div>
                <div style={{position:"absolute",inset:"0",background:"linear-gradient(90deg,rgba(250,249,246,.97) 0%,rgba(250,249,246,.86) 38%,rgba(250,249,246,.15) 72%,rgba(250,249,246,0) 100%),linear-gradient(0deg,rgba(250,249,246,.9) 0%,rgba(250,249,246,0) 36%),linear-gradient(180deg,#faf9f6 0%,rgba(250,249,246,0) 22%)"}}></div>
              </div>
              <div data-det="1" data-sp="1" style={{position:"absolute",right:"clamp(176px,14vw,240px)",top:"12vh",width:"clamp(170px,20vw,300px)",aspectRatio:"4/5",willChange:"transform"}}>
                <div style={{position:"absolute",inset:"0",transform:"translate3d(calc(var(--mx) * 22px),calc(var(--my) * 16px),0) rotate(3deg)",borderRadius:"22px",overflow:"hidden",boxShadow:"0 40px 80px -34px rgba(37,36,34,.55)",border:"6px solid #fff",pointerEvents:"auto"}}><ImageSlot id={c.seekers.slots.detail.id} shape="rect" placeholder={c.seekers.slots.detail.placeholder} src={c.seekers.slots.detail.src} alt={c.seekers.slots.detail.alt} /></div>
              </div>
              <div data-det="1" data-sp="1.55" style={{position:"absolute",right:"clamp(250px,25vw,420px)",top:"58vh",width:"clamp(140px,15vw,230px)",aspectRatio:"4/3",willChange:"transform"}}>
                <div style={{position:"absolute",inset:"0",transform:"translate3d(calc(var(--mx) * 34px),calc(var(--my) * 24px),0) rotate(-4deg)",borderRadius:"18px",overflow:"hidden",boxShadow:"0 30px 60px -28px rgba(37,36,34,.5)",border:"5px solid #fff",pointerEvents:"auto"}}><ImageSlot id={c.seekers.slots.detail2.id} shape="rect" placeholder={c.seekers.slots.detail2.placeholder} src={c.seekers.slots.detail2.src} alt={c.seekers.slots.detail2.alt} /></div>
              </div>
              <div data-mv="1" data-sp="1.9" style={{position:"absolute",left:"clamp(10px,2vw,28px)",top:"24vh",width:"clamp(84px,9vw,132px)",aspectRatio:"3/4",willChange:"transform"}}><div style={{position:"absolute",inset:"0",transform:"translate3d(calc(var(--mx) * 12px),calc(var(--my) * 10px),0) rotate(6deg)",borderRadius:"14px",overflow:"hidden",boxShadow:"0 22px 44px -22px rgba(37,36,34,.45)",border:"4px solid #fff",pointerEvents:"auto"}}><ImageSlot id={c.seekers.slots.m1.id} shape="rect" placeholder={c.seekers.slots.m1.placeholder} src={c.seekers.slots.m1.src} alt={c.seekers.slots.m1.alt} /></div></div>
              <div data-mv="1" data-sp="2.4" style={{position:"absolute",left:"clamp(130px,30vw,440px)",top:"74vh",width:"clamp(76px,7.5vw,112px)",aspectRatio:"1/1",willChange:"transform"}}><div style={{position:"absolute",inset:"0",transform:"translate3d(calc(var(--mx) * 20px),calc(var(--my) * 16px),0) rotate(-5deg)",borderRadius:"14px",overflow:"hidden",boxShadow:"0 22px 44px -22px rgba(37,36,34,.45)",border:"4px solid #fff",pointerEvents:"auto"}}><ImageSlot id={c.seekers.slots.m2.id} shape="rect" placeholder={c.seekers.slots.m2.placeholder} src={c.seekers.slots.m2.src} alt={c.seekers.slots.m2.alt} /></div></div>
              <div data-mv="1" data-sp="2.9" style={{position:"absolute",left:"clamp(60px,14vw,220px)",top:"-6vh",width:"clamp(70px,7vw,104px)",aspectRatio:"4/5",willChange:"transform"}}><div style={{position:"absolute",inset:"0",transform:"translate3d(calc(var(--mx) * 28px),calc(var(--my) * 22px),0) rotate(4deg)",borderRadius:"14px",overflow:"hidden",boxShadow:"0 22px 44px -22px rgba(37,36,34,.45)",border:"4px solid #fff",pointerEvents:"auto"}}><ImageSlot id={c.seekers.slots.m3.id} shape="rect" placeholder={c.seekers.slots.m3.placeholder} src={c.seekers.slots.m3.src} alt={c.seekers.slots.m3.alt} /></div></div>
              <div data-tx="1" style={{position:"absolute",left:"0",right:"0",top:"50%",transformOrigin:"20% 50%",opacity:"0",willChange:"transform,opacity,filter"}}>
                <div style={{maxWidth:"1200px",margin:"0 auto",padding:"0 32px",display:"flex",flexDirection:"column",gap:"20px",transform:"translateY(-50%)"}}>
                  <div style={{display:"flex",alignItems:"center",gap:"14px"}}><span style={{fontSize:"14px",fontWeight:"900",letterSpacing:".12em",color:"#4f772d"}}>{c.seekers.number}</span><span style={{width:"48px",height:"2px",background:"#4f772d"}}></span><span style={{fontSize:"14px",fontWeight:"900",letterSpacing:".12em"}}>{c.seekers.label}</span></div>
                  <h2 style={{margin:"0",maxWidth:"min(760px,54vw)",fontSize:"clamp(44px,6.6vw,100px)",fontWeight:"900",letterSpacing:"-.045em",lineHeight:".94",textWrap:"balance"}}>{c.seekers.heading}</h2>
                  <div style={{display:"flex",gap:"28px",alignItems:"flex-end",flexWrap:"wrap",maxWidth:"min(760px,54vw)"}}><div style={{maxWidth:"440px",fontSize:"clamp(16px,1.4vw,19px)",lineHeight:"1.5",color:"#403d39",textWrap:"pretty"}}>{c.seekers.body}</div><div style={{display:"flex",gap:"12px",alignItems:"center",padding:"10px 16px 10px 10px",borderRadius:"18px",background:"#fff",border:"1px solid rgba(37,36,34,.08)",boxShadow:"0 24px 48px -24px rgba(37,36,34,.35)"}}><div style={{flex:"none",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",width:"46px",height:"50px",borderRadius:"12px",background:"#e4eed4"}}><div style={{fontSize:"10px",fontWeight:"900",letterSpacing:".06em",color:"#386641"}}>{c.seekers.card.dow}</div><div style={{fontSize:"20px",fontWeight:"900",lineHeight:"1.1"}}>{c.seekers.card.day}</div></div><div style={{display:"flex",flexDirection:"column",gap:"2px"}}><div style={{fontSize:"15px",fontWeight:"900"}}>{c.seekers.card.title}</div><div style={{fontSize:"13px",color:"#403d39"}}>{c.seekers.card.text}</div></div></div></div>
                </div>
              </div>
            </div>
            <div ref={v.railRef} style={{position:"absolute",right:"clamp(14px,2.4vw,36px)",top:"50%",transform:"translateY(-50%)",zIndex:"3",transition:"opacity .4s",display:"flex",flexDirection:"column",gap:"18px"}}>
              {v.tabs.map((t, i) => <React.Fragment key={i}>
                <button onClick={t.go} style={{display:"flex",alignItems:"center",gap:"10px",justifyContent:"flex-end",padding:"0",border:"0",background:"none",cursor:"pointer",color:t.fg,font:"900 12px Lato,sans-serif",letterSpacing:".1em",transition:"color .3s"}}>
                  <span style={{opacity:`${t.lop}`,transition:"opacity .3s",whiteSpace:"nowrap"}}>{t.label}</span>
                  <span style={{position:"relative",width:"3px",height:"44px",borderRadius:"2px",background:"rgba(37,36,34,.14)",overflow:"hidden"}}><span style={{position:"absolute",left:"0",top:"0",width:"100%",height:t.pct,background:"#4f772d"}}></span></span>
                </button>
              </React.Fragment>)}
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default AudiencesSection;
