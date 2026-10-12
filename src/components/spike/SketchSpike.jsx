'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const PAPER = '#f7f5ef';
const INK = '#2a2823';
// class order matches lines.json "classes": structure, detail, fine
const WIDTH = [2.0, 1.25, 0.75];
const OPACITY = [0.95, 0.8, 0.55];

// Shared GLSL: cheap 3D value noise.
const NOISE_GLSL = /* glsl */ `
float skHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float skNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(skHash(i), skHash(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(skHash(i + vec3(0.0, 1.0, 0.0)), skHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(skHash(i + vec3(0.0, 0.0, 1.0)), skHash(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(skHash(i + vec3(0.0, 1.0, 1.0)), skHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}
`;

function patchMaterial(mat, dpr) {
  mat.userData.sk = {
    sketchDpr: { value: dpr },
    sketchPaper: { value: new THREE.Color(PAPER) },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, mat.userData.sk);
    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        `uniform float sketchDpr;
varying float vSkDepth;
varying vec3 vSkWorld;
${NOISE_GLSL}
void main() {`
      )
      .replace(
        'offset *= linewidth;',
        `float skSelDepth = max( - ( position.y < 0.5 ? start.z : end.z ), 0.0 );
        vec3 skWorld = ( modelMatrix * vec4( position.y < 0.5 ? instanceStart : instanceEnd, 1.0 ) ).xyz;
        float skF = clamp( 1.0 - ( skSelDepth - 8.0 ) / 180.0, 0.35, 1.0 );
        float skWob = ( skNoise( skWorld * 0.15 ) - 0.5 ) * 1.2 * sketchDpr;
        // perpendicular (to the line) unit vector, same convention as the stock offset
        vec2 skPerp = vec2( dir.y / aspect, - dir.x * aspect );
        offset *= linewidth * skF;
        offset += skPerp * skWob;
        vSkDepth = skSelDepth;
        vSkWorld = skWorld;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `uniform vec3 sketchPaper;
varying float vSkDepth;
varying vec3 vSkWorld;
${NOISE_GLSL}
void main() {`
      )
      .replace(
        'gl_FragColor = vec4( diffuseColor.rgb, alpha );',
        `float skFade = 1.0 - smoothstep( 60.0, 290.0, vSkDepth );
        float skPress = 0.85 + 0.3 * skNoise( vSkWorld * 0.05 );
        gl_FragColor = vec4( mix( sketchPaper, diffuseColor.rgb, skFade ), alpha * skFade * skPress );`
      );
  };
  mat.customProgramCacheKey = () => 'sketch-spike-line-v1';
}

export default function SketchSpike({ src = 'spike', stats = false }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const statsRef = useRef(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const statsEl = statsRef.current;
    if (!wrap || !canvas) return undefined;

    const base = `/media/${src}`;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let disposed = false;
    let raf = 0;
    let dirty = true;
    let camData = null;
    let loaded = false;
    let lastScroll = -1;
    let lastSize = '';
    let lastRenderAt = 0;
    const frameTimes = [];
    const counts = [0, 0, 0];
    const t0 = performance.now();
    let tFirstLines = null;
    let tLoaded = null;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(new THREE.Color(PAPER), 1);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.Fog(PAPER, 60, 290);
    const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 700);
    const materials = [];
    const geometries = [];
    const fillMats = [];
    let fillRoot = null;

    const progress = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max <= 0) return 0;
      const rect = wrap.getBoundingClientRect();
      const total = wrap.offsetHeight - window.innerHeight;
      const p = total > 0 ? -rect.top / total : 0;
      return Math.min(1, Math.max(0, p));
    };

    const resize = () => {
      const w = Math.max(1, wrap.clientWidth);
      const h = Math.max(1, window.innerHeight);
      renderer.setSize(w, h, false);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      for (const m of materials) m.resolution.set(w * dpr, h * dpr);
      dirty = true;
    };

    const placeCamera = (p) => {
      if (!camData) return;
      const f = camData.frames;
      const x = p * (f.length - 1);
      const i = Math.min(f.length - 2, Math.floor(x));
      const t = f.length < 2 ? 0 : x - i;
      const a = f[Math.max(0, i)];
      const b = f[Math.min(f.length - 1, i + 1)];
      camera.position.set(
        a.pos[0] + (b.pos[0] - a.pos[0]) * t,
        a.pos[1] + (b.pos[1] - a.pos[1]) * t,
        a.pos[2] + (b.pos[2] - a.pos[2]) * t
      );
      camera.lookAt(
        a.target[0] + (b.target[0] - a.target[0]) * t,
        a.target[1] + (b.target[1] - a.target[1]) * t,
        a.target[2] + (b.target[2] - a.target[2]) * t
      );
    };

    const updateStats = (last) => {
      if (!statsEl) return;
      const avg = frameTimes.reduce((s, v) => s + v, 0) / (frameTimes.length || 1);
      statsEl.textContent =
        `structure ${counts[0]}\ndetail ${counts[1]}\nfine ${counts[2]}\n` +
        `last ${last.toFixed(1)} ms\navg ${avg.toFixed(1)} ms (n=${frameTimes.length})\n` +
        `dpr ${dpr}` +
        (tFirstLines != null ? `\nfirst lines ${tFirstLines.toFixed(0)} ms` : '') +
        (tLoaded != null ? `\nloaded ${tLoaded.toFixed(0)} ms` : '');
    };

    const draw = () => {
      raf = 0;
      if (disposed) return;
      const p = progress();
      const size = `${wrap.clientWidth}x${window.innerHeight}`;
      if (size !== lastSize) {
        lastSize = size;
        resize();
      }
      if (!dirty && p === lastScroll) return;
      dirty = false;
      lastScroll = p;
      const start = performance.now();
      placeCamera(p);
      renderer.render(scene, camera);
      const end = performance.now();
      if (loaded && tFirstLines == null) tFirstLines = end - t0;
      // frame ms = interval between consecutive renders while scrolling; the render's own
      // CPU time if the previous render was a while ago (idle gap).
      const gap = start - lastRenderAt;
      const ms = lastRenderAt && gap < 250 ? end - lastRenderAt : end - start;
      lastRenderAt = end;
      frameTimes.push(ms);
      if (frameTimes.length > 120) frameTimes.shift();
      if (stats) {
        window.__sketchSpike = { frameTimes, counts, tFirstLines, tLoaded, dpr };
        updateStats(ms);
      }
    };

    const request = () => {
      if (!raf && !disposed) raf = requestAnimationFrame(draw);
    };
    const onScroll = () => request();
    const onResize = () => {
      dirty = true;
      request();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    resize();
    request();

    const load = async () => {
      const [meta, cam, binBuf] = await Promise.all([
        fetch(`${base}/lines.json`).then((r) => {
          if (!r.ok) throw new Error(`lines.json ${r.status}`);
          return r.json();
        }),
        fetch(`${base}/camera.json`).then((r) => {
          if (!r.ok) throw new Error(`camera.json ${r.status}`);
          return r.json();
        }),
        fetch(`${base}/lines.bin`).then((r) => {
          if (!r.ok) throw new Error(`lines.bin ${r.status}`);
          return r.arrayBuffer();
        }),
      ]);
      if (disposed) return;
      camData = cam;
      camera.fov = cam.fov;
      camera.updateProjectionMatrix();

      // dequantise per docs/plans/sketch-spike-format.md
      const { count, stride, min, max } = meta;
      const dv = new DataView(binBuf);
      const perClass = meta.classes.map(() => []);
      const scale = [0, 1, 2].map((i) => (max[i] - min[i]) / 65535);
      for (let k = 0; k < count; k++) {
        const o = k * stride;
        const cls = dv.getUint8(o + 12);
        const arr = perClass[cls];
        for (let i = 0; i < 6; i++) {
          const ax = i % 3;
          arr.push(min[ax] + (dv.getInt16(o + i * 2, true) + 32768) * scale[ax]);
        }
      }
      perClass.forEach((arr, ci) => {
        counts[ci] = arr.length / 6;
        if (!arr.length) return;
        const geo = new LineSegmentsGeometry();
        geo.setPositions(new Float32Array(arr));
        const mat = new LineMaterial({
          color: new THREE.Color(INK),
          linewidth: (WIDTH[ci] ?? 1) * dpr,
          transparent: true,
          opacity: OPACITY[ci] ?? 0.8,
          depthWrite: false,
          worldUnits: false,
        });
        patchMaterial(mat, dpr);
        mat.resolution.set(wrap.clientWidth * dpr, window.innerHeight * dpr);
        const obj = new LineSegments2(geo, mat);
        obj.frustumCulled = false;
        obj.renderOrder = 1;
        scene.add(obj);
        geometries.push(geo);
        materials.push(mat);
      });
      loaded = true;
      tLoaded = performance.now() - t0;
      dirty = true;
      request();

      // optional occluder fills
      try {
        const r = await fetch(`${base}/fills.glb`);
        const ct = r.headers.get('content-type') || '';
        if (!r.ok || ct.includes('text/html')) return;
        const glb = await r.arrayBuffer();
        if (disposed) return;
        new GLTFLoader().parse(
          glb,
          '',
          (gltf) => {
            if (disposed) return;
            gltf.scene.traverse((o) => {
              if (o.isMesh) {
                const m = new THREE.MeshBasicMaterial({
                  color: PAPER,
                  polygonOffset: true,
                  polygonOffsetFactor: 1,
                  polygonOffsetUnits: 1,
                });
                o.material = m;
                o.renderOrder = 0;
                fillMats.push(m);
              }
            });
            fillRoot = gltf.scene;
            scene.add(fillRoot);
            dirty = true;
            request();
          },
          () => {}
        );
      } catch {
        /* no fills for this set */
      }
    };
    load().catch((e) => {
      console.warn('SketchSpike load failed', e);
    });

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      fillMats.forEach((m) => m.dispose());
      if (fillRoot) {
        fillRoot.traverse((o) => o.geometry && o.geometry.dispose());
        scene.remove(fillRoot);
      }
      renderer.dispose();
      if (stats) delete window.__sketchSpike;
    };
  }, [src, stats]);

  return (
    <div ref={wrapRef} style={{ position: 'relative', height: '400vh', background: PAPER }}>
      <div style={{ position: 'sticky', top: 0, height: '100vh', overflow: 'hidden', background: PAPER }}>
        <canvas ref={canvasRef} style={{ display: 'block', background: PAPER }} />
        {stats ? (
          <pre
            ref={statsRef}
            style={{
              position: 'fixed',
              top: 8,
              left: 8,
              margin: 0,
              padding: '6px 8px',
              font: '11px/1.4 ui-monospace, monospace',
              color: '#2a2823',
              background: 'rgba(247,245,239,0.85)',
              border: '1px solid #2a2823',
              zIndex: 10,
              pointerEvents: 'none',
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
