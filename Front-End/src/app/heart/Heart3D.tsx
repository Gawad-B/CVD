import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Heart, Loader2 } from "lucide-react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { cn } from "../ui";
import { beatPeriod, cardiacCycle, clampBpm, normalizeRisk, riskParams, type HeartRisk } from "./cardiacCycle";
import { RISK_TONE } from "./riskTone";

export interface Heart3DProps {
  risk: HeartRisk;
  /** Beats per minute; the beat period is 60/bpm (changes apply from the next beat). */
  bpm: number;
  /** True when `bpm` is a recorded patient measurement (changes the accessible description). */
  measured?: boolean;
  className?: string;
}

type Status = "loading" | "ready" | "unavailable";

const MODEL_URL = `${import.meta.env.BASE_URL}models/heart.glb`;
const EASE = 2.5; // per second, tint/droop/target easing between risks

function disposeObject(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((m) => {
      if (!m) return;
      Object.values(m).forEach((v) => {
        if (v && (v as THREE.Texture).isTexture) (v as THREE.Texture).dispose();
      });
      m.dispose();
    });
  });
}

/**
 * Realistic 3D heart whose beat, colour and posture reflect the risk level. Port of the design's
 * `heart3d.js`. Default-export so it can be `React.lazy`-loaded (keeps three out of the main bundles).
 */
export default function Heart3D({ risk: riskProp, bpm: bpmProp, measured = false, className }: Heart3DProps) {
  const risk = normalizeRisk(riskProp);
  const bpm = clampBpm(bpmProp);
  const hostRef = useRef<HTMLDivElement>(null);
  // Latest props, read by the render loop without restarting the scene.
  const live = useRef({ risk, bpm });
  useLayoutEffect(() => {
    live.current = { risk, bpm };
  }, [risk, bpm]);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let raf = 0;
    let renderer: THREE.WebGLRenderer | null = null;
    let controls: OrbitControls | null = null;
    let ro: ResizeObserver | null = null;
    let model: THREE.Object3D | null = null;

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setStatus("unavailable");
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.cssText = "width:100%;height:100%;display:block;cursor:grab;touch-action:none";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xd6dcea, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(2, 3, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xbcd0ff, 1.2);
    rim.position.set(-3, 1, -3);
    scene.add(rim);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.enableDamping = true;
    const pivot = new THREE.Group();
    scene.add(pivot);

    camera.position.set(0, 0.1, 4.6);
    controls.target.set(0, 0, 0);
    controls.update();

    const resize = () => {
      if (!renderer) return;
      const w = host.clientWidth || 300;
      const h = host.clientHeight || 300;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(resize);
      ro.observe(host);
    }
    resize();

    const teardown = () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      controls?.dispose();
      if (model) disposeObject(model);
      if (renderer) {
        renderer.forceContextLoss();
        renderer.dispose();
        renderer.domElement.remove();
      }
    };

    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load(
      MODEL_URL,
      (gltf) => {
        if (disposed || !renderer || !controls) {
          disposeObject(gltf.scene);
          return;
        }
        model = gltf.scene;
        // auto-centre and scale to 2 units
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const s = 2 / Math.max(size.x, size.y, size.z);
        model.scale.setScalar(s);
        model.position.copy(center.multiplyScalar(-s));
        pivot.add(model);

        const mats: Array<{ m: THREE.Material & { color: THREE.Color }; base: THREE.Color }> = [];
        model.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => {
            const mc = m as THREE.Material & { color?: THREE.Color };
            if (mc.color) mats.push({ m: mc as THREE.Material & { color: THREE.Color }, base: mc.color.clone() });
          });
        });

        const targets: Record<HeartRisk, THREE.Color> = {
          low: new THREE.Color(riskParams("low").target),
          medium: new THREE.Color(riskParams("medium").target),
          high: new THREE.Color(riskParams("high").target),
          unknown: new THREE.Color(riskParams("unknown").target),
        };
        const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
        const tgt = new THREE.Color(0xffffff);
        const tmp = new THREE.Color();
        const clock = new THREE.Clock();
        const first = riskParams(live.current.risk);
        let tint = first.tint;
        let droop = 0;
        let beatT = 0;
        let cur = beatPeriod(live.current.bpm);

        setStatus("ready");
        const loop = () => {
          if (disposed || !renderer || !controls) return;
          const dt = Math.min(clock.getDelta(), 0.05);
          const { risk: r, bpm: rate } = live.current;
          const b = riskParams(r);
          const k = Math.min(1, dt * EASE);
          tint += (b.tint - tint) * k;
          droop += (b.droop - droop) * k;
          tgt.lerp(targets[r], k);
          let c = 0;
          if (!reduce) {
            beatT += dt;
            if (beatT > cur) {
              beatT -= cur;
              // bpm changes take effect smoothly here, at the next beat
              const period = beatPeriod(rate);
              cur = period;
            }
            c = cardiacCycle(beatT / cur) * b.depth;
            pivot.rotation.y += dt * b.spin;
          }
          const flush = 1 + c * 0.12 * (1 - tint);
          mats.forEach(({ m, base }) => {
            tmp.copy(base).lerp(tgt, tint).multiplyScalar(flush);
            m.color.copy(tmp);
          });
          // ventricles squeeze inward and shorten toward the base, with a slight wringing twist
          pivot.scale.set(1 - 0.075 * c, 1 - 0.045 * c, 1 - 0.075 * c);
          pivot.position.y = -droop + 0.04 * c;
          pivot.rotation.z = droop * 0.6;
          pivot.rotation.x = -0.05 * c;
          controls.update();
          renderer.render(scene, camera);
          raf = requestAnimationFrame(loop);
        };
        loop();
      },
      undefined,
      () => {
        if (disposed) return;
        setStatus("unavailable");
      },
    );

    return teardown;
  }, []);

  const tone = RISK_TONE[risk];
  const ariaLabel = measured
    ? `3D heart illustration, ${risk} risk; beat rate from measured ${Math.round(bpm)} bpm`
    : `3D heart illustration, ${risk} risk — not patient data`;

  return (
    <div
      ref={hostRef}
      className={cn("relative h-full min-h-[300px] w-full", className)}
      aria-busy={status === "loading"}
      {...(status === "ready"
        ? { role: "img", "aria-label": ariaLabel }
        : {})}
    >
      {status === "loading" && (
        <div
          role="status"
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-[12.5px] font-semibold text-[#5b6b85]"
        >
          <Loader2 className="size-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          Loading 3D heart…
        </div>
      )}
      {status === "unavailable" && (
        <div
          role="status"
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[13px] font-semibold text-[#5b6b85]"
        >
          <Heart className="size-16" style={{ color: tone.color }} fill={tone.color} fillOpacity={0.15} aria-hidden="true" />
          3D view unavailable
        </div>
      )}
    </div>
  );
}
