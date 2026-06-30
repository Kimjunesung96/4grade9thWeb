import React, { useMemo, useRef, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stage, PivotControls } from '@react-three/drei';
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

// 🌟 회전 가능한 그룹: rotationQuat(prop, [x,y,z,w])을 그대로 적용하고,
//    기즈모로 드래그하면 onRotationChange로 새 쿼터니언을 부모에게 알려줌
function RotatableGroup({ blocks, rotationQuat, onRotationChange, enableGizmo }) {
  const groupRef = useRef();

  // 버튼 등 외부에서 rotationQuat이 바뀌면 실제 3D 오브젝트에 반영
  useEffect(() => {
    if (groupRef.current && rotationQuat) {
      groupRef.current.quaternion.set(...rotationQuat);
    }
  }, [rotationQuat]);

  const handleDragEnd = () => {
    if (groupRef.current && onRotationChange) {
      const q = groupRef.current.quaternion;
      onRotationChange([q.x, q.y, q.z, q.w]);
    }
  };

  const content = (
    <group ref={groupRef}>
      <VoxelBlocks blocks={blocks} />
    </group>
  );

  if (!enableGizmo) return content;

  return (
    <PivotControls
      disableTranslation
      disableScaling
      anchor={[0, 0, 0]}
      depthTest={false}
      scale={60}
      onDragEnd={handleDragEnd}
    >
      {content}
    </PivotControls>
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
          ? '기즈모 드래그: 회전 | 좌클릭(빈공간): 시점회전 | 휠: 확대/축소'
          : '좌클릭: 회전 | 우클릭: 이동 | 휠: 확대/축소'}
      </div>

      <Canvas camera={{ position: [50, 50, 50], fov: 45 }}>
        <color attach="background" args={['#0f172a']} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[20, 40, 20]} intensity={1.5} castShadow />
        <Stage environment="city" intensity={0.5} adjustCamera={true}>
          <RotatableGroup
            blocks={displayData}
            rotationQuat={rotationQuat}
            onRotationChange={onRotationChange}
            enableGizmo={enableGizmo}
          />
        </Stage>
        <OrbitControls makeDefault autoRotate={mode === 'static'} autoRotateSpeed={1.5} />
      </Canvas>
    </div>
  );
}