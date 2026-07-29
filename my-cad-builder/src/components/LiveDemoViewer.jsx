import React, { useMemo, useRef, useEffect, useLayoutEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stage, PivotControls } from '@react-three/drei';
import * as THREE from 'three';
import { FLOOR_COLORS } from '../utils/cadUtils';

const MATERIAL_COLORS = {
  Concrete: '#95a5a6', Wood: '#d35400', Steel: '#2c3e50',
  Glass: '#3498db', Default: '#bdc3c7'
};

// ⭐ [성능 개선] 블록 하나당 <mesh> 하나씩(수천 개) 만드는 대신,
//    THREE.InstancedMesh 하나로 전부 한 번에 그림 (드로우콜 1회).
//    유리(Glass)만 투명이라 재질 옵션이 달라서 일반/유리 두 그룹으로 나눠 처리.
function VoxelBlocks({ blocks }) {
  const solidRef = useRef();
  const glassRef = useRef();

  const { solidBlocks, glassBlocks } = useMemo(() => {
    const solid = [];
    const glass = [];
    blocks.forEach(b => (b.mat === 'Glass' ? glass : solid).push(b));
    return { solidBlocks: solid, glassBlocks: glass };
  }, [blocks]);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colorObj = useMemo(() => new THREE.Color(), []);

  useLayoutEffect(() => {
    if (solidRef.current) {
      solidBlocks.forEach((block, i) => {
        dummy.position.set(block.x, block.y, block.z);
        dummy.updateMatrix();
        solidRef.current.setMatrixAt(i, dummy.matrix);
        colorObj.set(block.color || MATERIAL_COLORS[block.mat] || MATERIAL_COLORS.Default);
        solidRef.current.setColorAt(i, colorObj);
      });
      solidRef.current.instanceMatrix.needsUpdate = true;
      if (solidRef.current.instanceColor) solidRef.current.instanceColor.needsUpdate = true;
    }
    if (glassRef.current) {
      glassBlocks.forEach((block, i) => {
        dummy.position.set(block.x, block.y, block.z);
        dummy.updateMatrix();
        glassRef.current.setMatrixAt(i, dummy.matrix);
      });
      glassRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [solidBlocks, glassBlocks, dummy, colorObj]);

  return (
    <group>
      {solidBlocks.length > 0 && (
        <instancedMesh ref={solidRef} args={[null, null, solidBlocks.length]} key={`solid-${solidBlocks.length}`}>
          <boxGeometry args={[3, 3, 3]} />
          <meshStandardMaterial roughness={0.8} />
        </instancedMesh>
      )}
      {glassBlocks.length > 0 && (
        <instancedMesh ref={glassRef} args={[null, null, glassBlocks.length]} key={`glass-${glassBlocks.length}`}>
          <boxGeometry args={[3, 3, 3]} />
          <meshStandardMaterial color={MATERIAL_COLORS.Glass} transparent opacity={0.6} roughness={0.1} />
        </instancedMesh>
      )}
    </group>
  );
}

// 🌟 블록들의 바운딩박스 중심을 계산 (회전 피벗을 여기로 잡아야 "제자리에서" 돈다)
function getBlocksCenter(blocks) {
  if (!blocks || blocks.length === 0) return [0, 0, 0];
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  blocks.forEach(b => {
    if (b.x < minX) minX = b.x; if (b.x > maxX) maxX = b.x;
    if (b.y < minY) minY = b.y; if (b.y > maxY) maxY = b.y;
    if (b.z < minZ) minZ = b.z; if (b.z > maxZ) maxZ = b.z;
  });
  return [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
}

// 🌟 본체 그룹: 바운딩박스 중심을 피벗으로 잡아서 회전 (블록 자체는 -center 만큼 안쪽 그룹에서 당겨놓고,
//    바깥 그룹을 center 위치로 옮긴 뒤 그 바깥 그룹에 회전을 적용 → 결과적으로 "제자리 회전"이 됨)
function RotatableGroup({ blocks, rotationQuat, onRotationChange, center }) {
  const groupRef = useRef();

  useEffect(() => {
    if (groupRef.current && rotationQuat) {
      groupRef.current.quaternion.set(...rotationQuat);
    }
  }, [rotationQuat]);

  // 🌟 본체 쪽에서는 더 이상 PivotControls를 직접 띄우지 않음 (우측 상단 미니 기즈모가 대신함)
  //    하지만 외부에서 onRotationChange가 호출되도록 ref는 노출 안 해도 됨 — 회전은 미니 기즈모 쪽에서만 발생.
  return (
    <group position={center}>
      <group ref={groupRef}>
        <group position={[-center[0], -center[1], -center[2]]}>
          <VoxelBlocks blocks={blocks} />
        </group>
      </group>
    </group>
  );
}

// 🌟 화면 우측 상단에 고정되는 작은 회전 기즈모 (본체와 분리된 별도의 미니 Canvas)
//    여기서 드래그하면 onRotationChange로 쿼터니언이 부모에게 전달되고, 본체 회전에도 그대로 반영됨.
function FixedCornerGizmo({ rotationQuat, onRotationChange }) {
  const lastEmitted = useRef(rotationQuat);
  const [gizmoKey, setGizmoKey] = useState(0);

  useEffect(() => {
    const prev = lastEmitted.current;
    const isSelfEmitted = prev && rotationQuat.every((v, i) => Math.abs(v - prev[i]) < 1e-6);

    if (!isSelfEmitted) {
      lastEmitted.current = rotationQuat;
      setGizmoKey(k => k + 1);
    }
  }, [rotationQuat]);

  const handleDrag = (l) => {
    if (!onRotationChange) return;
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    l.decompose(pos, q, scl);
    const next = [q.x, q.y, q.z, q.w];
    lastEmitted.current = next;
    onRotationChange(next);
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        width: 110,
        height: 110,
        zIndex: 20,
        background: 'rgba(0,0,0,0.45)',
        borderRadius: 12,
        backdropFilter: 'blur(4px)',
        pointerEvents: 'auto',
      }}
    >
      <Canvas
        orthographic
        camera={{ position: [4, 4, 4], zoom: 30, near: 0.1, far: 100 }}
      >
        <ambientLight intensity={0.9} />
        <directionalLight position={[3, 5, 3]} intensity={1.2} />
        <PivotControls
          key={gizmoKey}
          disableTranslation
          disableScaling
          anchor={[0, 0, 0]}
          depthTest={false}
          scale={45}
          fixed
          onDrag={handleDrag}
        >
          <group
            ref={(el) => {
              if (el) el.quaternion.set(...rotationQuat);
            }}
          >
            <mesh>
              <boxGeometry args={[0.9, 0.9, 0.9]} />
              <meshStandardMaterial color="#3b82f6" />
            </mesh>
            <mesh position={[0, 0.75, 0]}>
              <coneGeometry args={[0.25, 0.5, 8]} />
              <meshStandardMaterial color="#ef4444" />
            </mesh>
          </group>
        </PivotControls>
      </Canvas>
      <div style={{
        position: 'absolute', bottom: 2, left: 0, right: 0,
        textAlign: 'center', color: '#cbd5e1', fontSize: 10, fontWeight: 700,
        pointerEvents: 'none',
      }}>
        드래그: 회전
      </div>
    </div>
  );
}

export default function LiveDemoViewer({
  grid = null, data = null, mode = 'static', maxBlocks = 10000,
  rotationQuat = [0, 0, 0, 1], onRotationChange = null, enableGizmo = false
}) {

  const displayData = useMemo(() => {
    let blocks = [];

    if (grid) {
      grid.forEach((row, rIdx) => {
        row.forEach((cell, cIdx) => {
          if (cell) {
            const totalFloors = (cell >= 1 && cell <= 5) ? cell : 1;

            let hexColor = '#bdc3c7';
            if (cell >= 1 && cell <= 5) hexColor = FLOOR_COLORS[cell].hex;
            else if (cell === 9) hexColor = '#D2D2D2';

            for (let h = 1; h <= totalFloors; h++) {
              blocks.push({
                x: cIdx * 3.0,
                y: h * 3.0 - 1.5,
                z: rIdx * 3.0,
                color: hexColor,
                mat: 'Concrete'
              });
            }
          }
        });
      });
    } else if (data) {
      blocks = data;
    }

    if (blocks.length > maxBlocks) {
      return blocks.slice(0, maxBlocks);
    }
    return blocks;
  }, [grid, data, maxBlocks]);

  const center = useMemo(() => getBlocksCenter(displayData), [displayData]);

  return (
    <div className="w-full h-full min-h-[400px] bg-gray-900 rounded-2xl overflow-hidden relative shadow-inner">
      <div className="absolute top-4 left-4 z-10 bg-black/60 backdrop-blur-sm text-white px-4 py-2 rounded-xl text-sm font-bold flex flex-col gap-1">
        <span className="text-blue-400">
          {mode === 'realtime' ? '🟢 실시간 에디터 모드' : '🌐 갤러리 감상 모드'}
        </span>
        <span>
          블록 렌더링: <span className={displayData.length >= maxBlocks ? "text-red-400" : "text-green-400"}>
            {displayData.length.toLocaleString()}
          </span> / {maxBlocks.toLocaleString()} MAX
        </span>
      </div>

      <div className="absolute bottom-4 right-4 z-10 bg-black/60 backdrop-blur-sm text-gray-300 px-3 py-1 rounded-lg text-xs">
        {enableGizmo
          ? '우측 상단 미니 기즈모 드래그: 회전 | 좌클릭(빈공간): 시점회전 | 휠: 확대/축소'
          : '좌클릭: 회전 | 우클릭: 이동 | 휠: 확대/축소'}
      </div>

      {enableGizmo && (
        <FixedCornerGizmo rotationQuat={rotationQuat} onRotationChange={onRotationChange} />
      )}

      <Canvas camera={{ position: [50, 50, 50], fov: 45 }} gl={{ preserveDrawingBuffer: true }}>
        <color attach="background" args={['#0f172a']} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[20, 40, 20]} intensity={1.5} castShadow />
        <Stage environment="city" intensity={0.5} adjustCamera={true}>
          <RotatableGroup
            blocks={displayData}
            rotationQuat={rotationQuat}
            onRotationChange={onRotationChange}
            center={center}
          />
        </Stage>
        <OrbitControls makeDefault enableDamping={false} autoRotate={mode === 'static'} autoRotateSpeed={1.5} />
      </Canvas>
    </div>
  );
}