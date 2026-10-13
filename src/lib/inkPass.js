// Real-time ink lines for the live street model (LandmarksJourneySection, ?ride=model).
//
// After the scene's flat fills are drawn to the canvas, render() draws the same scene again into
// an off-screen target with view-space normals (flat, from screen derivatives, so the model needs
// no normal attribute) and a 32-bit depth texture, then composites ink lines over the canvas with
// one full-screen pass:
//   - depth: second difference of 1/z (1/z is linear across a plane, so planes give zero however
//     grazing they are); only the nearer side of a jump is inked, so silhouettes and convex
//     creases come out one line wide.
//   - normals: angle between a pixel and its neighbours (creases, concave corners).
// Lines fade with the scene's linear fog like the fills do.
// Figure-only mode (?ride=hybrid): occluders (o.occMask) are drawn first, depth only, then the
// inked meshes (normalMask) with alpha 1; the composite keeps only lines on inked pixels, so the
// figures are outlined and hidden by buildings, but the buildings (drawn as line art) are not. Line width is given in render-target
// texels (the caller converts ~1.4 CSS px with its effective pixel ratio).
// Pure module: three is passed in (the section imports it lazily). No allocations per frame.

const VERT = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const FRAG = `
uniform sampler2D tN;
uniform sampler2D tD;
uniform vec2 texel;
uniform float cn, cf, fogN, fogF, strength, offD, offN, figOnly, nLo;
uniform vec3 ink;
varying vec2 vUv;
float iz(vec2 uv) { return 1.0 / cn - texture2D(tD, uv).x * (1.0 / cn - 1.0 / cf); }
vec3 nrm(vec2 uv) { return texture2D(tN, uv).xyz * 2.0 - 1.0; }
float nEdge(vec3 n, vec2 uv) {
  // background neighbours do not count: silhouettes are drawn by the depth term, one-sided
  if (texture2D(tD, uv).x >= 1.0) return 0.0;
  return 1.0 - dot(n, nrm(uv));
}
void main() {
  float d0 = texture2D(tD, vUv).x;
  if (d0 >= 1.0) discard;
  if (figOnly > 0.5 && texture2D(tN, vUv).a < 0.5) discard;
  float c = iz(vUv);
  vec2 dx = vec2(texel.x * offD, 0.0), dy = vec2(0.0, texel.y * offD);
  float lx = 2.0 * c - iz(vUv - dx) - iz(vUv + dx);
  float ly = 2.0 * c - iz(vUv - dy) - iz(vUv + dy);
  float de = max(max(lx, ly), 0.0) / c;
  float eD = smoothstep(0.006, 0.02, de);
  vec3 n = nrm(vUv);
  vec2 nx = vec2(texel.x * offN, 0.0), ny = vec2(0.0, texel.y * offN);
  float ne = max(max(nEdge(n, vUv - nx), nEdge(n, vUv + nx)), max(nEdge(n, vUv - ny), nEdge(n, vUv + ny)));
  float eN = smoothstep(nLo, nLo + 0.23, ne);
  float z = 1.0 / c;
  float fog = clamp((z - fogN) / (fogF - fogN), 0.0, 1.0);
  float a = max(eD, eN) * strength * (1.0 - fog);
  if (a < 0.004) discard;
  gl_FragColor = vec4(ink, a);
}`;

export function makeInkPass(THREE, renderer, inkHex) {
  const depthTexture = new THREE.DepthTexture(1, 1, THREE.FloatType);
  const rt = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false, depthBuffer: true, depthTexture });
  const normalMat = new THREE.MeshNormalMaterial({ flatShading: true, side: THREE.DoubleSide });
  const occMat = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
  // the composite writes display (sRGB) values as-is, so the ink colour stays in sRGB
  const inkV = [1, 3, 5].map(i => parseInt(inkHex.slice(i, i + 2), 16) / 255);
  const uniforms = {
    tN: { value: rt.texture }, tD: { value: depthTexture }, texel: { value: new THREE.Vector2(1, 1) },
    cn: { value: 0.1 }, cf: { value: 700 }, fogN: { value: 60 }, fogF: { value: 290 }, strength: { value: 1 },
    offD: { value: 2 }, offN: { value: 1 }, figOnly: { value: 0 }, nLo: { value: 0.22 }, ink: { value: new THREE.Vector3(inkV[0], inkV[1], inkV[2]) }
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthTest: false, depthWrite: false });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); quad.frustumCulled = false;
  const quadScene = new THREE.Scene(); quadScene.add(quad);
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const clearN = new THREE.Color(0.5, 0.5, 1), prevClear = new THREE.Color();
  return {
    rt,
    setSize(w, h) { rt.setSize(w, h); uniforms.texel.value.set(1 / w, 1 / h); },
    // Normal/depth pass of `scene` through `camera` with camera.layers.mask = normalMask, then the
    // composite over whatever is on the canvas. strength 0 skips both.
    render(scene, camera, normalMask, o) {
      if (o.strength <= 0.002) return;
      const bg = scene.background, ov = scene.overrideMaterial, mask = camera.layers.mask, ac = renderer.autoClear, ca = renderer.getClearAlpha();
      renderer.getClearColor(prevClear);
      scene.background = null; scene.overrideMaterial = normalMat; camera.layers.mask = normalMask;
      const fig = o.occMask !== undefined && o.occMask !== null;
      renderer.setRenderTarget(rt); renderer.setClearColor(clearN, fig ? 0 : 1); renderer.autoClear = true;
      if (fig) { scene.overrideMaterial = occMat; camera.layers.mask = o.occMask; renderer.render(scene, camera); renderer.autoClear = false; scene.overrideMaterial = normalMat; camera.layers.mask = normalMask; }
      renderer.render(scene, camera);
      renderer.setRenderTarget(null); renderer.setClearColor(prevClear, ca);
      scene.background = bg; scene.overrideMaterial = ov; camera.layers.mask = mask;
      uniforms.cn.value = camera.near; uniforms.cf.value = camera.far; uniforms.fogN.value = o.fogNear; uniforms.fogF.value = o.fogFar;
      uniforms.strength.value = o.strength; uniforms.offD.value = o.offD; uniforms.offN.value = o.offN; uniforms.figOnly.value = fig ? 1 : 0; uniforms.nLo.value = fig ? 0.32 : 0.22; // figures: rounder shapes, fewer facet lines
      renderer.autoClear = false; renderer.render(quadScene, quadCam); renderer.autoClear = ac;
    },
    dispose() { rt.dispose(); depthTexture.dispose(); normalMat.dispose(); occMat.dispose(); mat.dispose(); quad.geometry.dispose(); }
  };
}
