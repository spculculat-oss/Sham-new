import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  Box,
  Camera,
  ChevronDown,
  ChevronUp,
  Droplets,
  EyeOff,
  Layers,
  RotateCw,
  Sparkles,
} from 'lucide-react';
import { SupportedLanguage } from '../types/i18n';
import { FormulationState } from '../types/perfume';
import { pickArEn } from '../لغات/localize';

interface ThreePerfumeStudioProps {
  currentLang: SupportedLanguage;
  formulaTitle: string;
  batchCode: string;
  formulation: FormulationState;
}

type ElixirPreset = {
  id: string;
  nameAr: string;
  nameEn: string;
  liquidHex: number;
  metalHex: number;
  accentCss: string;
};

const ELIXIR_PRESETS: ElixirPreset[] = [
  { id: 'oud_amber', nameAr: 'عنبر وعود ملكي', nameEn: 'Royal Oud Amber', liquidHex: 0xc26d1f, metalHex: 0xd4af37, accentCss: 'bg-amber-600' },
  { id: 'taif_rose', nameAr: 'ورد طائفي ياقوتي', nameEn: 'Ruby Taif Rose', liquidHex: 0xa63a50, metalHex: 0xe6c17a, accentCss: 'bg-rose-700' },
  { id: 'neroli_mist', nameAr: 'نيرولي وبرغموت', nameEn: 'Calabrian Bergamot', liquidHex: 0x3b8a6b, metalHex: 0xd6d3d1, accentCss: 'bg-emerald-700' },
  { id: 'night_musk', nameAr: 'مسك الليل واللبان', nameEn: 'Nocturnal Frankincense', liquidHex: 0x5c4b8a, metalHex: 0xc7ccd6, accentCss: 'bg-indigo-700' },
];

type CameraPresetId = 'hero' | 'plaque' | 'crown' | 'nozzle';

const CAMERA_PRESETS: Record<CameraPresetId, { pos: [number, number, number]; target: [number, number, number] }> = {
  hero: { pos: [3.4, 2.2, 4.2], target: [0, 0.55, 0] },
  plaque: { pos: [0, 0.5, 4.4], target: [0, 0.35, 0] },
  crown: { pos: [2.1, 3.9, 2.4], target: [0, 1.35, 0] },
  nozzle: { pos: [1.5, 1.85, 1.9], target: [0, 1.25, 0] },
};

function drawPlaqueTexture(
  canvas: HTMLCanvasElement,
  title: string,
  batch: string,
  concPercent: number,
  concType: string,
  volumeMl: number,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;

  // Ivory satin background + double gold hairline border
  ctx.fillStyle = '#fcf8f0';
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = '#b4832b';
  ctx.lineWidth = 10;
  ctx.strokeRect(14, 14, w - 28, h - 28);

  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = 3;
  ctx.strokeRect(28, 28, w - 56, h - 56);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#78350f';
  ctx.font = 'bold 26px Georgia, serif';
  ctx.fillText('MAISON SHAM · ATELIER', w / 2, 82);

  ctx.fillStyle = '#1c1917';
  ctx.font = 'bold 42px Georgia, serif';
  const cleanTitle = (title || 'SHAM SIGNATURE').slice(0, 22);
  ctx.fillText(cleanTitle, w / 2, 165);

  ctx.fillStyle = '#92400e';
  ctx.fillRect(w * 0.28, 195, w * 0.44, 2);

  ctx.fillStyle = '#44403c';
  ctx.font = '600 28px monospace';
  ctx.fillText(`${concType.toUpperCase()} · ${concPercent}% · ${volumeMl} mL`, w / 2, 250);

  ctx.fillStyle = '#78716c';
  ctx.font = '500 22px monospace';
  ctx.fillText(`BATCH: ${batch || 'SHM-001'}`, w / 2, 298);
}

export const ThreePerfumeStudio: React.FC<ThreePerfumeStudioProps> = ({
  currentLang,
  formulaTitle,
  batchCode,
  formulation,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [presetId, setPresetId] = useState<string>('oud_amber');
  const [exploded, setExploded] = useState<boolean>(false);
  const [autoRotate, setAutoRotate] = useState<boolean>(true);
  const [cameraPreset, setCameraPreset] = useState<CameraPresetId>('hero');
  const [controlsCollapsed, setControlsCollapsed] = useState<boolean>(false);
  const [webglUnavailable, setWebglUnavailable] = useState<boolean>(false);

  const explodedRef = useRef(exploded);
  explodedRef.current = exploded;
  const autoRotateRef = useRef(autoRotate);
  autoRotateRef.current = autoRotate;
  const cameraPresetRef = useRef<CameraPresetId>(cameraPreset);
  const camTransitionRef = useRef<boolean>(false);

  const activePreset = useMemo(
    () => ELIXIR_PRESETS.find((p) => p.id === presetId) || ELIXIR_PRESETS[0],
    [presetId],
  );

  // References to dynamic scene objects updated on React state changes
  const dynamicRefs = useRef<{
    liquidMat?: THREE.MeshPhysicalMaterial;
    metalMat?: THREE.MeshStandardMaterial;
    plaqueCanvas?: HTMLCanvasElement;
    plaqueTex?: THREE.CanvasTexture;
    liquidMesh?: THREE.Mesh;
  }>({});

  const txt = (ar: string, en: string) => pickArEn(currentLang, ar, en);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'h' || e.key === 'H') {
        setControlsCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Update dynamic materials / CanvasTexture plaque without recreating the WebGL context
  useEffect(() => {
    const refs = dynamicRefs.current;
    if (refs.liquidMat) {
      refs.liquidMat.color.setHex(activePreset.liquidHex);
      refs.liquidMat.attenuationColor.setHex(activePreset.liquidHex);
    }
    if (refs.metalMat) {
      refs.metalMat.color.setHex(activePreset.metalHex);
    }
    if (refs.liquidMesh) {
      const fillFactor = Math.min(1.0, Math.max(0.45, 0.55 + formulation.concentrationPercent / 65));
      refs.liquidMesh.scale.y = fillFactor;
    }
    if (refs.plaqueCanvas && refs.plaqueTex) {
      drawPlaqueTexture(
        refs.plaqueCanvas,
        formulaTitle,
        batchCode,
        formulation.concentrationPercent,
        formulation.concentrationType,
        formulation.bottleVolumeMl,
      );
      refs.plaqueTex.needsUpdate = true;
    }
  }, [activePreset, formulaTitle, batchCode, formulation]);

  useEffect(() => {
    cameraPresetRef.current = cameraPreset;
    camTransitionRef.current = true;
  }, [cameraPreset]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglUnavailable(true);
      return;
    }

    const gl = renderer.getContext();
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererName = debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '') : '';
    const isSoftwareGl = /SwiftShader|llvmpipe|Software/i.test(rendererName);

    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglUnavailable(true);
    };
    const onContextRestored = () => {
      setWebglUnavailable(false);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    const scene = new THREE.Scene();
    const bgHex = 0x171412;
    scene.background = new THREE.Color(bgHex);
    scene.fog = new THREE.FogExp2(bgHex, 0.042);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(
      40,
      Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
      0.1,
      50,
    );
    camera.position.set(...CAMERA_PRESETS.hero.pos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.minDistance = 2.1;
    controls.maxDistance = 8.5;
    controls.maxPolarAngle = Math.PI * 0.56;
    controls.target.set(...CAMERA_PRESETS.hero.target);
    const stopCamTransition = () => {
      camTransitionRef.current = false;
    };
    controls.addEventListener('start', stopCamTransition);

    // Studio three-point lighting
    const keyLight = new THREE.DirectionalLight(0xfff1d6, 2.2);
    keyLight.position.set(4, 7, 4);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xfbbf24, 1.3);
    rimLight.position.set(-4.5, 4, -3.5);
    scene.add(rimLight);

    const fillLight = new THREE.HemisphereLight(0xfaf5ee, 0x292524, 0.65);
    scene.add(fillLight);

    // Shared disposal tracking
    const disposables: Array<{ dispose: () => void }> = [envTarget];

    // 1. Display Stage & Pedestal
    const stageGroup = new THREE.Group();
    const floorGeo = new THREE.CircleGeometry(7, isSoftwareGl ? 32 : 64);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.92, metalness: 0.08 });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = -0.78;
    floorMesh.receiveShadow = true;
    stageGroup.add(floorMesh);

    const plinthGeo = new THREE.CylinderGeometry(1.45, 1.6, 0.24, isSoftwareGl ? 24 : 48);
    const plinthMat = new THREE.MeshStandardMaterial({ color: 0x292524, roughness: 0.55, metalness: 0.2 });
    const plinthMesh = new THREE.Mesh(plinthGeo, plinthMat);
    plinthMesh.position.y = -0.66;
    plinthMesh.receiveShadow = true;
    plinthMesh.castShadow = true;
    stageGroup.add(plinthMesh);

    const brassTrimGeo = new THREE.TorusGeometry(1.46, 0.02, 16, 48);
    const metalMat = new THREE.MeshStandardMaterial({
      color: activePreset.metalHex,
      metalness: 0.92,
      roughness: 0.22,
    });
    const brassTrimMesh = new THREE.Mesh(brassTrimGeo, metalMat);
    brassTrimMesh.rotation.x = Math.PI / 2;
    brassTrimMesh.position.y = -0.54;
    stageGroup.add(brassTrimMesh);
    scene.add(stageGroup);

    // 2. Composite Perfume Flacon Root Group
    const flaconRoot = new THREE.Group();
    scene.add(flaconRoot);

    const latheSegments = isSoftwareGl ? 16 : 32;

    // 2a. Crystal Glass Vessel (LatheGeometry outer silhouette)
    const outerPoints = [
      new THREE.Vector2(0.0, -0.52),
      new THREE.Vector2(0.68, -0.52),
      new THREE.Vector2(0.76, -0.42),
      new THREE.Vector2(0.76, 0.72),
      new THREE.Vector2(0.62, 0.92),
      new THREE.Vector2(0.24, 0.98),
      new THREE.Vector2(0.24, 1.14),
      new THREE.Vector2(0.26, 1.16),
    ];
    const bottleGeo = new THREE.LatheGeometry(outerPoints, latheSegments);
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transmission: isSoftwareGl ? 0.6 : 0.92,
      opacity: 1,
      transparent: true,
      roughness: 0.06,
      ior: 1.52,
      thickness: 0.45,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
    });
    const bottleMesh = new THREE.Mesh(bottleGeo, glassMat);
    bottleMesh.castShadow = true;
    flaconRoot.add(bottleMesh);

    // 2b. Heavy Crystal Punt Base
    const puntGeo = new THREE.CylinderGeometry(0.64, 0.6, 0.2, latheSegments);
    const puntMat = new THREE.MeshPhysicalMaterial({
      color: 0xf5efe6,
      transmission: 0.78,
      transparent: true,
      roughness: 0.1,
      ior: 1.54,
    });
    const puntMesh = new THREE.Mesh(puntGeo, puntMat);
    puntMesh.position.y = -0.39;
    flaconRoot.add(puntMesh);

    // 2c. Perfume Liquid Core
    const liquidPoints = [
      new THREE.Vector2(0.0, -0.26),
      new THREE.Vector2(0.64, -0.26),
      new THREE.Vector2(0.66, -0.18),
      new THREE.Vector2(0.66, 0.65),
      new THREE.Vector2(0.56, 0.78),
      new THREE.Vector2(0.0, 0.78),
    ];
    const liquidGeo = new THREE.LatheGeometry(liquidPoints, latheSegments);
    const liquidMat = new THREE.MeshPhysicalMaterial({
      color: activePreset.liquidHex,
      transmission: 0.55,
      transparent: true,
      opacity: 0.92,
      roughness: 0.08,
      ior: 1.38,
      attenuationColor: new THREE.Color(activePreset.liquidHex),
      attenuationDistance: 0.85,
    });
    const liquidMesh = new THREE.Mesh(liquidGeo, liquidMat);
    flaconRoot.add(liquidMesh);

    // 2d. Dynamic CanvasTexture Label Plaque (front face)
    const plaqueCanvas = document.createElement('canvas');
    plaqueCanvas.width = 512;
    plaqueCanvas.height = 360;
    drawPlaqueTexture(
      plaqueCanvas,
      formulaTitle,
      batchCode,
      formulation.concentrationPercent,
      formulation.concentrationType,
      formulation.bottleVolumeMl,
    );
    const plaqueTex = new THREE.CanvasTexture(plaqueCanvas);
    plaqueTex.colorSpace = THREE.SRGBColorSpace;
    plaqueTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const plaqueGroup = new THREE.Group();
    const plaqueFrameGeo = new THREE.BoxGeometry(0.92, 0.66, 0.03);
    const plaqueFrameMesh = new THREE.Mesh(plaqueFrameGeo, metalMat);
    const plaqueFaceGeo = new THREE.PlaneGeometry(0.86, 0.6);
    const plaqueFaceMat = new THREE.MeshStandardMaterial({
      map: plaqueTex,
      roughness: 0.35,
      metalness: 0.05,
    });
    const plaqueFaceMesh = new THREE.Mesh(plaqueFaceGeo, plaqueFaceMat);
    plaqueFaceMesh.position.z = 0.017;
    plaqueGroup.add(plaqueFrameMesh, plaqueFaceMesh);
    plaqueGroup.position.set(0, 0.22, 0.77);
    flaconRoot.add(plaqueGroup);

    // 2e. Dip Tube (extending slightly diagonally inside)
    const tubeGeo = new THREE.CylinderGeometry(0.022, 0.022, 1.35, 12);
    const tubeMat = new THREE.MeshPhysicalMaterial({
      color: 0xe7e5e4,
      transparent: true,
      opacity: 0.55,
      roughness: 0.12,
    });
    const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
    tubeMesh.position.set(0.05, 0.38, 0);
    tubeMesh.rotation.z = -0.07;
    flaconRoot.add(tubeMesh);

    // 2f. Metallic Crimp Collar & Atomizer Pump Head
    const collarGroup = new THREE.Group();
    const collarMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.27, 0.22, 24),
      metalMat,
    );
    const sprayHeadMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.19, 0.2, 24),
      metalMat,
    );
    sprayHeadMesh.position.y = 0.2;

    const nozzleInsertMat = new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.4, metalness: 0.3 });
    const nozzleMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 0.05, 16),
      nozzleInsertMat,
    );
    nozzleMesh.rotation.x = Math.PI / 2;
    nozzleMesh.position.set(0, 0.21, 0.18);
    collarGroup.add(collarMesh, sprayHeadMesh, nozzleMesh);
    collarGroup.position.y = 1.15;
    flaconRoot.add(collarGroup);

    // 2g. Architectural Extruded Crown Cap
    const capGroup = new THREE.Group();
    const capShape = new THREE.Shape();
    capShape.moveTo(-0.34, -0.34);
    capShape.lineTo(0.34, -0.34);
    capShape.lineTo(0.42, 0);
    capShape.lineTo(0.34, 0.34);
    capShape.lineTo(-0.34, 0.34);
    capShape.lineTo(-0.42, 0);
    capShape.closePath();

    const capGeo = new THREE.ExtrudeGeometry(capShape, {
      depth: 0.46,
      bevelEnabled: true,
      bevelThickness: 0.05,
      bevelSize: 0.04,
      bevelSegments: 3,
    });
    capGeo.rotateX(-Math.PI / 2);
    const capMat = new THREE.MeshStandardMaterial({
      color: 0x1f1916,
      roughness: 0.26,
      metalness: 0.42,
    });
    const capBodyMesh = new THREE.Mesh(capGeo, capMat);
    capBodyMesh.castShadow = true;

    const capCrownRing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26, 0.3, 0.08, 24),
      metalMat,
    );
    capCrownRing.position.y = 0.54;
    capGroup.add(capBodyMesh, capCrownRing);
    capGroup.position.y = 1.46;
    flaconRoot.add(capGroup);

    dynamicRefs.current = { liquidMat, metalMat, plaqueCanvas, plaqueTex, liquidMesh };

    disposables.push(
      floorGeo, floorMat, plinthGeo, plinthMat, brassTrimGeo, metalMat,
      bottleGeo, glassMat, puntGeo, puntMat, liquidGeo, liquidMat,
      plaqueTex, plaqueFrameGeo, plaqueFaceGeo, plaqueFaceMat,
      tubeGeo, tubeMat, collarMesh.geometry, sprayHeadMesh.geometry,
      nozzleMesh.geometry, nozzleInsertMat, capGeo, capMat, capCrownRing.geometry,
    );

    // Responsive ResizeObserver
    const ro = new ResizeObserver(() => {
      if (!container) return;
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(container);

    // Animation loop with fixed-clamp dt + smooth MathUtils.damp transitions
    let rafId = 0;
    let lastTime = performance.now();

    const animate = (now: number) => {
      rafId = requestAnimationFrame(animate);
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      const isExploded = explodedRef.current;
      capGroup.position.y = THREE.MathUtils.damp(capGroup.position.y, isExploded ? 2.48 : 1.46, 7, dt);
      collarGroup.position.y = THREE.MathUtils.damp(collarGroup.position.y, isExploded ? 1.72 : 1.15, 7, dt);
      tubeMesh.position.y = THREE.MathUtils.damp(tubeMesh.position.y, isExploded ? 0.95 : 0.38, 7, dt);
      plaqueGroup.position.z = THREE.MathUtils.damp(plaqueGroup.position.z, isExploded ? 1.25 : 0.77, 7, dt);
      liquidMesh.position.y = THREE.MathUtils.damp(liquidMesh.position.y, isExploded ? -0.08 : 0, 7, dt);

      if (camTransitionRef.current) {
        const preset = CAMERA_PRESETS[cameraPresetRef.current];
        const targetPos = new THREE.Vector3(...preset.pos);
        const targetLook = new THREE.Vector3(...preset.target);
        camera.position.lerp(targetPos, 1 - Math.exp(-6 * dt));
        controls.target.lerp(targetLook, 1 - Math.exp(-6 * dt));
        if (camera.position.distanceTo(targetPos) < 0.02) {
          camTransitionRef.current = false;
        }
      } else if (autoRotateRef.current) {
        flaconRoot.rotation.y += dt * 0.28;
      }

      controls.update();
      renderer.render(scene, camera);
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      controls.removeEventListener('start', stopCamTransition);
      controls.dispose();
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
      for (const d of disposables) {
        try {
          d.dispose();
        } catch {
          // ignore
        }
      }
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      dynamicRefs.current = {};
    };
  }, []);

  return (
    <section className="space-y-4 animate-in fade-in">
      <div className="bg-white rounded-3xl border border-stone-200 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-stone-900 text-amber-400 flex items-center justify-center shadow-sm">
            <Box className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-black text-stone-900 font-serif-luxury">
              {txt('استوديو تصميم الزجاجة ثلاثي الأبعاد', '3D Crystal Flacon & Atomizer Studio')}
            </h2>
            <p className="text-xs text-stone-500">
              {txt(
                'معاينة تفاعلية بالكريستال والضوء المعملي للزجاجة الحالية، التركيز، والتفكيك الهندسي.',
                'Interactive glass-refraction inspection synced live to your bottle volume, concentration & batch ID.',
              )}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setControlsCollapsed((c) => !c)}
          className="px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold flex items-center gap-1.5 border border-stone-200 cursor-pointer self-start sm:self-auto"
          title={txt('إخفاء أو إظهار شريط التحكم (H)', 'Toggle controls (H)')}
        >
          {controlsCollapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          <span>{controlsCollapsed ? txt('إظهار التحكم', 'Show Controls') : txt('طي التحكم (H)', 'Hide Controls (H)')}</span>
        </button>
      </div>

      {/* Interactive 3D Viewport Stage */}
      <div className="relative rounded-3xl overflow-hidden border border-stone-800 bg-stone-950 shadow-2xl">
        <div ref={mountRef} className="w-full h-[520px] sm:h-[580px]" />

        {/* Fallback overlay if WebGL fails */}
        {webglUnavailable && (
          <div className="absolute inset-0 bg-stone-950/95 text-stone-200 flex flex-col items-center justify-center p-6 text-center space-y-2">
            <EyeOff className="w-8 h-8 text-amber-400" />
            <div className="font-bold text-sm">
              {txt('عرض ثلاثي الأبعاد غير مدعوم على هذا المتصفح حالياً', 'WebGL 3D context is unavailable on this browser')}
            </div>
            <p className="text-xs text-stone-400 max-w-md">
              {txt(
                'يرجى تفعيل تسريع الرسوميات في المتصفح لمعاينة الزجاجة الكريستالية وتفكيكها.',
                'Enable hardware acceleration in browser settings to inspect the 3D crystal flacon.',
              )}
            </p>
          </div>
        )}

        {/* Solid Collapsible Control Strip (no backdrop-blur over WebGL canvas) */}
        {!controlsCollapsed && !webglUnavailable && (
          <div className="bg-stone-900 border-t border-stone-800 px-4 py-3.5 text-xs text-stone-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Scent Elixir Shade */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold text-amber-400 flex items-center gap-1">
                <Droplets className="w-3.5 h-3.5" />
                <span>{txt('لون الإكسير:', 'Elixir:')}</span>
              </span>
              {ELIXIR_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPresetId(p.id)}
                  className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
                    presetId === p.id
                      ? 'bg-stone-800 border-amber-400 text-white'
                      : 'bg-stone-950 border-stone-800 text-stone-400 hover:text-white'
                  }`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full ${p.accentCss}`} />
                  <span>{currentLang === 'ar' ? p.nameAr : p.nameEn}</span>
                </button>
              ))}
            </div>

            {/* Camera & Geometry Actions */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setExploded((v) => !v)}
                className={`px-3 py-1.5 rounded-xl border text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                  exploded
                    ? 'bg-amber-600 text-white border-amber-500'
                    : 'bg-stone-950 text-stone-300 border-stone-700 hover:border-amber-500'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>{exploded ? txt('تجميع الزجاجة', 'Assemble Flacon') : txt('تفكيك هندسي', 'Exploded View')}</span>
              </button>

              <button
                type="button"
                onClick={() => setAutoRotate((v) => !v)}
                className={`px-3 py-1.5 rounded-xl border text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
                  autoRotate
                    ? 'bg-stone-800 text-amber-300 border-amber-500/60'
                    : 'bg-stone-950 text-stone-400 border-stone-700'
                }`}
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>{autoRotate ? txt('دوران تلقائي', 'Auto Orbit') : txt('تثبيت', 'Static')}</span>
              </button>

              <div className="flex items-center gap-1 bg-stone-950 border border-stone-800 rounded-xl p-1">
                <Camera className="w-3.5 h-3.5 text-stone-400 mx-1" />
                {(
                  [
                    ['hero', txt('منظور', 'Hero')],
                    ['plaque', txt('اللوحة', 'Plaque')],
                    ['crown', txt('الغطاء', 'Crown')],
                    ['nozzle', txt('البخاخ', 'Nozzle')],
                  ] as Array<[CameraPresetId, string]>
                ).map(([cid, label]) => (
                  <button
                    key={cid}
                    type="button"
                    onClick={() => setCameraPreset(cid)}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold cursor-pointer ${
                      cameraPreset === cid ? 'bg-amber-700 text-white' : 'text-stone-400 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Live Spec Footer Note */}
      <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-3.5 text-xs text-amber-950 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-semibold">
          <Sparkles className="w-4 h-4 text-amber-700" />
          <span>
            {txt(
              `الزجاجة تعرض لوحة «${formulaTitle || 'عطر شام'}» بتركيز ${formulation.concentrationPercent}% (${formulation.bottleVolumeMl} مل) من معملك الحالي.`,
              `Plaque reflects "${formulaTitle || 'Sham Signature'}" at ${formulation.concentrationPercent}% (${formulation.bottleVolumeMl} mL) from your active lab.`,
            )}
          </span>
        </span>
        <span className="text-[11px] text-amber-800">
          {txt('اسحب للتدوير أو مرر للتقريب', 'Drag to orbit · Scroll to zoom')}
        </span>
      </div>
    </section>
  );
};
