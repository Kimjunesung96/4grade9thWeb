import React, { useState, useRef, useMemo, useLayoutEffect, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, TransformControls } from '@react-three/drei';
import * as THREE from 'three';

// 블록 편집기: 클릭/박스/연결 선택 + 삭제 + 케이지(FFD) 변형
// props: blocks([{x,y,z,mat,color,type,raw}]), onApply(newBlocks), onClose()

const S = 3; // 블록 한 변(m)
const snap = (v) => Math.round((v - 1.5) / S) * S + 1.5;
const key = (x, y, z) => `${Math.round(x / S)},${Math.round(y / S)},${Math.round(z / S)}`;
const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

function makeCage(blocks) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  blocks.forEach(b => [b.x, b.y, b.z].forEach((v, a) => {
    min[a] = Math.min(min[a], v - S / 2);
    max[a] = Math.max(max[a], v + S / 2);
  }));
  // 코너 번호: i = ix + 2*iy + 4*iz (iy=1이 윗면)
  const c = [];
  for (let i = 0; i < 8; i++) {
    c.push([i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]]);
  }
  return { min, max, c };
}

// 트라일리니어 보간: 박스 안 비율 좌표 → 변형된 코너들의 가중합
function warp(b, cage) {
  const t = [b.x, b.y, b.z].map((v, a) => (v - cage.min[a]) / ((cage.max[a] - cage.min[a]) || 1));
  const out = [0, 0, 0];
  for (let i = 0; i < 8; i++) {
    const w = (i & 1 ? t[0] : 1 - t[0]) * (i & 2 ? t[1] : 1 - t[1]) * (i & 4 ? t[2] : 1 - t[2]);
    for (let a = 0; a < 3; a++) out[a] += w * cage.c[i][a];
  }
  return out;
}

function Blocks({ work, sel, cage, canPick, onPick }) {
  const ref = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const col = useMemo(() => new THREE.Color(), []);

  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    work.forEach((b, i) => {
      const p = cage ? warp(b, cage) : [b.x, b.y, b.z];
      dummy.position.set(p[0], p[1], p[2]);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      col.set(sel.has(i) ? '#f97316' : (b.color || '#bdc3c7'));
      m.setColorAt(i, col);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [work, sel, cage, dummy, col]);

  return (
    <instancedMesh
      ref={ref}
      key={work.length}
      args={[null, null, work.length]}
      onClick={(e) => {
        if (!canPick || e.delta > 4) return; // 카메라 드래그는 클릭으로 안 침
        e.stopPropagation();
        onPick(e.instanceId, e.shiftKey);
      }}
    >
      <boxGeometry args={[S, S, S]} />
      <meshStandardMaterial roughness={0.8} />
    </instancedMesh>
  );
}

// 박스 선택용: 각 블록을 화면 좌표로 투영해서 사각형 안에 있는지 검사 (뒤쪽 블록도 관통해서 선택)
function Bridge({ apiRef, work }) {
  const { camera, gl } = useThree();
  useEffect(() => {
    apiRef.current.pick = (r) => {
      const box = gl.domElement.getBoundingClientRect();
      const v = new THREE.Vector3();
      const hit = [];
      work.forEach((b, i) => {
        v.set(b.x, b.y, b.z).project(camera);
        const sx = ((v.x + 1) / 2) * box.width + box.left;
        const sy = ((1 - v.y) / 2) * box.height + box.top;
        if (v.z < 1 && sx >= r.x0 && sx <= r.x1 && sy >= r.y0 && sy <= r.y1) hit.push(i);
      });
      return hit;
    };
  }, [apiRef, work, camera, gl]);
  return null;
}

// 케이지 12개 모서리를 현재 코너 위치로 그림
const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
function CageLines({ cage }) {
  const geo = useMemo(() => {
    const pts = EDGES.flatMap(([a, b]) => [...cage.c[a], ...cage.c[b]]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [cage]);
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color="#38bdf8" depthTest={false} />
    </lineSegments>
  );
}

export default function BlockEditor3D({ blocks, onApply, onClose }) {
  const [work, setWork] = useState(blocks);
  const [hist, setHist] = useState([]);
  const [sel, setSel] = useState(new Set());
  const [tool, setTool] = useState('click'); // 'click' | 'box'
  const [cage, setCage] = useState(null);
  const [active, setActive] = useState(null);
  const [link, setLink] = useState(true); // 윗면 4점 같이 이동 (기울기 보정용)
  const [rotMode, setRotMode] = useState(false); // 체크하면 바닥 고정 수직축 회전 모드
  const [rotDeg, setRotDeg] = useState(0);
  const bottomCenter = useMemo(() => cage
    ? [0, 1, 2].map(a => (cage.c[0][a] + cage.c[1][a] + cage.c[4][a] + cage.c[5][a]) / 4)
    : [0, 0, 0], [cage]);
  const [rect, setRect] = useState(null);
  const apiRef = useRef({});
  const cornerRefs = useRef([]);

  const view = useMemo(() => {
    const c = makeCage(blocks);
    const ctr = c.min.map((m, a) => (m + c.max[a]) / 2);
    const size = Math.max(...c.max.map((m, a) => m - c.min[a]));
    return { ctr, pos: [ctr[0] + size * 1.2, ctr[1] + size * 0.6, ctr[2] + size * 1.2] };
  }, [blocks]);

  const commit = (next) => {
    setHist(h => [...h.slice(-19), work]);
    setWork(next);
    setSel(new Set());
  };
  const undo = () => {
    if (!hist.length) return;
    setWork(hist[hist.length - 1]);
    setHist(h => h.slice(0, -1));
    setSel(new Set());
  };

  const pick = (i, shift) => setSel(prev => {
    if (!shift) return new Set([i]);
    const n = new Set(prev);
    n.has(i) ? n.delete(i) : n.add(i);
    return n;
  });

  const grow = () => { // 선택한 블록과 붙어 있는 덩어리 전체 선택
    const idx = new Map(work.map((b, i) => [key(b.x, b.y, b.z), i]));
    const seen = new Set(sel);
    const stack = [...sel];
    while (stack.length) {
      const b = work[stack.pop()];
      for (const [dx, dy, dz] of DIRS) {
        const j = idx.get(key(b.x + dx * S, b.y + dy * S, b.z + dz * S));
        if (j !== undefined && !seen.has(j)) { seen.add(j); stack.push(j); }
      }
    }
    setSel(seen);
  };
  const invert = () => setSel(new Set(work.map((_, i) => i).filter(i => !sel.has(i))));
  const del = () => sel.size && commit(work.filter((_, i) => !sel.has(i)));

  const applyCage = () => { // 확정할 때만 격자에 스냅 (같은 칸에 겹치면 하나만 남김)
    const m = new Map();
    work.forEach(b => {
      const p = warp(b, cage);
      const x = snap(p[0]), y = snap(p[1]), z = snap(p[2]);
      const k = key(x, y, z);
      if (!m.has(k)) m.set(k, { ...b, x, y, z });
    });
    commit([...m.values()]);
    setCage(null);
    setActive(null);
  };

  const onCornerChange = () => {
    if (active === null) return;
    const p = cornerRefs.current[active].position;
    setCage(c => {
      const next = c.c.map(a => a.slice());
      const d = [p.x - next[active][0], p.y - next[active][1], p.z - next[active][2]];
      const targets = link && (active & 2) ? [2, 3, 6, 7] : [active];
      targets.forEach(i => { for (let a = 0; a < 3; a++) next[i][a] += d[a]; });
      return { ...c, c: next };
    });
  };

  // 도자기 물레처럼: 바닥(iy=0, i&2===0)은 고정하고 윗부분만 바닥 중심축으로 회전
  const rotate = (deg) => {
    setRotDeg(deg);
    const rad = (deg * Math.PI) / 180;
    const cx = bottomCenter[0], cz = bottomCenter[2];
    const cs = Math.cos(rad), sn = Math.sin(rad);
    setCage(c => {
      const next = c.c.map((p, i) => {
        if (!(i & 2)) return p.slice(); // 바닥 4점 고정
        const dx = p[0] - cx, dz = p[2] - cz;
        return [cx + dx * cs - dz * sn, p[1], cz + dx * sn + dz * cs];
      });
      return { ...c, c: next };
    });
  };

  const btn = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-700 text-white hover:bg-gray-600 disabled:opacity-40';
  const on = 'bg-blue-600 hover:bg-blue-500';

  return (
    <div className="fixed inset-0 z-50 bg-gray-900 flex flex-col">
      <div className="flex flex-wrap items-center gap-2 p-3 bg-gray-800">
        <span className="text-white font-black text-sm mr-2">블록 편집기</span>
        <button className={`${btn} ${tool === 'click' && !cage ? on : ''}`} disabled={!!cage} onClick={() => setTool('click')}>클릭 선택</button>
        <button className={`${btn} ${tool === 'box' && !cage ? on : ''}`} disabled={!!cage} onClick={() => setTool('box')}>박스 선택</button>
        <button className={btn} disabled={!sel.size || !!cage} onClick={grow}>연결된 덩어리</button>
        <button className={btn} disabled={!!cage} onClick={invert}>선택 반전</button>
        <button className={`${btn} !bg-red-600`} disabled={!sel.size || !!cage} onClick={del}>삭제</button>
        <button className={btn} disabled={!hist.length} onClick={undo}>되돌리기</button>
        <span className="w-px h-5 bg-gray-600 mx-1" />
        {!cage
          ? <button className={btn} onClick={() => { setCage(makeCage(work)); setRotMode(false); setRotDeg(0); }}>케이지 변형</button>
          : <>
              <button className={`${btn} !bg-green-600`} onClick={applyCage}>변형 확정(스냅)</button>
              <button className={btn} onClick={() => { setCage(null); setActive(null); }}>취소</button>
              <label className="text-xs text-gray-200 flex items-center gap-1">
                <input type="checkbox" checked={rotMode} onChange={e => { setRotMode(e.target.checked); setActive(null); }} /> 수직회전 모드(바닥 고정)
              </label>
              {rotMode ? (
                <>
                  <input type="range" min="-45" max="45" step="0.5" value={rotDeg}
                    onChange={e => rotate(parseFloat(e.target.value))} className="w-40" />
                  <span className="text-xs text-gray-200 w-12">{rotDeg.toFixed(1)}°</span>
                </>
              ) : (
                <label className="text-xs text-gray-200 flex items-center gap-1">
                  <input type="checkbox" checked={link} onChange={e => setLink(e.target.checked)} /> 윗면 4점 같이 이동
                </label>
              )}
            </>}
        <span className="text-xs text-gray-300 ml-2">선택 {sel.size} / 전체 {work.length}</span>
        <div className="flex-1" />
        <button className={`${btn} !bg-green-600`} disabled={!!cage} onClick={() => onApply(work)}>적용</button>
        <button className={btn} onClick={onClose}>닫기</button>
      </div>

      <div className="flex-1 relative">
        <Canvas camera={{ position: view.pos, fov: 45, near: 1, far: 5000 }}>
          <ambientLight intensity={0.7} />
          <directionalLight position={[100, 200, 100]} intensity={1.2} />
          <OrbitControls makeDefault target={view.ctr} />
          <Bridge apiRef={apiRef} work={work} />
          <Blocks work={work} sel={sel} cage={cage} canPick={tool === 'click' && !cage} onPick={pick} />
          {cage && cage.c.map((p, i) => (
            <mesh key={i} ref={el => (cornerRefs.current[i] = el)} position={p}
              onClick={(e) => { e.stopPropagation(); if (!rotMode) setActive(i); }}>
              <sphereGeometry args={[3, 16, 16]} />
              <meshBasicMaterial color={rotMode ? '#6b7280' : (active === i ? '#facc15' : '#38bdf8')} depthTest={false} />
            </mesh>
          ))}
          {cage && <CageLines cage={cage} />}
          {cage && !rotMode && active !== null && cornerRefs.current[active] && (
            <TransformControls object={cornerRefs.current[active]} mode="translate" onObjectChange={onCornerChange} />
          )}
        </Canvas>

        {tool === 'box' && !cage && (
          <div
            className="absolute inset-0 cursor-crosshair"
            onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); setRect({ x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY }); }}
            onPointerMove={e => rect && setRect({ ...rect, x1: e.clientX, y1: e.clientY })}
            onPointerUp={e => {
              if (!rect) return;
              const r = { x0: Math.min(rect.x0, e.clientX), x1: Math.max(rect.x0, e.clientX), y0: Math.min(rect.y0, e.clientY), y1: Math.max(rect.y0, e.clientY) };
              const hit = apiRef.current.pick(r);
              setSel(prev => (e.shiftKey ? new Set([...prev, ...hit]) : new Set(hit)));
              setRect(null);
            }}
          />
        )}
        {rect && (
          <div className="fixed border border-orange-400 bg-orange-400/20 pointer-events-none"
            style={{ left: Math.min(rect.x0, rect.x1), top: Math.min(rect.y0, rect.y1), width: Math.abs(rect.x1 - rect.x0), height: Math.abs(rect.y1 - rect.y0) }} />
        )}
        <div className="absolute bottom-3 left-3 text-[11px] text-gray-300 bg-black/40 rounded-lg px-3 py-2 pointer-events-none">
          {cage ? (rotMode ? '슬라이더로 회전 — 바닥은 고정되고 윗부분만 그 축을 중심으로 돌아가요' : '파란 점 클릭 → 화살표 드래그로 이동 (바닥/윗면 코너 모두 가능)') : '클릭: 선택 · Shift: 추가/해제 · 박스 모드는 드래그(뒤쪽 블록도 선택)'}
        </div>
      </div>
    </div>
  );
}