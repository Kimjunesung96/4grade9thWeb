import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { hashPw } from './utils/cadUtils';
import AuthView from './views/AuthView';
import DashboardView from './views/DashboardView';
import EditorView from './views/EditorView';

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

  const handleSignUp = async () => {
    const { error } = await supabase.from('users').insert([{ username: authForm.id, password_hash: hashPw(authForm.pw), email: authForm.email }]);
    if (error) alert("이미 존재하는 ID입니다.");
    else { alert("계정이 생성되었습니다! 로그인해주세요."); setAuthMode('login'); }
  };

  const handleLogin = async () => {
    const { data } = await supabase.from('users').select('*').eq('username', authForm.id).eq('password_hash', hashPw(authForm.pw)).single();
    if (data) { setUser(data); setView('dashboard'); }
    else alert("아이디 혹은 비밀번호가 틀립니다.");
  };

  const fetchBlueprints = async () => {
    const { data: allData } = await supabase.from('blueprints').select('*').order('created_at', { ascending: false });
    const all = allData || [];
    setBlueprints({ mine: all.filter(bp => bp.user_id === user?.id), others: all.filter(bp => bp.user_id !== user?.id) });
  };

  useEffect(() => { if (view === 'dashboard' && user) fetchBlueprints(); }, [view, user]);

  const uploadToShowcase = async () => {
    if (!user) return;
    const title = prompt("작품 이름을 지어주세요!", "새 프로젝트");
    if (!title) return;
    const { error } = await supabase.from('blueprints').insert([{ name: title, grid_data: grid, user_id: user.id, author: user.username }]);
    if (!error) { alert("업로드 완료!"); setView('dashboard'); }
    else alert("에러: " + error.message);
  };

  const saveHistory = () => setHistory(prev => [...prev, JSON.parse(JSON.stringify(grid))].slice(-20));
  const undo = () => { if (history.length === 0) return;
  setGrid(history[history.length - 1]); setHistory(prev => prev.slice(0, -1)); };
  const handleMouseDown = (r, c) => { saveHistory(); setIsDrawing(true);
  setStartPos({ r, c }); setCurrentPos({ r, c }); };
  const handleMouseEnter = (r, c) => { if (isDrawing) setCurrentPos({ r, c });
  };
  
  const handleMouseUp = () => {
    if (isDrawing && mode.includes('rect') && startPos && currentPos) {
      const newGrid = [...grid];
      const startR = Math.min(startPos.r, currentPos.r), endR = Math.max(startPos.r, currentPos.r);
      const startC = Math.min(startPos.c, currentPos.c), endC = Math.max(startPos.c, currentPos.c);
      for (let r = startR; r <= endR; r++) {
        for (let c = startC; c <= endC; c++) { newGrid[r][c] = mode === 'wall_rect' ?
        1 : mode === 'floor_rect' ? 2 : 0; }
      }
      setGrid(newGrid);
    }
    setIsDrawing(false); setStartPos(null); setCurrentPos(null);
  };

  const isInsidePreview = (r, c) => {
    if (!isDrawing || !startPos || !currentPos || !mode.includes('rect')) return false;
    return r >= Math.min(startPos.r, currentPos.r) && r <= Math.max(startPos.r, currentPos.r) && c >= Math.min(startPos.c, currentPos.c) && c <= Math.max(startPos.c, currentPos.c);
  };

  return (
    <>
      {view === 'auth' && <AuthView authMode={authMode} setAuthMode={setAuthMode} authForm={authForm} setAuthForm={setAuthForm} handleLogin={handleLogin} handleSignUp={handleSignUp} />}
      {view === 'dashboard' && (
        <DashboardView 
          user={user} 
          blueprints={blueprints} 
          setView={setView} 
          setUser={setUser} 
          onSelectBlueprint={(bp) => {
            setGrid(bp.grid_data || Array(50).fill().map(() => Array(50).fill(0)));
            setHistory([]);
            setView('editor');
          }} 
        />
      )}
      {view === 'editor' && <EditorView grid={grid} setGrid={setGrid} mode={mode} setMode={setMode} setView={setView} undo={undo} saveHistory={saveHistory} uploadToShowcase={uploadToShowcase} isInsidePreview={isInsidePreview} handleMouseDown={handleMouseDown} handleMouseEnter={handleMouseEnter} handleMouseUp={handleMouseUp} />}
    </>
  );
}