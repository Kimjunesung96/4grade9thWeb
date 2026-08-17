import React, { useState, useRef, useMemo } from 'react';
import * as THREE from 'three';
import Button from '../components/ui/Button';
import { exportToPNG, exportStackedFloorsToCSV, getNextPageBase, getCombinedFloors, importPNGToGrid, getCellColorClass, FLOOR_COLORS, formatID, downloadFloorPagesAsZip, downloadPagesAsPngOrZip, csvDataToFloorPages } from '../utils/cadUtils';
import LiveDemoViewer from '../components/LiveDemoViewer';

// 🌟 기입 완료된 모든 페이지(stackedFloors) + 현재 그리는 중인 페이지(grid)를 합쳐서
//    LiveDemoViewer가 그릴 수 있는 블록 배열({x,y,z,color,mat})로 변환
function buildAllBlocks(stackedFloors, currentGrid, currentPageBase) {
  const blocks = [];
  const pushPage = (pageBase, pageGrid) => {
    pageGrid.forEach((row, rIdx) => {
      row.forEach((cell, cIdx) => {
        if (cell < 1 || cell > 5) return;
        for (let layer = 1; layer <= cell; layer++) {
          const n = pageBase + layer;
          blocks.push({
            x: cIdx * 3.0,
            y: 1.5 + 3 * n,
            z: rIdx * 3.0,
            color: FLOOR_COLORS[cell].hex,
            mat: 'Concrete',
          });
        }
      });
    });
  };
  stackedFloors.forEach(({ pageBase, grid }) => pushPage(pageBase, grid));
  pushPage(currentPageBase, currentGrid); // 아직 기입 안 한 현재 페이지도 미리보기에 포함
  return blocks;
}

// 🌟 CSV로 불러온 모든 페이지(csvPages)를 각자 올바른 절대 높이(pageIndex*5)에
//    동시에 쌓아서 3D 미리보기용 블록 배열로 변환.
//    현재 보고 있는/수정 중인 페이지(currentPageIndex)는 csvPages의 스냅샷이 아니라
//    화면에 있는 최신 grid를 사용해서, 페이지를 넘기기 전에 수정한 내용도 바로 반영되게 한다.
function buildCsvPagesAllBlocks(csvPages, currentGrid, currentPageIndex) {
  const blocks = [];
  const pushPage = (pageBase, pageGrid) => {
    pageGrid.forEach((row, rIdx) => {
      row.forEach((cell, cIdx) => {
        if (cell < 1 || cell > 5) return;
        for (let layer = 1; layer <= cell; layer++) {
          const n = pageBase + layer;
          blocks.push({
            x: cIdx * 3.0,
            y: 1.5 + 3 * n,
            z: rIdx * 3.0,
            color: FLOOR_COLORS[cell].hex,
            mat: 'Concrete',
          });
        }
      });
    });
  };
  csvPages.forEach((pageGrid, i) => {
    const pageBase = i * 5; // 페이지당 5층 고정폭이므로 pageIndex*5가 절대 시작 높이
    const gridToUse = i === currentPageIndex ? currentGrid : pageGrid;
    pushPage(pageBase, gridToUse);
  });
  return blocks;
}

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
  if (blocks.length === 0) return blocks;
  const q = new THREE.Quaternion(...quatArray);

  // 🌟 미리보기(RotatableGroup)와 동일하게 "바운딩박스 중심"을 피벗으로 잡는다.
  //    (기존엔 원점(0,0,0) 기준으로 회전시켜서 건물이 원래 자리에서 확 벗어나 버렸음)
  const cx = (Math.min(...blocks.map(b => b.x)) + Math.max(...blocks.map(b => b.x))) / 2;
  const cy = (Math.min(...blocks.map(b => b.y)) + Math.max(...blocks.map(b => b.y))) / 2;
  const cz = (Math.min(...blocks.map(b => b.z)) + Math.max(...blocks.map(b => b.z))) / 2;

  const rotated = blocks.map(b => {
    const v = new THREE.Vector3(b.x - cx, b.y - cy, b.z - cz).applyQuaternion(q);
    return { ...b, x: v.x + cx, y: v.y + cy, z: v.z + cz };
  });

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
    // 🔥 핵심: 웹(RH) -> 유니티(LH) 완벽 동기화를 위해 Z축 좌표 부호를 반전!
    const exportZ = -b.z; 

    // ID 생성 (반전된 Z값 적용)
    const idX = formatID(b.x * 10);
    const idZ = formatID(exportZ * 10);
    const idY = formatID(b.y * 10);
    const blockId = `${idX}_${idZ}_${idY}`;

    return finalHeaders.map(h => {
      if (h === 'BlockID') return blockId;
      if (h === 'PosX') return b.x;
      if (h === 'PosY') return b.y;
      if (h === 'PosZ') return exportZ; // 반전된 Z값 내보내기
      // 그 외 원본 컬럼 유지
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

// 🌟 화면(라이브데모)은 지금 보이는 그대로 유지하고,
//    "엑셀(CSV) 다운로드" 할 때만 여기에 오른쪽 225도를 추가로 얹어서 내보냄.
//    즉: 엑셀 = (라이브데모에 보이는 회전) + (오른쪽 225도 추가)
const EXPORT_EXTRA_RIGHT_225_QUAT = (() => {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (3 * Math.PI) / 4);
  return [q.x, q.y, q.z, q.w];
})();

export default function EditorView({
  grid, setGrid, mode, setMode, paintColor, setPaintColor, stackedFloors, commitCurrentFloor, setView,
  undo, saveHistory, uploadToShowcase, isInsidePreview,
  handleMouseDown, handleMouseEnter, handleMouseUp,
  goBackToPreviousFloor, resetAllFloors
}) {

  // ⭐ 왼쪽 패널 탭 모드 ('grid' = 수동 제작, 'photo' = AI 사진 추출)
  const [editorTab, setEditorTab] = useState('grid');

  // ===================== 🌟 CSV → 정밀 격자 불러오기 (신규) =====================
  // 웹에서 받은 3D CSV(PosX/PosY/PosZ)를 5층 단위 페이지로 쪼개서
  // 정밀 격자(grid)에 순차적으로 표시 → 필요하면 수정 → 페이지 전체 PNG로 내보내기
  // 🌟 allStackedBlocks가 이 상태를 참조해야 해서 (기존엔 아래쪽에 선언되어 있었음) 위로 끌어올림
  const [csvPages, setCsvPages] = useState([]); // [grid1, grid2, ...] 5층씩 쪼갠 페이지들
  const [csvPageIndex, setCsvPageIndex] = useState(0);
  const [csvBaseName, setCsvBaseName] = useState('structure');
  const csvGridUploadRef = useRef(null);
  // ===================== CSV → 정밀 격자 불러오기 상태 끝 =====================

  // 🌟 기입 완료된 페이지 전부 + 지금 그리는 중인 페이지까지 합친 3D 미리보기용 블록
  //    CSV를 불러온 상태(csvPages 존재)라면 stackedFloors 대신 csvPages 전부를
  //    각자 올바른 절대 높이(pageIndex*5)에 동시에 쌓아서 이어 보이게 한다.
  //    (수동 그리기 모드일 땐 기존 stackedFloors 기반 로직 그대로 사용)
  const allStackedBlocks = useMemo(() => {
    if (csvPages.length > 0) {
      return buildCsvPagesAllBlocks(csvPages, grid, csvPageIndex);
    }
    return buildAllBlocks(stackedFloors, grid, getNextPageBase(stackedFloors));
  }, [stackedFloors, grid, csvPages, csvPageIndex]);

  // AI 사진 추출 결과 → 3D 뷰어에 띄울 데이터 (원본, 회전 미적용)
  const [extracted3DData, setExtracted3DData] = useState([]);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [rawCsvText, setRawCsvText] = useState(''); // 🌟 "원본 다운로드"용 — 추출/업로드 당시 그대로

  // 🌟 회전 상태 (쿼터니언 [x,y,z,w]) — 버튼/기즈모 둘 다 이 상태를 공유
  const [rotationQuat, setRotationQuat] = useState(IDENTITY_QUAT);

  // 🌟 "영점(0점)" — 90도 버튼만으로는 못 맞추는 애매한 각도(예: 135도)를
  //    기즈모로 자유롭게 맞춘 뒤 "여기를 0점으로 저장"하면 이 값이 바뀜.
  //    이후 "초기화" 버튼은 진짜 원본이 아니라 이 저장된 영점으로 돌아가고,
  //    90도 버튼도 이 영점을 기준으로 이어서 돌게 됨.
  const [baseRotationQuat, setBaseRotationQuat] = useState(IDENTITY_QUAT);

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

  // (csvPages / csvPageIndex / csvBaseName / csvGridUploadRef 는 allStackedBlocks가
  //  참조해야 해서 컴포넌트 상단으로 이동시켰음 — 여기서 중복 선언하지 않음)

  const handleCsvGridUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const csvText = evt.target.result;
      const pages = csvDataToFloorPages(csvText, 5, 50);
      if (pages.length === 0) {
        alert('CSV에서 유효한 좌표(PosX/PosY/PosZ)를 찾지 못했습니다.');
        return;
      }
      setCsvPages(pages);
      setCsvPageIndex(0);
      setCsvBaseName(file.name.replace(/\.csv$/i, ''));
      saveHistory();
      setGrid(pages[0]);
      alert(`✅ CSV에서 ${pages.length}장의 페이지(5층씩)를 불러왔습니다. ◀▶로 페이지를 넘겨보고 필요하면 수정하세요.`);
    };
    reader.readAsText(file);
    e.target.value = ''; // 같은 파일 다시 선택해도 onChange 트리거되게
  };

  // 페이지 이동 시 현재 화면에서 수정한 내용을 csvPages에 반영한 뒤 이동
  const goToCsvPage = (newIndex) => {
    if (newIndex < 0 || newIndex >= csvPages.length) return;
    setCsvPages(prev => {
      const updated = [...prev];
      updated[csvPageIndex] = grid;
      return updated;
    });
    saveHistory();
    setGrid(csvPages[newIndex]);
    setCsvPageIndex(newIndex);
  };

  // CSV에서 불러온 모든 페이지를 PNG로 다운로드 (6장 미만은 개별, 6장 이상은 zip 하나로 자동 전환)
  const handleDownloadAllCsvPagesPngs = async () => {
    if (csvPages.length === 0) {
      alert('먼저 CSV를 불러와주세요.');
      return;
    }
    const finalPages = [...csvPages];
    finalPages[csvPageIndex] = grid; // 현재 보고 있는 페이지의 수정사항 반영
    const labels = finalPages.map((_, i) => {
      const startFloor = i * 5 + 1;
      const endFloor = (i + 1) * 5;
      return `${csvBaseName}_p${i + 1}_floors${startFloor}-${endFloor}`;
    });
    await downloadPagesAsPngOrZip(finalPages, labels, `${csvBaseName}_floors`);
  };
  // ===================== CSV → 정밀 격자 불러오기 끝 =====================

  // 🌟 현재 회전 상태가 적용된 블록 (미리보기 + "편집본 다운로드"에 사용)
  const rotatedBlocks = useMemo(() => {
    if (extracted3DData.length === 0) return [];
    if (rotationQuat === IDENTITY_QUAT) return extracted3DData;
    return applyRotationToBlocks(extracted3DData, rotationQuat);
  }, [extracted3DData, rotationQuat]);

  // 🎯 묶여있던 handleCloudSave 함수를 useMemo 바깥으로 독립시켰습니다.
  const handleCloudSave = () => {
    if (editorTab === 'grid') {
      // 1. 2D 모드일 때 저장
      uploadToShowcase({ grid_data: grid });
    } else {
      // 2. 3D 모드일 때 저장
      if (rotatedBlocks.length === 0) {
        alert("추출된 3D 데이터가 없습니다.");
        return;
      }

      // 화면에 있는 3D 캔버스를 찾아 사진(Base64)으로 찰칵!
      const canvas = document.querySelector('canvas');
      const thumbnailBase64 = canvas ? canvas.toDataURL('image/png') : null;

      // 3D 데이터를 CSV 텍스트로 직렬화
      const csvText = blocksToCsvText(rotatedBlocks, csvHeaders);

      // App.jsx의 업로드 함수로 전달
      uploadToShowcase({ 
        csv_data: csvText, 
        thumbnail_url: thumbnailBase64 
      });
    }
  };

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
      setRotationQuat(IDENTITY_QUAT); // 새로 추출했으니 화면(라이브데모) 회전은 원본 그대로
      setBaseRotationQuat(IDENTITY_QUAT); // 영점도 원본(0도)으로

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
      setBaseRotationQuat(IDENTITY_QUAT);
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

  // 🌟 지금 기즈모/버튼으로 맞춰놓은 각도(135도 같은 애매한 값도 포함)를
  //    그대로 "0점"으로 저장 — 이후 초기화/90도 버튼은 이 각도를 기준으로 동작
  const handleSetZeroPoint = () => {
    setBaseRotationQuat(rotationQuat);
    alert("📍 현재 각도를 0점으로 저장했습니다. 이제부터 '초기화'를 누르면 이 각도로 돌아옵니다.");
  };

  const handleDownloadEdited = () => {
  if (rotatedBlocks.length === 0) return;
  
  // 예전 코드에 있던 임의의 각도(225도 등) 추가 로직을 완전 제거합니다.
  // 화면에 보이는 블록 배열(rotatedBlocks) 상태 그대로 CSV 직렬화!
  const csvText = blocksToCsvText(rotatedBlocks, csvHeaders);
  downloadCsvText(csvText, `ai_extracted_편집본_${Date.now()}.csv`);
};

  const handleDownloadOriginal = () => {
    if (!rawCsvText) return;
    downloadCsvText(rawCsvText, `ai_extracted_원본_${Date.now()}.csv`);
  };

  // 🌟 화면에 보이는(회전 적용된) 3D 블록을 5층씩 잘라서 PNG 여러 장으로 순차 다운로드
  const handleDownloadFloorPagesPngs = () => {
    if (rotatedBlocks.length === 0) {
      alert("추출된 3D 데이터가 없습니다.");
      return;
    }
    const csvText = blocksToCsvText(rotatedBlocks, csvHeaders);
    downloadFloorPagesAsZip(csvText, '건물', 5);
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
          <Button variant="primary" onClick={handleCloudSave}>🌐 클라우드 저장</Button>
          <Button variant="dark" onClick={handlePngSave}>PNG 저장 (mbs_)</Button>
          {/* 🌟 CSV로 불러온 뒤 아직 "기입"을 안 누른 페이지(csvPages)가 있어도 내보내기에 포함되도록
                 getCombinedFloors로 stackedFloors + csvPages(현재 편집 중인 페이지는 최신 grid)를 합쳐서 내보낸다.
                 (기존엔 stackedFloors만 내보내서 CSV로 불러온 내용이 통째로 빠지는 버그가 있었음) */}
          <Button variant="secondary" onClick={() => exportStackedFloorsToCSV(getCombinedFloors(stackedFloors, csvPages, csvPageIndex, grid))}>
            📦 전체 CSV 내보내기 ({(csvPages.length > 0 ? csvPages.length : stackedFloors.length)}장)
          </Button>
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
                <div className="p-3 bg-white border-b border-gray-200 flex items-center space-x-2 shadow-sm justify-center flex-wrap gap-y-2">
                  <div className="flex bg-gray-100 p-1 rounded-lg">
                    <Button variant={mode === 'wall_rect' ? 'tabActive' : 'tabInactive'} onClick={() => setMode('wall_rect')}>🧱 벽 그리기</Button>
                    <Button variant={mode === 'floor_fill' ? 'tabActive' : 'tabInactive'} onClick={() => setMode('floor_fill')}>🪣 바닥 채우기</Button>
                    <Button variant={mode === 'floor_rect' ? 'tabActive' : 'tabInactive'} onClick={() => setMode('floor_rect')}>🏁 바닥 드래그</Button>
                    <Button variant={mode === 'rect_eraser' ? 'tabActive' : 'tabInactive'} onClick={() => setMode('rect_eraser')} className={mode === 'rect_eraser' ? '!text-red-500' : ''}>🧼 지우개</Button>
                  </div>
                  {mode !== 'rect_eraser' && (
                    <div className="flex items-center bg-gray-100 p-1 rounded-lg space-x-1">
                      {[1, 2, 3, 4, 5].map(colorNum => (
                        <button
                          key={colorNum}
                          onClick={() => setPaintColor(colorNum)}
                          className={`w-7 h-7 rounded-md border-2 flex items-center justify-center text-[10px] font-bold transition-all ${
                            paintColor === colorNum ? 'border-blue-500 scale-110' : 'border-transparent opacity-70 hover:opacity-100'
                          }`}
                          style={{ backgroundColor: FLOOR_COLORS[colorNum].hex, color: colorNum === 1 ? '#111' : '#fff' }}
                        >
                          {colorNum}
                        </button>
                      ))}
                    </div>
                  )}
                  <Button variant="secondary" onClick={undo}>↩ 되돌리기</Button>
                  <Button variant="secondary" onClick={goBackToPreviousFloor} disabled={stackedFloors.length === 0}>⏮ 이전 페이지로</Button>
                  {/* 🌟 CSV를 불러온 상태(csvPages 有)에서 누르면, App의 commitCurrentFloor가
                         로드된 모든 CSV 페이지를 stackedFloors로 흡수하도록 pages/pageIndex를 같이 넘긴다.
                         흡수가 끝나면 이 화면(csvPages)은 더 이상 필요 없으니 비워서 이후엔
                         기존 stackedFloors 기반 페이지 넘기기로만 이어지게 한다. */}
                  <Button variant="primary" onClick={() => {
                    if (csvPages.length > 0) {
                      commitCurrentFloor({ pages: csvPages, pageIndex: csvPageIndex });
                      setCsvPages([]);
                      setCsvPageIndex(0);
                    } else {
                      commitCurrentFloor();
                    }
                  }}>✅ 이 페이지 기입하고 다음 장으로</Button>
                  <Button variant="dark" onClick={resetAllFloors} className="!bg-red-600 hover:!bg-red-700">🗑 전체 초기화</Button>
                  <label className="cursor-pointer px-3 py-2 bg-white border border-blue-200 text-blue-600 rounded-md text-xs font-bold hover:bg-blue-50">
                    📂 PNG 불러오기
                    <input type="file" accept="image/*" className="hidden" onChange={e => {
                      const file = e.target.files[0];
                      if (file) importPNGToGrid(file, g => { saveHistory(); setGrid(g); });
                    }} />
                  </label>
                  <label className="cursor-pointer px-3 py-2 bg-white border border-green-200 text-green-600 rounded-md text-xs font-bold hover:bg-green-50">
                    📄 CSV 불러오기
                    <input ref={csvGridUploadRef} type="file" accept=".csv" className="hidden" onChange={handleCsvGridUpload} />
                  </label>
                </div>

                {/* 현재 페이지 상태 표시 */}
                <div className="flex justify-center items-center py-2 bg-white border-b border-gray-100 text-xs font-bold text-gray-500">
                  🏗 {stackedFloors.length + 1}번째 장 그리는 중 · 기입 완료: {stackedFloors.length}장
                  {stackedFloors.length > 0 && (
                    <span className="ml-2 text-gray-400">
                      (이전 장 시작 높이: {stackedFloors[stackedFloors.length - 1].pageBase}, 이번 장 시작 높이: {stackedFloors[stackedFloors.length - 1].pageBase + stackedFloors[stackedFloors.length - 1].maxColorUsed})
                    </span>
                  )}
                </div>

                {/* 🌟 CSV로 불러온 페이지 넘기기 UI (CSV 불러온 상태에서만 표시) */}
                {csvPages.length > 0 && (
                  <div className="flex justify-center items-center gap-3 py-2 bg-green-50 border-b border-green-100 text-xs font-bold text-green-700">
                    <span>📄 {csvBaseName}.csv</span>
                    <Button variant="secondary" onClick={() => goToCsvPage(csvPageIndex - 1)} disabled={csvPageIndex === 0}>◀</Button>
                    <span>CSV 페이지 {csvPageIndex + 1} / {csvPages.length} (층 {csvPageIndex * 5 + 1}~{(csvPageIndex + 1) * 5})</span>
                    <Button variant="secondary" onClick={() => goToCsvPage(csvPageIndex + 1)} disabled={csvPageIndex === csvPages.length - 1}>▶</Button>
                    <Button variant="dark" onClick={handleDownloadAllCsvPagesPngs}>🗂️ 전체 페이지 PNG 다운로드</Button>
                  </div>
                )}

                {/* 50x50 캔버스 영역 */}
                <div className="flex-1 p-10 flex justify-center items-start" onMouseUp={handleMouseUp}>
                  <div className="bg-white shadow-2xl border border-gray-200 relative" style={{ display: 'grid', gridTemplateColumns: 'repeat(50, 14px)', width: '700px' }}>

                    {/* 이전 장 실루엣 레이어 (참고용, 클릭 통과) */}
                    {stackedFloors.length > 0 && (
                      <div className="absolute inset-0 pointer-events-none" style={{ display: 'grid', gridTemplateColumns: 'repeat(50, 14px)' }}>
                        {stackedFloors[stackedFloors.length - 1].grid.map((row, rIdx) =>
                          row.map((cell, cIdx) => (
                            <div key={`ghost-${rIdx}-${cIdx}`} className="w-[14px] h-[14px]"
                              style={{
                                backgroundColor: (cell >= 1 && cell <= 5) ? FLOOR_COLORS[cell].hex : 'transparent',
                                opacity: (cell >= 1 && cell <= 5) ? 0.25 : 0,
                              }} />
                          ))
                        )}
                      </div>
                    )}

                    {/* 현재 페이지 그리기 레이어 */}
                    {grid.map((row, rIdx) => row.map((cell, cIdx) => {
                      const inPreview = isInsidePreview(rIdx, cIdx);
                      let bgColor = getCellColorClass(cell);
                      if (inPreview) {
                        if (mode === 'wall_rect' || mode === 'floor_rect') bgColor = FLOOR_COLORS[paintColor].tw + '/60';
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
                    <p className="text-xs text-gray-500 mb-3">버튼으로 90도씩 빠르게 돌리거나, 오른쪽 미리보기의 기즈모를 드래그해서 자유롭게 맞춰보세요. 이 화면이 곧 최종 모습은 아니고, <b>다운로드 시 여기서 오른쪽으로 225도가 추가로 더 돌아간 상태</b>로 엑셀이 만들어집니다 (Unity 좌표계 보정용). 90도로 안 맞는 애매한 각도는 기즈모로 맞춘 뒤 <b>"📍 이 각도를 0점으로 저장"</b>을 눌러두면 초기화/90도 버튼이 그 각도를 기준으로 움직여요.</p>

                    <div className="flex flex-wrap items-center gap-2 mb-4">
                      <Button variant="secondary" onClick={() => rotateBy90('x', 1)}>X축 +90°</Button>
                      <Button variant="secondary" onClick={() => rotateBy90('x', -1)}>X축 -90°</Button>
                      <Button variant="secondary" onClick={() => rotateBy90('y', 1)}>Y축 +90°</Button>
                      <Button variant="secondary" onClick={() => rotateBy90('y', -1)}>Y축 -90°</Button>
                      <Button variant="secondary" onClick={() => setRotationQuat(baseRotationQuat)}>↺ 초기화 (저장된 0점으로)</Button>
                    </div>

                    <div className="flex items-center gap-2 mb-4">
                      <Button variant="dark" onClick={handleSetZeroPoint}>📍 이 각도를 0점으로 저장</Button>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <Button variant="secondary" onClick={handleDownloadOriginal}>📥 원본 다운로드</Button>
                      <Button variant="primary" onClick={handleDownloadEdited}>✅ 편집본(화면+225°) 다운로드</Button>
                      <Button variant="dark" onClick={handleDownloadFloorPagesPngs}>🗂️ 층별 PNG 분할 다운로드 (5층씩)</Button>
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
              grid={null}
              data={editorTab === 'grid' ? allStackedBlocks : (editorTab === 'photo' ? extracted3DData : null)}
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