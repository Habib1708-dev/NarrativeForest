import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useControls } from "leva";
import {
  Color,
  CylinderGeometry,
  MeshBasicMaterial,
  Object3D,
  StaticDrawUsage,
  Vector3,
} from "three";

const DATA_URL = "/statistical_data/worldcities_mapped.json";
const UP = new Vector3(0, 1, 0);

export default function Earth2PopulationBars({ radius = 2 }) {
  const meshRef = useRef(null);
  const [dataset, setDataset] = useState(null);

  const controls = useControls("Earth2 / Population Bars", {
    enabled: { value: true, label: "Enabled" },
    scale: { value: 0.12, min: 0.02, max: 0.4, step: 0.005, label: "Scale" },
    thickness: {
      value: 0.0035,
      min: 0.0008,
      max: 0.02,
      step: 0.0002,
      label: "Thickness",
    },
    color: { value: "#ffbf00", label: "Color" },
  });

  const geometry = useMemo(() => {
    const geo = new CylinderGeometry(1, 1, 1, 5, 1, false);
    geo.translate(0, 0.5, 0);
    return geo;
  }, []);

  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        color: new Color("#ffbf00"),
        toneMapped: false,
      }),
    []
  );

  useEffect(() => {
    let cancelled = false;

    fetch(DATA_URL)
      .then((response) => response.json())
      .then((json) => {
        if (!cancelled) setDataset(json);
      })
      .catch((error) => {
        console.error("Failed to load mapped city population data", error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  useEffect(() => {
    material.color.set(controls.color);
  }, [controls.color, material]);

  const instanceData = useMemo(() => {
    if (!dataset?.cities?.length) return null;

    const logMin = Math.log10(dataset.minPopulation || 150000);
    const logMax = Math.log10(dataset.maxPopulation || 1);

    return dataset.cities.map(([, x, y, z, population]) => {
      const logPop = Math.log10(Math.max(population, 1));
      const normalized = (logPop - logMin) / Math.max(logMax - logMin, 0.0001);
      const height = (0.18 + Math.max(0, normalized) * 0.82) * controls.scale;
      return { x, y, z, height };
    });
  }, [controls.scale, dataset]);

  useLayoutEffect(() => {
    if (!meshRef.current || !instanceData) return;

    const mesh = meshRef.current;
    const dummy = new Object3D();
    const normal = new Vector3();

    mesh.instanceMatrix.setUsage(StaticDrawUsage);

    for (let i = 0; i < instanceData.length; i++) {
      const entry = instanceData[i];
      normal.set(entry.x, entry.y, entry.z).normalize();

      dummy.position.copy(normal).multiplyScalar(radius);
      dummy.quaternion.setFromUnitVectors(UP, normal);
      dummy.scale.set(controls.thickness, entry.height, controls.thickness);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [controls.thickness, instanceData, radius]);

  if (!instanceData?.length) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, instanceData.length]}
      visible={controls.enabled}
      frustumCulled={false}
      raycast={() => null}
    />
  );
}
