// src/debug/RaycastClickLogger.jsx
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";

/**
 * RaycastClickLogger
 *
 * Click anywhere on the canvas: it raycasts against the provided targets
 * (or the entire scene if none provided) and logs all hits you've made so far
 * in a clean, copy-paste friendly format.
 *
 * Controls:
 *  - Left click: record a hit, log the full list
 *  - Key "L":    re-log the full list
 *  - Key "C":    clear all recorded hits
 *
 * Props:
 *  - targets?: (THREE.Object3D | React.RefObject)[]
 *      If omitted, the whole scene is used. You can pass refs (e.g. terrainRef)
 *      or object instances.
 *  - firstHitOnly?: boolean (default: true)
 *      If false, records every intersection on that click; otherwise just the closest.
 *  - decimals?: number (default: 3)
 *      Rounding for position output.
 */
export default function RaycastClickLogger({
  targets = [],
  firstHitOnly = true,
  decimals = 3,
}) {
  const { gl, camera, scene, size } = useThree();

  const raycaster = useMemo(() => {
    const rc = new THREE.Raycaster();
    rc.firstHitOnly = !!firstHitOnly;
    return rc;
  }, [firstHitOnly]);

  // Accumulated hits, persisted for the lifetime of the component
  const hitsRef = useRef([]);
  const mouse = useRef(new THREE.Vector2());

  // Utility: resolve refs or objects
  const normalizeTargets = () => {
    if (!targets || targets.length === 0) return [scene];
    const out = [];
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      const obj = t?.isObject3D ? t : t?.current;
      if (obj?.isObject3D) out.push(obj);
    }
    return out.length ? out : [scene];
  };

  // Pretty formatters
  const r = (n) => Number(n).toFixed(decimals);
  const formatVec = (v) => `(${r(v.x)}, ${r(v.y)}, ${r(v.z)})`;
  const objPath = (o) => {
    // Build a short, readable path (Root/Parent/Child) from the scene graph
    const parts = [];
    let cur = o;
    for (let i = 0; i < 4 && cur; i++) {
      parts.push(cur.name || cur.type || "Object3D");
      cur = cur.parent;
    }
    return parts.join(" ← ");
  };

  const logAll = () => {
    if (hitsRef.current.length === 0) {
      // eslint-disable-next-line no-console
      console.log("[RaycastClickLogger] No hits recorded yet.");
      return;
    }
    const lines = [];
    lines.push("=== Recorded surface hits (most recent last) ===");
    hitsRef.current.forEach((h, idx) => {
      const base = `#${String(idx + 1).padStart(2, "0")}  pos ${formatVec(
        h.point
      )}  |  dist ${r(h.distance)}  |  obj: ${h.objectName}`;
      const extra =
        h.instanceId !== undefined ? `  |  instanceId: ${h.instanceId}` : "";
      lines.push(base + extra);
    });
    lines.push("===============================================");
    // eslint-disable-next-line no-console
    console.log(lines.join("\n"));
  };

  useEffect(() => {
    const dom = gl.domElement;

    const onClick = (e) => {
      // Compute NDC from the DOM event
      const rect = dom.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      mouse.current.set(x, y);

      raycaster.setFromCamera(mouse.current, camera);
      const intersects = raycaster.intersectObjects(normalizeTargets(), true);

      if (!intersects || intersects.length === 0) {
        // eslint-disable-next-line no-console
        console.log("[RaycastClickLogger] No intersection.");
        return;
      }

      const toRecord = firstHitOnly ? [intersects[0]] : intersects;
      toRecord.forEach((hit) => {
        hitsRef.current.push({
          point: hit.point.clone(),
          distance: hit.distance,
          objectName: objPath(hit.object || {}),
          instanceId:
            typeof hit.instanceId === "number" ? hit.instanceId : undefined,
        });
      });

      // Log the whole list after this click
      logAll();
    };

    const onKey = (e) => {
      if (e.repeat) return;
      if (e.key === "l" || e.key === "L") {
        logAll();
      } else if (e.key === "c" || e.key === "C") {
        hitsRef.current.length = 0;
        // eslint-disable-next-line no-console
        console.log("[RaycastClickLogger] Cleared recorded hits.");
      }
    };

    dom.addEventListener("pointerdown", onClick, { passive: true });
    window.addEventListener("keydown", onKey);

    // UX: let raycaster know about current viewport (optional; helps precision)
    const updateRayParams = () => {
      raycaster.params = {
        ...raycaster.params,
        // You can tweak thresholds here if needed:
        // Line: { threshold: 0.1 }, Points: { threshold: 0.1 }
      };
    };
    updateRayParams();

    return () => {
      dom.removeEventListener("pointerdown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [gl, camera, scene, size, raycaster, targets, firstHitOnly]);

  return null; // helper has no visual output
}
