import React from 'react';
import Button from '../components/ui/Button';
import { exportToPNG, exportToCSV, importPNGToGrid } from '../utils/cadUtils';

export default function EditorView({ grid, setGrid, mode, setMode, setView, undo, saveHistory, uploadToShowcase, isInsidePreview, handleMouseDown, handleMouseEnter, handleMouseUp }) {
  return (
    <div className="h-screen w-screen bg-gray-50 flex flex-col overflow-hidden select-none">
      <header className="p-4 bg-white border-b border-gray-200 flex justify-between items-center shadow-sm z-10">
        <div className="flex items-center space-x-3">
          <button onClick={() => setView('dashboard')} className="p-2 text-gray-400 hover:text-blue-600 font-bold">◀ 뒤로가기</button>
          <div className="h-6 w-px bg-gray-200 mx-2" />
          <div className="flex bg-gray-100 p-1 rounded-lg">
            <Button variant={mode === 'wall_rect' ? 'tabActive' : 'tabInactive'} onClick={() => setMode('wall_rect')}>🧱 벽 그리기</Button>
            <Button variant={mode === 'floor_rect' ? 'tabActive' : 'tabInactive'} onClick={() => setMode('floor_rect')}>🏁 바닥 그리기</Button>
            <Button variant={mode === 'rect_eraser' ? 'tabActive' : 'tabInactive'} onClick={() => setMode('rect_eraser')} className={mode === 'rect_eraser' ? '!text-red-500' : ''}>🧼 지우개</Button>
          </div>
          <Button variant="secondary" onClick={undo}>↩ 되돌리기</Button>
          <label className="cursor-pointer px-3 py-2 bg-white border border-blue-200 text-blue-600 rounded-md text-xs font-bold hover:bg-blue-50">
            📂 PNG 불러오기
            <input type="file" accept="image/*" className="hidden" onChange={e => {
              const file = e.target.files[0];
              if (file) importPNGToGrid(file, g => { saveHistory(); setGrid(g); });
            }} />
          </label>
        </div>
        <div className="flex space-x-2">
          <Button variant="primary" onClick={uploadToShowcase}>🌐 클라우드 저장</Button>
          <Button variant="dark" onClick={() => exportToPNG(grid)}>PNG 저장</Button>
          <Button variant="secondary" onClick={() => exportToCSV(grid)}>CSV 내보내기</Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-12 flex justify-center items-start bg-gray-50" onMouseUp={handleMouseUp}>
        <div className="bg-white shadow-2xl border border-gray-200 relative" style={{ display: 'grid', gridTemplateColumns: 'repeat(50, 14px)', width: '700px' }}>
          {grid.map((row, rIdx) => row.map((cell, cIdx) => {
            const inPreview = isInsidePreview(rIdx, cIdx);
            let bgColor = cell === 1 ? "bg-black" : cell === 2 ? "bg-gray-300" : "bg-white";
            if (inPreview) bgColor = mode === 'wall_rect' ? "bg-blue-500/40" : mode === 'floor_rect' ? "bg-blue-300/40" : "bg-red-200";
            return (
              <div key={`${rIdx}-${cIdx}`} onMouseDown={() => handleMouseDown(rIdx, cIdx)} onMouseEnter={() => handleMouseEnter(rIdx, cIdx)}
                className={`w-[14px] h-[14px] border-[0.1px] border-gray-50 ${bgColor} hover:bg-blue-50 transition-colors`} />
            );
          }))}
        </div>
      </div>
    </div>
  );
}