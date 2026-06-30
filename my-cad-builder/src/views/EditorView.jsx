import React, { useState, useRef, useMemo } from 'react';
import * as THREE from 'three';
import Button from '../components/ui/Button';
import { exportToPNG, exportToCSV, importPNGToGrid, getCellColorClass, FLOOR_COLORS, formatID } from '../utils/cadUtils';
import LiveDemoViewer from '../components/LiveDemoViewer';

// 🌟 백엔드 CSV 행({PosX,PosY,PosZ,Material,...}) → LiveDemoViewer가 기대하는 블록 형태({x,y,z,mat,color})로 변환
//    + 원본 컬럼 전체(raw)도 같이 보관해둬서, 나중에 회전 적용 후 CSV를 다시 만들 때 그대로 재사용
const MATERIAL_HEX = {
  Concrete: '#95a5a6', Wood: '#d35400', Steel: '#2c3e50',
  Glass: '#3498db', Default: '#bdc3c7'
};

function parseCsvToBlocks(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return { blocks: [], headers: [] };

  const headers = lines[0].split(',').map(h => h.trim());
  const idx = {
    blockId: headers.indexOf('BlockID'),
    x: headers.indexOf('PosX'),
    y: headers.indexOf('PosY'),
    z: headers.indexOf('PosZ'),
    mat: headers.indexOf('Material'),
    type: headers.indexOf('Type'),
  };

  const blocks = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const cols = lines[i].split(',');
    const matName = idx.mat !== -1 ? cols[idx.mat] : 'Default';
    const rawRow = {};
    headers.forEach((h, hi) => { rawRow[h] = cols[hi]; });

    blocks.push({
      x: parseFloat(cols[idx.x]),
      y: parseFloat(cols[idx.y]),
      z: parseFloat(cols[idx.z]),
      mat: matName,
      color: MATERIAL_HEX[matName] || MATERIAL_HEX.Default,
      type: idx.type !== -1 ? cols[idx.type] : undefined,
      raw: rawRow, // 🌟 원본 전체 컬럼 보관 (Stress, RiskLevel 등 회전과 무관한 값들 보존용)
    });
  }
  return { blocks, headers };
}

// 🌟 쿼터니언 회전을 블록 좌표에 적용하고, 회전 후 바닥이 Y=1.5 근처로 오도록 다시 정렬
function applyRotationToBlocks(blocks, quatArray) {
  const q = new THREE.Quaternion(...quatArray);
  const rotated = blocks.map(b => {
    const v = new THREE.Vector3(b.x, b.y, b.z).applyQuaternion(q);
    return { ...b, x: v.x, y: v.y, z: v.z };
  });

  if (rotated.length === 0) return rotated;
  const minY = Math.min(...rotated.map(b => b.y));
  const yOffset = 1.5 - minY; // 바닥 블록 중심이 1.5에 오도록 평행이동

  return rotated.map(b => ({
    ...b,
    x: Math.round((b.x) * 100) / 100,
    y: Math.round((b.y + yOffset) * 100) / 100,
    z: Math.round((b.z) * 100) / 100,
  }));
}

// 🌟 회전 적용된 블록들을 다시 CSV 텍스트로 직렬화 (원본 헤더/기타 컬럼 그대로 유지, 좌표+BlockID만 갱신)
function blocksToCsvText(blocks, headers) {
  const finalHeaders = headers.length > 0
    ? headers
    : ['BlockID', 'PosX', 'PosY', 'PosZ', 'Stress', 'RiskLevel', 'Prescription', 'Material', 'Tensile', 'Compressive', 'Tool', 'Type'];

  const rows = blocks.map(b => {
    const idX = formatID(b.x * 10);
    const idZ = formatID(b.z * 10);
    const idY = formatID(b.y * 10);
    const blockId = `${idX}_${idZ}_${idY}`;

    return finalHeaders.map(h => {
      if (h === 'BlockID') return blockId;
      if (h === 'PosX') return b.x;
      if (h === 'PosY') return b.y;
      if (h === 'PosZ') return b.z;
      // 그 외 컬럼은 원본 raw 값 그대로 (없으면 빈칸)
      return b.raw?.[h] ?? '';
    }).join(',');
  });

  return [finalHeaders.join(','), ...rows].join('\n');
}

function downloadCsvText(csvText, filename) {
  const blob = new Blob([csvText], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}

const IDENTITY_QUAT = [0, 0, 0, 1];

export default function EditorView({
  grid, setGrid, mode, setMode, activeFloor, setActiveFloor, setView,
  undo, saveHistory, uploadToShowcase, isInsidePreview,
  handleMouseDown, handleMouseEnter, handleMouseUp
}) {

  // ⭐ 왼쪽 패널 탭 모드 ('grid' = 수동 제작, 'photo' = AI 사진 추출)
  const [editorTab, setEditorTab] = useState('grid');

  // AI 사진 추출 결과 → 3D 뷰어에 띄울 데이터 (원본, 회전 미적용)
  const [extracted3DData, setExtracted3DData] = useState([]);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [rawCsvText, setRawCsvText] = useState(''); // 🌟 "원본 다운로드"용 — 추출/업로드 당시 그대로

  // 🌟 회전 상태 (쿼터니언 [x,y,z,w]) — 버튼/기즈모 둘 다 이 상태를 공유
  const [rotationQuat, setRotationQuat] = useState(IDENTITY_QUAT);

  // 🌟 AI 사진 추출용 추가 상태들
  const [imageSrc, setImageSrc] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [box, setBox] = useState(null); // 박스 좌표 {startX, startY, endX, endY}
  const [isDrawingBox, setIsDrawingBox] = useState(false);
  const [snapshots, setSnapshots] = useState([]); // 3스냅샷 제한 관리
  const [isExtracting, setIsExtracting] = useState(false);
  const [realHeightMeters, setRealHeightMeters] = useState(''); // 🌟 실제 건물 높이(m) — 백엔드 필수 입력
  const imgRef = useRef(null); // 이미지 태그의 실제 크기를 구하기 위함
  const csvUploadRef = useRef(null);

  // 🌟 현재 회전 상태가 적용된 블록 (미리보기 + "편집본 다운로드"에 사용)
  const rotatedBlocks = useMemo(() => {
    if (extracted3DData.length === 0) return [];
    if (rotationQuat === IDENTITY_QUAT) return extracted3DData;
    return applyRotationToBlocks(extracted3DData, rotationQuat);
  }, [extracted3DData, rotationQuat]);

  const handlePngSave = () => {
    const name = prompt("파일 이름을 입력하세요 (mbs_ 가 자동으로 붙습니다)", "신축도면");
    if (name === null) return;
    exportToPNG(grid, name);
  };

  // 1. 사진 업로드 처리 (3스냅샷 리미터 작동!)
  const handleImageUpload = (e) => {
    if (snapshots.length >= 3) {
      alert("🚨 사진 3D 추출은 프로젝트당 최대 3개의 스냅샷까지만 저장 가능합니다! 기존 스냅샷을 삭제해 주세요.");
      return;
    }
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      setImageSrc(URL.createObjectURL(file));
      setBox(null);
    }
  };

  // 2. 파이썬 서버로 데이터 쏘기
  const handleExtract3D = async () => {
    if (!box || !imageFile || !imgRef.current || !realHeightMeters) return;
    setIsExtracting(true);

    try {
      const scaleX = imgRef.current.naturalWidth / imgRef.current.width;
      const scaleY = imgRef.current.naturalHeight / imgRef.current.height;

      const realStartX = Math.min(box.startX, box.endX) * scaleX;
      const realStartY = Math.min(box.startY, box.endY) * scaleY;
      const realEndX = Math.max(box.startX, box.endX) * scaleX;
      const realEndY = Math.max(box.startY, box.endY) * scaleY;

      const formData = new FormData();
      formData.append('file', imageFile);
      formData.append('startX', realStartX);
      formData.append('startY', realStartY);
      formData.append('endX', realEndX);
      formData.append('endY', realEndY);
      formData.append('realHeightMeters', realHeightMeters);

      const response = await fetch('http://localhost:8000/api/extract-3d-csv', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error("서버 변환 실패");

      const csvText = await response.text();
      const { blocks, headers } = parseCsvToBlocks(csvText);

      setExtracted3DData(blocks);
      setCsvHeaders(headers);
      setRawCsvText(csvText);
      setRotationQuat(IDENTITY_QUAT); // 새로 추출했으니 회전 초기화

      // 🌟 "원본" CSV는 추출 직후 자동으로 다운로드 (백업용)
      downloadCsvText(csvText, `ai_extracted_원본_${Date.now()}.csv`);

      const blob = new Blob([csvText], { type: 'text/csv' });
      setSnapshots(prev => [...prev, blob]);
      alert(`✅ 성공적으로 ${blocks.length.toLocaleString()}개 3D 블록을 추출했습니다! 오른쪽에서 회전을 맞춘 후 "편집본 다운로드"를 눌러주세요.`);

    } catch (error) {
      console.error(error);
      alert("❌ AI 추출 중 오류가 발생했습니다. 파이썬 서버가 켜져 있는지 확인하세요.");
    } finally {
      setIsExtracting(false);
    }
  };

  // 3. 🌟 다운로드해둔 CSV를 다시 불러와서 회전 편집 재개
  const handleCsvReupload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const csvText = evt.target.result;
      const { blocks, headers } = parseCsvToBlocks(csvText);
      if (blocks.length === 0) {
        alert("❌ CSV를 읽을 수 없습니다. 형식을 확인해주세요.");
        return;
      }
      setExtracted3DData(blocks);
      setCsvHeaders(headers);
      setRawCsvText(csvText);
      setRotationQuat(IDENTITY_QUAT);
      alert(`📂 ${blocks.length.toLocaleString()}개 블록을 불러왔습니다. 회전을 조정해보세요.`);
    };
    reader.readAsText(file);
    e.target.value = ''; // 같은 파일 다시 선택해도 onChange 트리거되게
  };

  // 🌟 90도씩 회전 버튼 (X/Y축)
  const rotateBy90 = (axis, sign) => {
    const axisVec = axis === 'x' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const delta = new THREE.Quaternion().setFromAxisAngle(axisVec, sign * Math.PI / 2);
    const current = new THREE.Quaternion(...rotationQuat);
    current.premultiply(delta);
    setRotationQuat([current.x, current.y, current.z, current.w]);
  };

  const handleDownloadEdited = () => {
    if (rotatedBlocks.length === 0) return;
    const csvText = blocksToCsvText(rotatedBlocks, csvHeaders);
    downloadCsvText(csvText, `ai_extracted_편집본_${Date.now()}.csv`);
  };

  const handleDownloadOriginal = () => {
    if (!rawCsvText) return;
    downloadCsvText(rawCsvText, `ai_extracted_원본_${Date.now()}.csv`);
  };

  return (
    <div className="h-screen w-screen bg-gray-50 flex flex-col overflow-hidden select-none">

      {/* --- 최상단 공통 헤더 --- */}
      <header className="p-4 bg-white border-b border-gray-200 flex justify-between items-center shadow-sm z-10">
        <div className="flex items-center space-x-3">
          <button onClick={() => setView('dashboard')} className="p-2 text-gray-400 hover:text-blue-600 font-bold">◀ 뒤로가기</button>
          <div className="h-6 w-px bg-gray-200 mx-2" />
          <h1 className="text-xl font-black text-gray-800">CAD 에디터</h1>
        </div>
        <div className="flex space-x-2">
          <Button variant="primary" onClick={uploadToShowcase}>🌐 클라우드 저장</Button>
          <Button variant="dark" onClick={handlePngSave}>PNG 저장 (mbs_)</Button>
          <Button variant="secondary" onClick={() => exportToCSV(grid)}>CSV 내보내기</Button>
        </div>
      </header>

      {/* --- 메인 작업 영역: 2단 분할 --- */}
      <div className="flex-1 flex overflow-hidden bg-gray-50">

        {/* [왼쪽 영역] : 탭 및 작업 공간 */}
        <div className="flex-1 flex flex-col border-r border-gray-200">

          {/* ⭐ 탭 네비게이션 */}
          <div className="flex bg-white border-b border-gray-200">
            <button
              onClick={() => setEditorTab('grid')}
              className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${editorTab === 'grid' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
            >
              📐 정밀 격자 제작 모드
            </button>
            <button
              onClick={() => setEditorTab('photo')}
              className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${editorTab === 'photo' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
            >
              📷 AI 사진 3D 추출 모드
            </button>
          </div>

          <div className="flex-1 overflow-hidden">
            {/* 1️⃣ 정밀 격자 제작 모드 */}
            {editorTab === 'grid' && (
              <div className="flex flex-col h-full">
                {/* 툴바 (벽 그리기, 바닥 채우기 등) */}
                <div className="p-3 bg-white border-b border-gray-200 flex items-center space-x-2 shadow-sm justify-center">
                  <div className="flex bg-gray-100 p-1 rounded-lg">
                    <Button variant={mode === 'wall_rect' ? 'tabActive' : 'tabInactive'} onClick={() => setMode('wall_rect')}>🧱 벽 그리기</Button>
                    <Button variant={mode === 'floor_fill' ? 'tabActive' : 'tabInactive'} onClick={() => setMode('floor_fill')}>🪣 바닥 채우기</Button>
                    <Button variant={mode === 'floor_rect' ? 'tabActive' : 'tabInactive'} onClick={() => setMode('floor_rect')}>🏁 바닥 드래그</Button>
                    <Button variant={mode === 'rect_eraser' ? 'tabActive' : 'tabInactive'} onClick={() => setMode('rect_eraser')} className={mode === 'rect_eraser' ? '!text-red-500' : ''}>🧼 지우개</Button>
                  </div>
                  {mode === 'wall_rect' && (
                    <div className="flex items-center bg-gray-100 p-1 rounded-lg space-x-1">
                      {[1, 2, 3, 4, 5].map(floorNum => (
                        <button
                          key={floorNum}
                          onClick={() => setActiveFloor(floorNum)}
                          className={`w-7 h-7 rounded-md border-2 flex items-center justify-center text-[10px] font-bold transition-all ${
                            activeFloor === floorNum ? 'border-blue-500 scale-110' : 'border-transparent opacity-70 hover:opacity-100'
                          }`}
                          style={{ backgroundColor: FLOOR_COLORS[floorNum].hex, color: floorNum === 1 ? '#111' : '#fff' }}
                        >
                          {floorNum}
                        </button>
                      ))}
                    </div>
                  )}
                  <Button variant="secondary" onClick={undo}>↩ 되돌리기</Button>
                  <label className="cursor-pointer px-3 py-2 bg-white border border-blue-200 text-blue-600 rounded-md text-xs font-bold hover:bg-blue-50">
                    📂 PNG 불러오기
                    <input type="file" accept="image/*" className="hidden" onChange={e => {
                      const file = e.target.files[0];
                      if (file) importPNGToGrid(file, g => { saveHistory(); setGrid(g); });
                    }} />
                  </label>
                </div>

                {/* 50x50 캔버스 영역 */}
                <div className="flex-1 p-10 flex justify-center items-start" onMouseUp={handleMouseUp}>
                  <div className="bg-white shadow-2xl border border-gray-200 relative" style={{ display: 'grid', gridTemplateColumns: 'repeat(50, 14px)', width: '700px' }}>
                    {grid.map((row, rIdx) => row.map((cell, cIdx) => {
                      const inPreview = isInsidePreview(rIdx, cIdx);
                      let bgColor = getCellColorClass(cell);
                      if (inPreview) {
                        if (mode === 'wall_rect') bgColor = FLOOR_COLORS[activeFloor].tw + '/60';
                        else if (mode === 'floor_rect') bgColor = "bg-blue-300/40";
                        else bgColor = "bg-red-200";
                      }
                      return (
                        <div key={`${rIdx}-${cIdx}`} onMouseDown={() => handleMouseDown(rIdx, cIdx)} onMouseEnter={() => handleMouseEnter(rIdx, cIdx)}
                          className={`w-[14px] h-[14px] border-[0.1px] border-gray-50 ${bgColor} hover:bg-blue-50 transition-colors`} />
                      );
                    }))}
                  </div>
                </div>
              </div>
            )}

            {/* 2️⃣ AI 사진 3D 추출 탭 */}
            {editorTab === 'photo' && (
              <div className="h-full p-6 flex flex-col items-center overflow-y-auto relative"
                onMouseMove={(e) => {
                  if (!isDrawingBox || !imgRef.current) return;
                  const rect = imgRef.current.getBoundingClientRect();
                  const currentX = e.clientX - rect.left;
                  const currentY = e.clientY - rect.top;
                  setBox(prev => ({ ...prev, endX: currentX, endY: currentY }));
                }}
                onMouseUp={() => setIsDrawingBox(false)}
                onMouseLeave={() => setIsDrawingBox(false)}
              >
                {!imageSrc ? (
                  // [사진 업로드 전 화면]
                  <div className="w-full max-w-2xl bg-white p-10 rounded-3xl shadow-lg border border-gray-200 flex flex-col items-center text-center mt-10">
                    <div className="text-5xl mb-6">📸</div>
                    <h2 className="text-2xl font-black text-gray-900 mb-2">건물/객체 사진 업로드</h2>
                    <p className="text-gray-500 mb-8 font-medium">사진을 올리고 원하는 건물을 박스로 치면, AI가 1만 개 이하의 3D 엑셀 블록으로 추출합니다.</p>

                    <label className="cursor-pointer w-full flex flex-col items-center justify-center h-48 border-2 border-dashed border-blue-300 rounded-2xl bg-blue-50 hover:bg-blue-100 transition-colors">
                      <span className="text-blue-600 font-bold mb-2">클릭하여 이미지 파일 선택</span>
                      <span className="text-xs text-blue-400">지원 형식: JPG, PNG</span>
                      <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                    </label>

                    <div className="w-full flex items-center my-6">
                      <div className="flex-1 h-px bg-gray-200" /><span className="px-3 text-xs text-gray-400">또는</span><div className="flex-1 h-px bg-gray-200" />
                    </div>

                    {/* 🌟 기존에 추출해둔 CSV를 다시 불러와서 회전만 편집 */}
                    <label className="cursor-pointer w-full flex flex-col items-center justify-center h-20 border-2 border-dashed border-gray-300 rounded-2xl bg-gray-50 hover:bg-gray-100 transition-colors">
                      <span className="text-gray-600 font-bold text-sm">📂 이전에 추출한 CSV 불러와서 회전 편집</span>
                      <input ref={csvUploadRef} type="file" accept=".csv" className="hidden" onChange={handleCsvReupload} />
                    </label>
                  </div>
                ) : (
                  // [사진 업로드 후 - 박스 그리기 화면]
                  <div className="w-full flex flex-col items-center">
                    <div className="w-full flex justify-between items-center mb-4 bg-white p-4 rounded-2xl shadow-sm border border-gray-200">
                      <div>
                        <h3 className="font-bold text-gray-800">🎯 추출할 건물을 마우스로 드래그하세요!</h3>
                        <p className="text-xs text-gray-500">현재 스냅샷: {snapshots.length} / 3 MAX</p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          placeholder="실제 높이(m)"
                          value={realHeightMeters}
                          onChange={e => setRealHeightMeters(e.target.value)}
                          className="w-28 px-2 py-2 border border-gray-300 rounded-md text-sm"
                        />
                        <Button variant="secondary" onClick={() => { setImageSrc(null); setBox(null); }}>취소</Button>
                        <Button variant="primary" onClick={handleExtract3D} disabled={!box || isExtracting || !realHeightMeters}>
                          {isExtracting ? 'AI 추출 중...⏳' : '⚡ 3D 추출 (원본 자동 다운로드)'}
                        </Button>
                      </div>
                    </div>

                    {/* 🌟 크롭(박스) 에디터 영역 */}
                    <div className="relative inline-block border-4 border-gray-800 rounded-lg overflow-hidden shadow-2xl select-none">
                      <img
                        ref={imgRef}
                        src={imageSrc}
                        alt="upload"
                        className="max-w-[700px] max-h-[600px] object-contain cursor-crosshair"
                        draggable="false"
                        onMouseDown={(e) => {
                          const rect = imgRef.current.getBoundingClientRect();
                          const startX = e.clientX - rect.left;
                          const startY = e.clientY - rect.top;
                          setIsDrawingBox(true);
                          setBox({ startX, startY, endX: startX, endY: startY });
                        }}
                      />
                      {box && (
                        <div
                          className="absolute border-2 border-blue-500 bg-blue-400/30 pointer-events-none"
                          style={{
                            left: Math.min(box.startX, box.endX),
                            top: Math.min(box.startY, box.endY),
                            width: Math.abs(box.endX - box.startX),
                            height: Math.abs(box.endY - box.startY)
                          }}
                        />
                      )}
                    </div>
                  </div>
                )}

                {/* 🌟 회전 편집 + 다운로드 패널 (추출/불러오기 결과가 있을 때만 표시) */}
                {extracted3DData.length > 0 && (
                  <div className="w-full max-w-2xl mt-6 bg-white p-5 rounded-2xl shadow-sm border border-gray-200">
                    <h3 className="font-bold text-gray-800 mb-3">🔄 회전 편집</h3>
                    <p className="text-xs text-gray-500 mb-3">버튼으로 90도씩 빠르게 돌리거나, 오른쪽 미리보기의 기즈모를 드래그해서 자유롭게 맞춰보세요.</p>

                    <div className="flex flex-wrap items-center gap-2 mb-4">
                      <Button variant="secondary" onClick={() => rotateBy90('x', 1)}>X축 +90°</Button>
                      <Button variant="secondary" onClick={() => rotateBy90('x', -1)}>X축 -90°</Button>
                      <Button variant="secondary" onClick={() => rotateBy90('y', 1)}>Y축 +90°</Button>
                      <Button variant="secondary" onClick={() => rotateBy90('y', -1)}>Y축 -90°</Button>
                      <Button variant="secondary" onClick={() => setRotationQuat(IDENTITY_QUAT)}>↺ 초기화</Button>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button variant="secondary" onClick={handleDownloadOriginal}>📥 원본 다운로드</Button>
                      <Button variant="primary" onClick={handleDownloadEdited}>✅ 편집본(회전 적용) 다운로드</Button>
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>

        {/* ⭐ [오른쪽 영역] : 3D 라이브 데모 (공통) */}
        <div className="w-[450px] bg-white shadow-2xl flex flex-col z-20 shrink-0">
          <div className="p-4 bg-gray-900 text-white font-bold flex justify-between items-center text-sm">
            <span>🏗️ 실시간 3D 시공 미리보기</span>
            <span className="text-xs text-green-400 font-black animate-pulse">● Live</span>
          </div>
          <div className="flex-1 relative">
            <LiveDemoViewer
              grid={editorTab === 'grid' ? grid : null}
              data={editorTab === 'photo' ? extracted3DData : null}
              mode="realtime"
              maxBlocks={10000}
              rotationQuat={rotationQuat}
              enableGizmo={editorTab === 'photo' && extracted3DData.length > 0}
              onRotationChange={(q) => setRotationQuat(q)}
            />
          </div>
        </div>

      </div>
    </div>
  );
}