import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import CryptoJS from 'crypto-js';

// --- [로직 파트] ---
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

const formatID = (val) => {
  const absVal = Math.round(Math.abs(val));
  const sign = val < 0 ? "-" : "0";
  return sign + absVal.toString().padStart(3, '0');
};

const exportToCSV = (grid) => {
  let csvContent = "BlockID,PosX,PosY,PosZ,Stress,RiskLevel,Prescription,Material,Tensile,Compressive,Tool,Type\n";
  grid.forEach((row, rIdx) => {
    row.forEach((cell, cIdx) => {
      if (cell !== 0) {
        const xCoord = cIdx * 3 + 1.5;
        const zCoord = rIdx * 3 + 1.5;
        const idX = formatID(xCoord * 10);
        const idZ = formatID(zCoord * 10);
        if (cell === 1) {
          for (let n = 1; n <= 5; n++) {
            const yCoord = n * 3 - 1.5;
            const idY = formatID(yCoord * 10);
            const blockID = `${idX}_${idZ}_${idY}`;
            csvContent += `${blockID},${xCoord.toFixed(2)},${yCoord.toFixed(2)},${zCoord.toFixed(2)},0.00,Safe,N,Default,0.0,0.0,Existing,Wall\n`;
          }
        } else if (cell === 2) {
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

// 블루프린트 카드 컴포넌트
const BlueprintCard = ({ bp }) => (
  <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-xl transition-all group">
    <div className="h-40 bg-gray-100 flex items-center justify-center text-4xl group-hover:bg-blue-50 transition-colors">🏗️</div>
    <div className="p-5">
      <div className="font-bold text-lg text-gray-900">{bp.name}</div>
      <div className="flex justify-between items-center mt-2">
        <span className="text-sm text-blue-600 font-bold">{bp.author}</span>
        <span className="text-xs text-gray-400">{new Date(bp.created_at).toLocaleDateString()}</span>
      </div>
    </div>
  </div>
);

export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('auth');
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ id: '', pw: '', email: '' });
  const [grid, setGrid] = useState(Array(50).fill().map(() => Array(50).fill(0)));
  const [mode, setMode] = useState('wall_rect');
  const [isDrawing, setIsDrawing] = useState(false);
  const [history, setHistory] = useState([]);
  const [startPos, setStartPos] = useState(null);
  const [currentPos, setCurrentPos] = useState(null);
  const [blueprints, setBlueprints] = useState({ mine: [], others: [] });
  const [silhouette, setSilhouette] = useState(null); // PNG 이미지 URL (배경 오버레이용)
  const [silhouetteOpacity, setSilhouetteOpacity] = useState(0.35); // 실루엣 투명도

  const hashPw = (pw) => CryptoJS.SHA256(pw).toString();

  const handleSignUp = async () => {
    const { error } = await supabase.from('users').insert([{
      username: authForm.id, password_hash: hashPw(authForm.pw), email: authForm.email
    }]);
    if (error) alert("이미 존재하는 ID입니다.");
    else { alert("계정이 생성되었습니다! 로그인해주세요."); setAuthMode('login'); }
  };

  const handleLogin = async () => {
    const { data, error } = await supabase.from('users')
      .select('*').eq('username', authForm.id).eq('password_hash', hashPw(authForm.pw)).single();
    if (data) { setUser(data); setView('dashboard'); }
    else alert("아이디 혹은 비밀번호가 틀립니다.");
  };

  const fetchBlueprints = async () => {
    const { data: allData } = await supabase
      .from('blueprints')
      .select('*')
      .order('created_at', { ascending: false });

    const all = allData || [];
    setBlueprints({
      mine: all.filter(bp => bp.user_id === user.id),
      others: all.filter(bp => bp.user_id !== user.id),
    });
  };

  useEffect(() => { if (view === 'dashboard' && user) fetchBlueprints(); }, [view]);

  const uploadToShowcase = async () => {
    if (!user) return;
    const title = prompt("작품 이름을 지어주세요!", "새 프로젝트");
    if (!title) return;
    const { error } = await supabase.from('blueprints').insert([{
      name: title, grid_data: grid, user_id: user.id, author: user.username
    }]);
    if (!error) { alert("업로드 완료!"); setView('dashboard'); }
    else alert("에러: " + error.message);
  };

  const saveHistory = () => setHistory(prev => [...prev, JSON.parse(JSON.stringify(grid))].slice(-20));
  const undo = () => { if (history.length === 0) return; setGrid(history[history.length - 1]); setHistory(prev => prev.slice(0, -1)); };

  const handleMouseDown = (r, c) => {
    if (mode === 'wall_fill') {
      saveHistory();
      setGrid(prev => floodFill(prev, r, c, 1));
      return;
    }
    if (mode === 'floor_fill') {
      saveHistory();
      setGrid(prev => floodFill(prev, r, c, 2));
      return;
    }
    saveHistory();
    setIsDrawing(true); setStartPos({ r, c }); setCurrentPos({ r, c });
  };

  const handleMouseEnter = (r, c) => { if (isDrawing) setCurrentPos({ r, c }); };

  const handleMouseUp = () => {
    if (isDrawing && mode.includes('rect') && startPos && currentPos) {
      const newGrid = [...grid];
      const startR = Math.min(startPos.r, currentPos.r), endR = Math.max(startPos.r, currentPos.r);
      const startC = Math.min(startPos.c, currentPos.c), endC = Math.max(startPos.c, currentPos.c);
      for (let r = startR; r <= endR; r++) {
        for (let c = startC; c <= endC; c++) {
          newGrid[r][c] = mode === 'wall_rect' ? 1 : mode === 'floor_rect' ? 2 : 0;
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

  // 1️⃣ [Login View]
  if (view === 'auth') {
    return (
      <div className="h-screen w-screen bg-gray-50 flex items-center justify-center font-sans">
        <div className="bg-white p-10 rounded-2xl shadow-xl w-96 border border-gray-100">
          <div className="text-blue-600 text-center mb-8">
            <h1 className="text-3xl font-black tracking-tight">CAD SYSTEM</h1>
            <p className="text-sm text-gray-400 mt-1 font-medium italic">Login to your account</p>
          </div>
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 ml-1">ID</label>
              <input className="w-full bg-gray-50 border border-gray-200 p-3 rounded-lg outline-none focus:border-blue-500 transition-all"
                onChange={e => setAuthForm({...authForm, id: e.target.value})} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 ml-1">PASSWORD</label>
              <input type="password" className="w-full bg-gray-50 border border-gray-200 p-3 rounded-lg outline-none focus:border-blue-500 transition-all"
                onChange={e => setAuthForm({...authForm, pw: e.target.value})} />
            </div>
            {authMode === 'signup' && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 ml-1">EMAIL</label>
                <input className="w-full bg-gray-50 border border-gray-200 p-3 rounded-lg outline-none focus:border-blue-500 transition-all"
                  onChange={e => setAuthForm({...authForm, email: e.target.value})} />
              </div>
            )}
            <button onClick={authMode === 'login' ? handleLogin : handleSignUp}
              className="w-full bg-blue-600 text-white p-4 rounded-lg font-bold hover:bg-blue-700 shadow-lg shadow-blue-100 transition-all mt-4">
              {authMode === 'login' ? '로그인' : '회원가입 하기'}
            </button>
            <p className="text-sm text-center text-gray-400 cursor-pointer hover:text-blue-500"
              onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}>
              {authMode === 'login' ? '새 계정 만들기' : '이미 계정이 있나요? 로그인'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 2️⃣ [Dashboard View]
  if (view === 'dashboard') {
    return (
      <div className="flex h-screen bg-gray-50 text-gray-800 font-sans">
        <aside className="w-64 bg-white border-r border-gray-200 p-6 flex flex-col">
          <div className="text-2xl font-black text-blue-600 mb-10">DESIGN CENTER</div>
          <div className="bg-blue-50 p-4 rounded-xl mb-10">
            <div className="text-xs font-bold text-blue-400 uppercase mb-1">Signed in as</div>
            <div className="font-bold text-blue-700">{user?.username}</div>
          </div>
          <nav className="flex-1 space-y-2">
            <button className="w-full text-left p-3 bg-blue-600 text-white rounded-lg font-bold shadow-md shadow-blue-100">🏠 대시보드</button>
            <button onClick={() => setView('editor')} className="w-full text-left p-3 hover:bg-gray-100 rounded-lg text-gray-600 font-medium transition-colors">📐 새 도면 그리기</button>
          </nav>
          <button onClick={() => { setUser(null); setView('auth'); }} className="p-3 text-gray-400 font-bold hover:text-red-500 transition-colors">로그아웃</button>
        </aside>

        <main className="flex-1 p-10 overflow-y-auto">
          {/* 내 작품 섹션 */}
          <header className="flex justify-between items-center mb-6">
            <h2 className="text-3xl font-black text-gray-900">내 구조물</h2>
            <button onClick={() => setView('editor')} className="px-6 py-3 bg-blue-600 text-white rounded-full font-bold hover:bg-blue-700 shadow-lg shadow-blue-100 transition-all">새 프로젝트 시작</button>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            {blueprints.mine.length === 0 ? (
              <div className="col-span-3 h-32 bg-gray-100 rounded-2xl flex items-center justify-center text-gray-400 font-medium">
                아직 저장된 도면이 없습니다
              </div>
            ) : (
              blueprints.mine.map(bp => <BlueprintCard key={bp.id} bp={bp} />)
            )}
          </div>

          {/* 전체 전시관 섹션 */}
          <div className="border-t border-gray-200 pt-10">
            <h2 className="text-2xl font-black text-gray-900 mb-6">🌐 전체 전시관</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {blueprints.others.length === 0 ? (
                <div className="col-span-3 h-32 bg-gray-100 rounded-2xl flex items-center justify-center text-gray-400 font-medium">
                  다른 사용자의 도면이 없습니다
                </div>
              ) : (
                blueprints.others.map(bp => <BlueprintCard key={bp.id} bp={bp} />)
              )}
            </div>
          </div>
        </main>
      </div>
    );
  }

  // 3️⃣ [Editor View]
  return (
    <div className="h-screen w-screen bg-gray-50 flex flex-col overflow-hidden select-none">
      <header className="p-4 bg-white border-b border-gray-200 flex justify-between items-center shadow-sm z-10">
        <div className="flex items-center space-x-3">
          <button onClick={() => setView('dashboard')} className="p-2 text-gray-400 hover:text-blue-600 font-bold">◀ 뒤로가기</button>
          <div className="h-6 w-px bg-gray-200 mx-2" />
          <div className="flex bg-gray-100 p-1 rounded-lg">
            <button onClick={() => setMode('wall_rect')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${mode==='wall_rect'?'bg-white text-blue-600 shadow-sm':'text-gray-500'}`}>🧱 벽 그리기</button>
            <button onClick={() => setMode('wall_fill')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${mode==='wall_fill'?'bg-white text-blue-600 shadow-sm':'text-gray-500'}`}>🪣 벽 채우기</button>
            <button onClick={() => setMode('floor_rect')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${mode==='floor_rect'?'bg-white text-blue-600 shadow-sm':'text-gray-500'}`}>🏁 바닥 그리기</button>
            <button onClick={() => setMode('floor_fill')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${mode==='floor_fill'?'bg-white text-orange-500 shadow-sm':'text-gray-500'}`}>🪣 바닥 채우기</button>
            <button onClick={() => setMode('rect_eraser')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${mode==='rect_eraser'?'bg-red-50 text-red-500 shadow-sm':'text-gray-500'}`}>🧼 지우개</button>
          </div>
          <button onClick={undo} className="text-xs font-bold px-3 py-1.5 bg-white border border-gray-200 rounded-md hover:bg-gray-50">↩ 되돌리기</button>
          <label className="cursor-pointer px-3 py-1.5 bg-white border border-blue-200 text-blue-600 rounded-md text-xs font-bold hover:bg-blue-50">
            📂 PNG 불러오기
            <input type="file" accept="image/*" className="hidden" onChange={e => {
              const file = e.target.files[0];
              if (file) {
                if (silhouette) URL.revokeObjectURL(silhouette);
                setSilhouette(URL.createObjectURL(file));
              }
              e.target.value = '';
            }} />
          </label>
        </div>
        <div className="flex space-x-2">
          <button onClick={uploadToShowcase} className="px-5 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 shadow-md transition-all">🌐 클라우드 저장</button>
          <button onClick={() => exportToPNG(grid)} className="px-5 py-2 bg-gray-800 text-white rounded-lg font-bold hover:bg-black transition-all">PNG 저장</button>
          <button onClick={() => exportToCSV(grid)} className="px-5 py-2 bg-gray-100 text-gray-700 border border-gray-200 rounded-lg font-bold hover:bg-gray-200 transition-all">CSV 내보내기</button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-12 flex flex-col justify-start items-center bg-gray-50" onMouseUp={handleMouseUp}>
        {silhouette && (
          <div className="mb-4 flex items-center gap-3 bg-blue-50 border border-blue-200 px-5 py-2.5 rounded-xl shadow-sm">
            <span className="text-xs font-bold text-blue-600">🖼️ 도면 참고선 표시 중 — 위에 자유롭게 트레이싱하세요</span>
            <span className="text-xs text-blue-400 font-medium">투명도</span>
            <input type="range" min="0.1" max="0.9" step="0.05" value={silhouetteOpacity}
              onChange={e => setSilhouetteOpacity(parseFloat(e.target.value))}
              className="w-24 accent-blue-500" />
            <button onClick={() => { URL.revokeObjectURL(silhouette); setSilhouette(null); }}
              className="px-3 py-1 bg-white border border-blue-200 text-blue-500 rounded-lg text-xs font-bold hover:bg-blue-100">✕ 숨기기</button>
          </div>
        )}
        <div className="relative bg-white shadow-2xl border border-gray-200"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(50, 14px)', width: '700px' }}>
          {silhouette && (
            <img
              src={silhouette}
              alt="silhouette"
              style={{
                position: 'absolute', top: 0, left: 0,
                width: '100%', height: '100%',
                opacity: silhouetteOpacity,
                pointerEvents: 'none',
                objectFit: 'fill',
                zIndex: 5,
              }}
            />
          )}
          {grid.map((row, rIdx) => row.map((cell, cIdx) => {
            const inPreview = isInsidePreview(rIdx, cIdx);
            let bgColor = cell === 1 ? '#000000' : cell === 2 ? '#D1D5DB' : '#FFFFFF';
            let overlayStyle = {};
            if (inPreview) {
              overlayStyle = mode === 'wall_rect'
                ? { backgroundColor: 'rgba(59,130,246,0.5)' }
                : mode === 'floor_rect'
                ? { backgroundColor: 'rgba(251,146,60,0.5)' }
                : { backgroundColor: 'rgba(248,113,113,0.5)' };
            }
            return (
              <div
                key={`${rIdx}-${cIdx}`}
                onMouseDown={() => handleMouseDown(rIdx, cIdx)}
                onMouseEnter={() => handleMouseEnter(rIdx, cIdx)}
            style={{
                width: 14, height: 14,
                backgroundColor: cell === 0 ? 'transparent' : bgColor,
                border: '0.1px solid rgba(243,244,246,0.5)',
                boxSizing: 'border-box',
                position: 'relative', zIndex: 20,
                ...overlayStyle
              }}
              />
            );
          }))}
        </div>
      </div>
    </div>
  );
}