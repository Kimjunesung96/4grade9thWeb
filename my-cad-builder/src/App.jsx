import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient'; // 🎯 슈퍼베이스 연결 자재 반입

/**
 * 🌊 플러드 필(Flood Fill) 알고리즘
 */
const floodFill = (grid, r, c, replacementVal) => {
  const targetVal = grid[r][c];
  if (targetVal === replacementVal) return grid;
  const newGrid = JSON.parse(JSON.stringify(grid));
  const stack = [[r, c]];
  while (stack.length > 0) {
    const [currR, currC] = stack.pop();
    if (currR >= 0 && currR < 50 && currC >= 0 && currC < 50 && newGrid[currR][currC] === targetVal) {
      newGrid[currR][currC] = replacementVal;
      stack.push([currR + 1, currC], [currR - 1, currC], [currR, currC + 1], [currR, currC - 1]);
    }
  }
  return newGrid;
};

/**
 * 🆔 유니티용 ID 포맷터
 */
const formatID = (val) => {
  const absVal = Math.round(Math.abs(val));
  const sign = val < 0 ? "-" : "0";
  return sign + absVal.toString().padStart(3, '0');
};

/**
 * 💾 1. 유니티용 CSV 저장
 */
const exportToCSV = (grid) => {
  let csvContent = "BlockID,PosX,PosY,PosZ,Stress,RiskLevel,Prescription,Material,Tensile,Compressive,Tool,Type\n";
  grid.forEach((row, rIdx) => {
    row.forEach((cell, cIdx) => {
      if (cell !== 0) {
        const xCoord = cIdx * 3 + 1.5; 
        const zCoord = rIdx * 3 + 1.5;
        const idX = formatID(xCoord * 10); 
        const idZ = formatID(zCoord * 10);

        if (cell === 1) { // 🧱 벽 - 5단 적층
          for (let n = 1; n <= 5; n++) {
            const yCoord = n * 3 - 1.5; 
            const idY = formatID(yCoord * 10);
            const blockID = `${idX}_${idZ}_${idY}`;
            csvContent += `${blockID},${xCoord.toFixed(2)},${yCoord.toFixed(2)},${zCoord.toFixed(2)},0.00,Safe,N,Default,0.0,0.0,Existing,Wall\n`;
          }
        } else if (cell === 2) { // 🏁 바닥 - 1단
          const yCoord = 1.5;
          const idY = formatID(15);
          const blockID = `${idX}_${idZ}_${idY}`;
          csvContent += `${blockID},${xCoord.toFixed(2)},${yCoord.toFixed(2)},${zCoord.toFixed(2)},0.00,Safe,N,Default,0.0,0.0,Existing,Floor\n`;
        }
      }
    });
  });
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `blueprint_final.csv`;
  link.click();
};

/**
 * 🖼️ 2. 정밀 PNG 저장
 */
const exportToPNG = (grid) => {
  const cellSize = 10;
  const canvas = document.createElement('canvas');
  canvas.width = 50 * cellSize; canvas.height = 50 * cellSize;
  const ctx = canvas.getContext('2d');
  grid.forEach((row, rIdx) => {
    row.forEach((cell, cIdx) => {
      if (cell === 1) ctx.fillStyle = '#000000';
      else if (cell === 2) ctx.fillStyle = '#D2D2D2';
      else ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(cIdx * cellSize, rIdx * cellSize, cellSize, cellSize);
    });
  });
  const link = document.createElement('a');
  link.download = `blueprint_draw.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
};

/**
 * 🖼️ PNG → 그리드 변환 로직
 */
const importPNGToGrid = (file, callback) => {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 50; canvas.height = 50;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, 50, 50);
    const imageData = ctx.getImageData(0, 0, 50, 50).data;
    const newGrid = Array(50).fill(null).map(() => Array(50).fill(0));
    for (let r = 0; r < 50; r++) {
      for (let c = 0; c < 50; c++) {
        const idx = (r * 50 + c) * 4;
        const brightness = (imageData[idx] + imageData[idx+1] + imageData[idx+2]) / 3;
        if (brightness < 128) newGrid[r][c] = 1;
      }
    }
    URL.revokeObjectURL(url);
    callback(newGrid);
  };
  img.src = url;
};

export default function App() {
  const [view, setView] = useState('dashboard');
  const [grid, setGrid] = useState(Array(50).fill().map(() => Array(50).fill(0)));
  const [mode, setMode] = useState('wall_rect'); 
  const [isDrawing, setIsDrawing] = useState(false);
  const [history, setHistory] = useState([]);
  const [startPos, setStartPos] = useState(null);
  const [currentPos, setCurrentPos] = useState(null);
  const [bgImage, setBgImage] = useState(null);     
  const [showBg, setShowBg] = useState(true);

  // 🚀 클라우드 자랑하기 (Supabase 업로드)
  const uploadToShowcase = async () => {
    const title = prompt("전시할 작품의 이름을 지어주세요!", "미래도시 프로젝트 #1");
    if (!title) return;

    try {
      const { data, error } = await supabase
        .from('blueprints')
        .insert([
          { 
            name: title, 
            grid_data: grid, 
            thumbnail_url: "" 
          }
        ]);

      if (error) throw error;
      alert("🚀 온라인 전시관에 작품이 게시되었습니다!");
    } catch (error) {
      alert("❌ 업로드 실패: " + error.message);
    }
  };

  const saveHistory = () => {
    setHistory((prev) => [...prev, JSON.parse(JSON.stringify(grid))].slice(-20));
  };

  const undo = () => {
    if (history.length === 0) return;
    setGrid(history[history.length - 1]);
    setHistory((prev) => prev.slice(0, -1));
  };

  const handleImportPNG = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setBgImage(url);
    setShowBg(true);
    importPNGToGrid(file, (newGrid) => {
      saveHistory();
      setGrid(newGrid);
    });
    e.target.value = '';
  };

  const handleMouseDown = (r, c) => {
    saveHistory();
    setIsDrawing(true);
    setStartPos({ r, c });
    setCurrentPos({ r, c });
    if (mode === 'fill_wall' || mode === 'fill_floor') {
      const val = mode === 'fill_wall' ? 1 : 2;
      setGrid(floodFill(grid, r, c, val));
      setIsDrawing(false);
    }
  };

  const handleMouseEnter = (r, c) => { if (isDrawing) setCurrentPos({ r, c }); };

  const handleMouseUp = () => {
    if (isDrawing && mode.includes('rect') && startPos && currentPos) {
      const newGrid = [...grid];
      const startR = Math.min(startPos.r, currentPos.r), endR = Math.max(startPos.r, currentPos.r);
      const startC = Math.min(startPos.c, currentPos.c), endC = Math.max(startPos.c, currentPos.c);
      for (let r = startR; r <= endR; r++) {
        for (let c = startC; c <= endC; c++) {
          if (mode === 'wall_rect') newGrid[r][c] = 1;
          else if (mode === 'floor_rect') newGrid[r][c] = 2;
          else if (mode === 'rect_eraser') newGrid[r][c] = 0;
        }
      }
      setGrid(newGrid);
    }
    setIsDrawing(false); setStartPos(null); setCurrentPos(null);
  };

  const isInsidePreview = (r, c) => {
    if (!isDrawing || !startPos || !currentPos || !mode.includes('rect')) return false;
    const startR = Math.min(startPos.r, currentPos.r), endR = Math.max(startPos.r, currentPos.r);
    const startC = Math.min(startPos.c, currentPos.c), endC = Math.max(startPos.c, currentPos.c);
    return r >= startR && r <= endR && c >= startC && c <= endC;
  };

  useEffect(() => {
    const handleKeyDown = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'z') undo(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [history]);

  // 🧱 [VIEW 1] 에디터 화면
  if (view === 'editor') {
    return (
      <div className="h-screen w-screen bg-gray-100 flex flex-col overflow-hidden text-gray-800 select-none">
        <header className="p-4 bg-white border-b flex justify-between items-center shadow-sm">
          <div className="flex items-center space-x-3">
            <button onClick={() => setView('dashboard')} className="text-gray-400 hover:text-black font-bold mr-2">◀ BACK</button>
            <div className="flex bg-gray-100 p-1 rounded-lg border">
              <button onClick={() => setMode('wall_rect')} className={`px-3 py-1.5 rounded-md text-xs font-bold ${mode === 'wall_rect' ? 'bg-black text-white' : 'text-gray-500'}`}>🧱 벽(Rect)</button>
              <button onClick={() => setMode('floor_rect')} className={`px-3 py-1.5 rounded-md text-xs font-bold ${mode === 'floor_rect' ? 'bg-gray-400 text-white' : 'text-gray-500'}`}>🏁 바닥(Rect)</button>
            </div>
            <div className="flex bg-gray-100 p-1 rounded-lg border">
              <button onClick={() => setMode('fill_wall')} className={`px-3 py-1.5 rounded-md text-xs font-bold ${mode === 'fill_wall' ? 'bg-orange-600 text-white' : 'text-gray-500'}`}>🪣 벽채우기</button>
              <button onClick={() => setMode('fill_floor')} className={`px-3 py-1.5 rounded-md text-xs font-bold ${mode === 'fill_floor' ? 'bg-orange-400 text-white' : 'text-gray-500'}`}>🪣 바닥채우기</button>
            </div>
            <button onClick={() => setMode('rect_eraser')} className={`px-3 py-1.5 rounded-md text-xs font-bold border ${mode === 'rect_eraser' ? 'bg-red-500 text-white border-red-500' : 'border-gray-300 text-gray-500'}`}>🧼 지우개</button>
            <button onClick={undo} className="text-xs font-bold px-3 py-1.5 border border-gray-300 rounded-md hover:bg-white active:bg-gray-200">↩ Undo</button>
            <label className="cursor-pointer px-3 py-1.5 rounded-md text-xs font-bold border border-purple-400 text-purple-600 hover:bg-purple-50">
              📂 PNG 불러오기
              <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={handleImportPNG} />
            </label>
            {bgImage && (
              <button onClick={() => setShowBg(v => !v)} className={`px-3 py-1.5 rounded-md text-xs font-bold border ${showBg ? 'bg-purple-500 text-white' : 'text-gray-500'}`}>
                {showBg ? '🖼️ 오버레이 ON' : '🖼️ 오버레이 OFF'}
              </button>
            )}
          </div>
          <div className="flex space-x-2">
            {/* 🚀 자랑하기 버튼 */}
            <button onClick={uploadToShowcase} className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg font-bold shadow-md hover:scale-105 transition-transform">🌐 클라우드 자랑하기</button>
            <button onClick={() => exportToPNG(grid)} className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-bold shadow-md hover:bg-emerald-700">PNG 저장</button>
            <button onClick={() => exportToCSV(grid)} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold shadow-md hover:bg-blue-700">CSV 저장</button>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-12 flex justify-center items-start bg-gray-100" onMouseUp={handleMouseUp}>
          <div className="relative" style={{ width: '700px', height: '700px' }}>
            {bgImage && showBg && (
              <img src={bgImage} alt="overlay" style={{ position: 'absolute', top: 0, left: 0, width: '700px', height: '700px', opacity: 0.35, pointerEvents: 'none', zIndex: 10, imageRendering: 'pixelated' }} />
            )}
            <div className="bg-white shadow-2xl border border-gray-300" style={{ display: 'grid', gridTemplateColumns: 'repeat(50, 14px)', width: '700px' }}>
              {grid.map((row, rIdx) => row.map((cell, cIdx) => {
                const inPreview = isInsidePreview(rIdx, cIdx);
                let bgColor = cell === 1 ? "bg-black" : cell === 2 ? "bg-gray-300" : "bg-white";
                if (inPreview) bgColor = mode === 'wall_rect' ? "bg-black/50" : mode === 'floor_rect' ? "bg-gray-400/50" : "bg-red-200";
                return (
                  <div key={`${rIdx}-${cIdx}`} onMouseDown={() => handleMouseDown(rIdx, cIdx)} onMouseEnter={() => handleMouseEnter(rIdx, cIdx)} className={`w-[14px] h-[14px] border-[0.1px] border-gray-100 ${bgColor}`} />
                );
              }))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 🏠 [VIEW 2] 대시보드
  return (
    <div className="flex h-screen bg-gray-50 text-gray-800">
      <aside className="w-64 bg-white border-r flex flex-col">
        <div className="p-6 font-black text-2xl text-blue-600 border-b tracking-tighter">🏗️ MY CAD</div>
        <nav className="flex-col p-4 space-y-2 font-semibold text-gray-700">
          <button className="w-full text-left p-3 bg-blue-50 text-blue-600 rounded-lg">🏠 홈</button>
          <button className="w-full text-left p-3 hover:bg-gray-100 rounded-lg">📐 디자인</button>
          <button className="w-full text-left p-3 hover:bg-gray-100 rounded-lg">📁 컬렉션</button>
        </nav>
      </aside>

      <main className="flex-1 p-8 overflow-y-auto">
        <header className="flex justify-end mb-8">
          <button onClick={() => setView('editor')} className="px-12 py-4 bg-black text-white rounded-full font-bold text-xl shadow-xl hover:scale-105 transition-transform active:scale-95">
            START 📐
          </button>
        </header>
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6">🏢 내 구조물 보관소</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="h-56 bg-white border rounded-xl shadow-sm hover:shadow-lg transition cursor-pointer flex flex-col overflow-hidden group">
              <div className="flex-1 bg-gray-200 flex items-center justify-center text-gray-400 group-hover:bg-gray-300 transition-colors">3D PREVIEW</div>
              <div className="p-4 font-bold">테스트 빌딩 #1</div>
            </div>
          </div>
        </section>
        <section>
          <h2 className="text-2xl font-bold mb-6">📝 집 설계도면 공정</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div onClick={() => setView('editor')} className="h-40 bg-blue-50 border-2 border-dashed border-blue-200 rounded-xl hover:bg-blue-100 transition cursor-pointer flex flex-col items-center justify-center text-blue-600">
              <span className="text-3xl mb-2">➕</span>
              <span className="font-bold">새 50x50 도면 그리기</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}