import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import CryptoJS from 'crypto-js';

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
  // 👤 배틀넷 유저 세션
  const [user, setUser] = useState(null);
  const [view, setView] = useState('auth'); // auth, dashboard, editor
  const [authMode, setAuthMode] = useState('login'); 
  const [authForm, setAuthForm] = useState({ id: '', pw: '', email: '' });

  // 📐 에디터 상태
  const [grid, setGrid] = useState(Array(50).fill().map(() => Array(50).fill(0)));
  const [mode, setMode] = useState('wall_rect'); 
  const [isDrawing, setIsDrawing] = useState(false);
  const [history, setHistory] = useState([]);
  const [startPos, setStartPos] = useState(null);
  const [currentPos, setCurrentPos] = useState(null);
  const [bgImage, setBgImage] = useState(null);     
  const [showBg, setShowBg] = useState(true);

  // 📁 대시보드 데이터
  const [blueprints, setBlueprints] = useState([]);

  // 🔐 암호화 & 인증 로직
  const hashPw = (pw) => CryptoJS.SHA256(pw).toString();

  const handleSignUp = async () => {
    const { error } = await supabase.from('users').insert([{ 
      username: authForm.id, password_hash: hashPw(authForm.pw), email: authForm.email 
    }]);
    if (error) alert("이미 존재하는 ID입니다.");
    else { alert("Account Created! Please Login."); setAuthMode('login'); }
  };

  const handleLogin = async () => {
    const { data, error } = await supabase.from('users')
      .select('*').eq('username', authForm.id).eq('password_hash', hashPw(authForm.pw)).single();
    if (data) { setUser(data); setView('dashboard'); }
    else alert("아이디 혹은 비밀번호가 틀립니다.");
  };

  const fetchBlueprints = async () => {
    const { data } = await supabase.from('blueprints').select('*').order('created_at', { ascending: false });
    setBlueprints(data || []);
  };

  useEffect(() => { if (view === 'dashboard') fetchBlueprints(); }, [view]);

  // 🚀 클라우드 업로드
  const uploadToShowcase = async () => {
    if (!user) return;
    const title = prompt("작품 이름을 지어주세요!", "New Project");
    if (!title) return;
    const { error } = await supabase.from('blueprints').insert([{ 
      name: title, grid_data: grid, user_id: user.id, author: user.username 
    }]);
    if (!error) { alert("창고에 입고되었습니다!"); setView('dashboard'); }
  };

  // 🎨 그리드 에디터 로직
  const saveHistory = () => setHistory(prev => [...prev, JSON.parse(JSON.stringify(grid))].slice(-20));
  const undo = () => { if (history.length === 0) return; setGrid(history[history.length - 1]); setHistory(prev => prev.slice(0, -1)); };

  const handleMouseDown = (r, c) => {
    saveHistory();
    setIsDrawing(true); setStartPos({ r, c }); setCurrentPos({ r, c });
    if (mode.includes('fill')) {
      setGrid(floodFill(grid, r, c, mode === 'fill_wall' ? 1 : 2));
      setIsDrawing(false);
    }
  };
  // [추가] 마우스가 격자 위를 지나갈 때 실시간 좌표 업데이트
const handleMouseEnter = (r, c) => {
  if (isDrawing) {
    setCurrentPos({ r, c });
  }
};

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

  // 🖥️ [View 0] Battle.net Login
  if (view === 'auth') {
    return (
      <div className="h-screen w-screen bg-black flex items-center justify-center font-mono text-blue-500">
        <div className="border-4 border-blue-900 p-10 bg-gray-900 shadow-[0_0_30px_rgba(0,0,255,0.3)] w-96">
          <h1 className="text-3xl font-black mb-8 tracking-tighter text-center">BATTLE.NET LOGIN</h1>
          <div className="space-y-4">
            <input placeholder="USER ID" className="w-full bg-black border border-blue-900 p-3 outline-none" 
              onChange={e => setAuthForm({...authForm, id: e.target.value})} />
            <input type="password" placeholder="PASSWORD" className="w-full bg-black border border-blue-900 p-3 outline-none" 
              onChange={e => setAuthForm({...authForm, pw: e.target.value})} />
            {authMode === 'signup' && <input placeholder="EMAIL (Optional)" className="w-full bg-black border border-blue-900 p-3 outline-none" 
              onChange={e => setAuthForm({...authForm, email: e.target.value})} />}
            
            {authMode === 'login' ? (
              <>
                <button onClick={handleLogin} className="w-full bg-blue-900 text-white p-3 font-bold hover:bg-blue-700">ENTER GAME</button>
                <p className="text-xs text-center cursor-pointer" onClick={() => setAuthMode('signup')}>CREATE NEW ACCOUNT</p>
              </>
            ) : (
              <>
                <button onClick={handleSignUp} className="w-full bg-green-900 text-white p-3 font-bold hover:bg-green-700">JOIN BATTLE.NET</button>
                <p className="text-xs text-center cursor-pointer" onClick={() => setAuthMode('login')}>BACK TO LOGIN</p>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 🖥️ [View 1] 대시보드
  if (view === 'dashboard') {
    return (
      <div className="flex h-screen bg-gray-950 text-white font-sans">
        <aside className="w-64 border-r border-gray-800 p-6 flex flex-col space-y-4">
          <div className="text-2xl font-black text-blue-500 mb-8 italic">MY CAD CENTER</div>
          <div className="text-sm font-bold text-gray-500 uppercase tracking-widest">User Profile</div>
          <div className="bg-gray-900 p-4 rounded-lg border border-gray-800">
            <div className="font-bold text-blue-400">ID: {user?.username}</div>
            <div className="text-xs text-gray-500 mt-1">Status: Online</div>
          </div>
          <nav className="flex-1 space-y-2 pt-10">
            <button className="w-full text-left p-3 bg-blue-900/20 text-blue-400 rounded-lg font-bold">🏠 Dashboard</button>
            <button onClick={() => setView('editor')} className="w-full text-left p-3 hover:bg-gray-900 rounded-lg text-gray-400">📐 New Blueprint</button>
          </nav>
          <button onClick={() => {setUser(null); setView('auth');}} className="p-3 text-red-500 font-bold hover:bg-red-500/10 rounded-lg">Logout</button>
        </aside>

        <main className="flex-1 p-10 overflow-y-auto">
          <header className="flex justify-between items-center mb-12">
            <h2 className="text-4xl font-black tracking-tighter uppercase">Operations Center</h2>
            <button onClick={() => setView('editor')} className="px-8 py-3 bg-blue-600 rounded-full font-bold shadow-lg hover:scale-105 transition-all">START DESIGNING</button>
          </header>

          <section className="mb-12">
            <h3 className="text-lg font-bold text-gray-500 mb-6 uppercase">Global Archives</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {blueprints.map(bp => (
                <div key={bp.id} className="bg-gray-900 rounded-xl overflow-hidden border border-gray-800 hover:border-blue-500 transition-all cursor-default">
                  <div className="h-40 bg-black flex items-center justify-center text-5xl">🏗️</div>
                  <div className="p-5">
                    <div className="font-black text-xl mb-1">{bp.name}</div>
                    <div className="flex justify-between items-center">
                      <span className="text-blue-500 text-sm font-bold">👤 {bp.author}</span>
                      <span className="text-gray-600 text-[10px]">{new Date(bp.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>
    );
  }

  // 🖥️ [View 2] 에디터 화면
  return (
    <div className="h-screen w-screen bg-gray-100 flex flex-col overflow-hidden select-none">
      <header className="p-4 bg-white border-b flex justify-between items-center shadow-sm">
        <div className="flex items-center space-x-3">
          <button onClick={() => setView('dashboard')} className="font-bold text-gray-400 hover:text-black">◀ BACK</button>
          <div className="flex bg-gray-100 p-1 rounded-lg border">
            <button onClick={() => setMode('wall_rect')} className={`px-3 py-1.5 rounded-md text-xs font-bold ${mode==='wall_rect'?'bg-black text-white':'text-gray-500'}`}>🧱 Wall</button>
            <button onClick={() => setMode('floor_rect')} className={`px-3 py-1.5 rounded-md text-xs font-bold ${mode==='floor_rect'?'bg-gray-400 text-white':'text-gray-500'}`}>🏁 Floor</button>
          </div>
          <button onClick={() => setMode('rect_eraser')} className={`px-3 py-1.5 rounded-md text-xs font-bold border ${mode==='rect_eraser'?'bg-red-500 text-white':'text-gray-500'}`}>🧼 Eraser</button>
          <button onClick={undo} className="text-xs font-bold px-3 py-1.5 border rounded-md">↩ Undo</button>
          <label className="cursor-pointer px-3 py-1.5 rounded-md text-xs font-bold border border-purple-400 text-purple-600">
            📂 Load PNG
            <input type="file" accept="image/*" className="hidden" onChange={e => {
              const file = e.target.files[0]; if(file) importPNGToGrid(file, g => { saveHistory(); setGrid(g); });
            }} />
          </label>
        </div>
        <div className="flex space-x-2">
          <button onClick={uploadToShowcase} className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg font-bold shadow-md">🌐 Share Cloud</button>
          <button onClick={() => exportToPNG(grid)} className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-bold">Export PNG</button>
          <button onClick={() => exportToCSV(grid)} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold">Export CSV</button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-12 flex justify-center items-start bg-gray-100" onMouseUp={handleMouseUp}>
        <div className="bg-white shadow-2xl border border-gray-300 relative" style={{ display: 'grid', gridTemplateColumns: 'repeat(50, 14px)', width: '700px' }}>
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
  );
}