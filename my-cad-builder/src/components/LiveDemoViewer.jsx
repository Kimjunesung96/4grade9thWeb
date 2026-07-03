import React, { useMemo, useRef, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stage, PivotControls } from '@react-three/drei';
import * as THREE from 'three';
import { FLOOR_COLORS } from '../utils/cadUtils';

const MATERIAL_COLORS = {
  Concrete: '#95a5a6', Wood: '#d35400', Steel: '#2c3e50',
  Glass: '#3498db', Default: '#bdc3c7'
};

function VoxelBlocks({ blocks }) {
  return (
    <group>
      {blocks.map((block, index) => {
        const isGlass = block.mat === 'Glass';
        return (
          <mesh key={index} position={[block.x, block.y, block.z]}>
            <boxGeometry args={[3, 3, 3]} />
            <meshStandardMaterial
              color={block.color || MATERIAL_COLORS[block.mat] || MATERIAL_COLORS.Default}
              transparent={isGlass}
              opacity={isGlass ? 0.6 : 1}
              roughness={isGlass ? 0.1 : 0.8}
            />
          </mesh>
        );
      })}
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
// LINE 141 ~ 144: 버튼 클릭 등으로 외부에서 rotationQuat이 바뀔 때 기즈모 컴포넌트가 이를 완벽히 반영하도록 수정합니다.
function FixedCornerGizmo({ rotationQuat, onRotationChange }) {
  const lastEmitted = useRef(rotationQuat);
  const [gizmoKey, setGizmoKey] = useState(0);

  useEffect(() => {
    const prev = lastEmitted.current;
    const isSelfEmitted = prev && rotationQuat.every((v, i) => Math.abs(v - prev[i]) < 1e-6);
    
    // 자기 자신이 드래그한 게 아니라 버튼 클릭 등으로 값이 외부에서 바뀐 경우라면 
    // 기즈모의 내부 matrix 청소를 위해 리마운트를 트리거하고 동기화합니다.
    if (!isSelfEmitted) {
      lastEmitted.current = rotationQuat;
      setGizmoKey(k => k + 1);
    }
  }, [rotationQuat]);

  // 🌟 진짜 원인: PivotControls는 우리가 잡은 자식 <group>의 matrix를 절대 건드리지 않는다.
  //    회전은 PivotControls 내부에 감춰진 wrapper 오브젝트에 적용되기 때문에,
  //    innerRef.current.matrix를 읽으면 항상 identity(회전 없음)만 나온다.
  //    → 대신 PivotControls가 드래그하는 동안 실시간으로 넘겨주는 실제 로컬 변환행렬(l)을 그대로 써야 한다.
  const handleDrag = (l) => {
    if (!onRotationChange) return;
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    l.decompose(pos, q, scl);
    const next = [q.x, q.y, q.z, q.w];
    lastEmitted.current = next; // 🌟 내가 emit한 값이라고 표시 → 위 useEffect에서 리마운트 안 되게
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
        // 🌟 미니 캔버스는 항상 원점(0,0,0)을 중심으로 보여줘서 절대 안 흔들림 (중심 고정)
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
              // 🌟 리마운트된 직후(또는 최초 마운트) 바로 현재 rotationQuat 값으로 세팅
              //    (이후 드래그 중 실제 회전은 handleDrag가 받는 l 행렬로만 처리하므로
              //     이 그룹의 matrix/quaternion을 직접 읽을 필요가 없다)
              if (el) el.quaternion.set(...rotationQuat);
            }}
          >
            {/* 회전 방향을 눈으로 알 수 있게 작은 박스 + 화살표 모양 참조 오브젝트 */}
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
      // 🌟 백엔드(main.py의 mesh_to_blocks)에서 이미 앞뒤 방향을 보정해서 내려주므로
      //    여기서 화면용으로 다시 뒤집지 않음 — 미리보기와 실제 CSV가 항상 일치하게 함.
      blocks = data;
    }

    if (blocks.length > maxBlocks) {
      return blocks.slice(0, maxBlocks);
    }
    return blocks;
  }, [grid, data, maxBlocks]);

  // 🌟 블록 묶음의 실제 중심 (회전 피벗으로 사용)
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

      {/* 🌟 화면에 고정된 우측 상단 회전 기즈모 — 본체와 별도 캔버스라 카메라를 돌려도 절대 안 움직임 */}
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