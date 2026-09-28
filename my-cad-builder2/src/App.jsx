// FILE PATH: src/App.jsx
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { hashPw, applyWallBorder, floodFill, getMaxColorUsed, getNextPageBase, exportStackedFloorsToCSV } from './utils/cadUtils';
import Button from './components/ui/Button'; // 🌟 팝업용 버튼 추가
import AuthView from './views/AuthView';
import DashboardView from './views/DashboardView';
import EditorView from './views/EditorView';
import DetailView from './views/DetailView';
import ExploreView from './views/ExploreView'; 

export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('auth');
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ id: '', pw: '', email: '' });
  const [grid, setGrid] = useState(Array(50).fill().map(() => Array(50).fill(0)));
  const [mode, setMode] = useState('wall_rect');
  const [paintColor, setPaintColor] = useState(1); 
  const [stackedFloors, setStackedFloors] = useState([]); 
  const [isDrawing, setIsDrawing] = useState(false);
  const [history, setHistory] = useState([]);
  const [startPos, setStartPos] = useState(null);
  const [currentPos, setCurrentPos] = useState(null);
  const [blueprints, setBlueprints] = useState({ mine: [], others: [] });

  const [selectedBp, setSelectedBp] = useState(null);
  const [commentInput, setCommentInput] = useState('');
  const [likesData, setLikesData] = useState({}); 
  const [commentsData, setCommentsData] = useState({}); 

  // 🌟 업로드 팝업 상태 관리
  const [uploadModal, setUploadModal] = useState({ isOpen: false, payload: null, title: '새 프로젝트', type: 'blueprint' });

  // 브라우저 뒤로가기(popstate) 감지 센서
  useEffect(() => {
    const handlePopState = (event) => {
      if (event.state && event.state.view) {
        setView(event.state.view);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // setView를 감싸서 가짜 URL 기록(history)을 남기는 전용 함수
  const handleSetView = (newView) => {
    window.history.pushState({ view: newView }, '', `?view=${newView}`);
    setView(newView);
  };

  const handleSignUp = async () => {
    const { error } = await supabase.from('users').insert([{ username: authForm.id, password_hash: hashPw(authForm.pw), email: authForm.email }]);
    if (error) alert("이미 존재하는 ID입니다.");
    else { alert("계정이 생성되었습니다! 로그인해주세요."); setAuthMode('login'); }
  };

  const handleLogin = async () => {
    const { data } = await supabase.from('users').select('*').eq('username', authForm.id).eq('password_hash', hashPw(authForm.pw)).single();
    if (data) { 
      setUser(data); 
      handleSetView('dashboard'); 
    } else {
      alert("아이디 혹은 비밀번호가 틀립니다.");
    }
  };

  const fetchBlueprints = async () => {
    const { data: allData } = await supabase.from('blueprints').select('*').order('created_at', { ascending: false });
    const all = allData || [];
    setBlueprints({ mine: all.filter(bp => bp.user_id === user?.id), others: all.filter(bp => bp.user_id !== user?.id) });
  };

  useEffect(() => { if (view === 'dashboard' && user) fetchBlueprints(); }, [view, user]);

  // 🌟 에디터에서 저장 버튼 누를 때 팝업 띄우기
  const triggerUpload = (payload) => {
    if (!user) return;
    
    // 데이터 유무에 따라 기본 타입 스마트 추천
    let defaultType = 'blueprint';
    if (payload.thumbnail_url) defaultType = '3dmodel';
    else if (payload.csv_data) defaultType = 'structure';

    setUploadModal({ isOpen: true, payload, title: '', type: defaultType });
  };

  // 🌟 팝업에서 최종 '저장하기' 누를 때 DB 인서트
  const executeUpload = async () => {
    if (!uploadModal.title.trim()) {
      alert("작품 이름을 입력해주세요!");
      return;
    }

    const { error } = await supabase.from('blueprints').insert([{ 
      name: uploadModal.title, 
      user_id: user.id, 
      author: user.username,
      project_type: uploadModal.type, // DB에 명시적 타입 저장!
      ...uploadModal.payload 
    }]);

    if (!error) { 
      alert("업로드 완료!"); 
      setUploadModal({ isOpen: false, payload: null, title: '', type: 'blueprint' });
      fetchBlueprints(); // 업로드 후 최신화
      handleSetView('dashboard'); 
    } else {
      alert("에러: " + error.message);
    }
  };

  const saveHistory = () => setHistory(prev => [...prev, JSON.parse(JSON.stringify(grid))].slice(-20));
  const undo = () => { if (history.length === 0) return;
  setGrid(history[history.length - 1]); setHistory(prev => prev.slice(0, -1)); };

  const handleMouseDown = (r, c) => {
    if (mode === 'floor_fill') {
      saveHistory();
      setGrid(prevGrid => floodFill(prevGrid, r, c, paintColor));
      return;
    }
    saveHistory();
    setIsDrawing(true);
    setStartPos({ r, c });
    setCurrentPos({ r, c });
  };

  const handleMouseEnter = (r, c) => { if (isDrawing) setCurrentPos({ r, c });
  };

  const handleMouseUp = () => {
    if (isDrawing && mode.includes('rect') && startPos && currentPos) {
      let newGrid = grid.map(row => [...row]);
      const startR = Math.min(startPos.r, currentPos.r), endR = Math.max(startPos.r, currentPos.r);
      const startC = Math.min(startPos.c, currentPos.c), endC = Math.max(startPos.c, currentPos.c);

      if (mode === 'wall_rect') {
        newGrid = applyWallBorder(newGrid, startR, endR, startC, endC, paintColor, 2);
      } else if (mode === 'floor_rect') {
        for (let r = startR; r <= endR; r++) {
          for (let c = startC; c <= endC; c++) { newGrid[r][c] = paintColor; }
        }
      } else if (mode === 'rect_eraser') {
        for (let r = startR; r <= endR; r++) {
          for (let c = startC; c <= endC; c++) { newGrid[r][c] = 0; }
        }
      }
      setGrid(newGrid);
    }
    setIsDrawing(false); setStartPos(null); setCurrentPos(null);
  };

  const commitCurrentFloor = (csvAbsorb) => {
    if (csvAbsorb && csvAbsorb.pages && csvAbsorb.pages.length > 0) {
      const absorbed = csvAbsorb.pages.map((pageGrid, i) => ({
        pageBase: i * 5,
        maxColorUsed: 5,
        grid: i === csvAbsorb.pageIndex ? grid : pageGrid,
      }));
      setStackedFloors(prev => [...prev, ...absorbed]);
      setGrid(Array(50).fill().map(() => Array(50).fill(0)));
      setHistory([]);
      return;
    }
    const maxColorUsed = getMaxColorUsed(grid);
    const pageBase = getNextPageBase(stackedFloors);
    setStackedFloors(prev => [...prev, { pageBase, maxColorUsed, grid: JSON.parse(JSON.stringify(grid)) }]);
    setGrid(Array(50).fill().map(() => Array(50).fill(0)));
    setHistory([]);
  };

  const goBackToPreviousFloor = () => {
    if (stackedFloors.length === 0) return;
    const last = stackedFloors[stackedFloors.length - 1];
    setGrid(last.grid); 
    setStackedFloors(prev => prev.slice(0, -1)); 
    setHistory([]);
  };

  const resetAllFloors = () => {
    if (!window.confirm("전체 페이지를 초기화하시겠습니까? 되돌릴 수 없습니다.")) return;
    setStackedFloors([]);
    setGrid(Array(50).fill().map(() => Array(50).fill(0)));
    setHistory([]);
  };

  const isInsidePreview = (r, c) => {
    if (!isDrawing || !startPos || !currentPos || !mode.includes('rect')) return false;
    return r >= Math.min(startPos.r, currentPos.r) && r <= Math.max(startPos.r, currentPos.r) && c >= Math.min(startPos.c, currentPos.c) && c <= Math.max(startPos.c, currentPos.c);
  };

  const handleLikeToggle = (bpId) => {
    if (!user) return;
    const currentLikedUsers = likesData[bpId] || [];
    if (currentLikedUsers.includes(user.id)) {
      setLikesData({ ...likesData, [bpId]: currentLikedUsers.filter(uid => uid !== user.id) });
    } else {
      setLikesData({ ...likesData, [bpId]: [...currentLikedUsers, user.id] });
    }
  };

  const handleAddComment = (bpId) => {
    if (!commentInput.trim() || !user) return;
    const newComment = {
      id: Date.now(),
      username: user.username,
      content: commentInput,
      created_at: new Date().toISOString()
    };
    const currentComments = commentsData[bpId] || [];
    setCommentsData({ ...commentsData, [bpId]: [...currentComments, newComment] });
    setCommentInput('');
  };

  return (
    <>
      {/* 🌟 커스텀 업로드 모달 팝업 */}
      {uploadModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-sm flex flex-col gap-5 border border-gray-100">
            <h3 className="text-xl font-black text-gray-900 border-b pb-2">🌐 클라우드 업로드</h3>
            
            <div>
              <label className="text-xs font-bold text-gray-500 mb-1.5 block">작품 제목을 입력하세요</label>
              <input 
                type="text" 
                value={uploadModal.title}
                onChange={e => setUploadModal({...uploadModal, title: e.target.value})}
                placeholder="예: 내 첫 번째 대저택"
                className="w-full bg-gray-50 border border-gray-200 p-3 rounded-xl text-sm outline-none focus:border-blue-500 transition-all font-medium"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-500 mb-2 block">작품 유형 (자동 분석됨)</label>
              <div className="flex flex-col gap-2.5 bg-gray-50 p-3 rounded-xl border border-gray-100">
                <label className="flex items-center gap-2 text-sm font-bold text-gray-700 cursor-pointer">
                  <input type="radio" name="projectType" value="blueprint" checked={uploadModal.type === 'blueprint'} onChange={e => setUploadModal({...uploadModal, type: e.target.value})} className="w-4 h-4 accent-blue-600"/>
                  📝 1층 설계도
                </label>
                <label className="flex items-center gap-2 text-sm font-bold text-gray-700 cursor-pointer">
                  <input type="radio" name="projectType" value="structure" checked={uploadModal.type === 'structure'} onChange={e => setUploadModal({...uploadModal, type: e.target.value})} className="w-4 h-4 accent-blue-600"/>
                  🏗️ 다층 구조물
                </label>
                <label className="flex items-center gap-2 text-sm font-bold text-gray-700 cursor-pointer">
                  <input type="radio" name="projectType" value="3dmodel" checked={uploadModal.type === '3dmodel'} onChange={e => setUploadModal({...uploadModal, type: e.target.value})} className="w-4 h-4 accent-blue-600"/>
                  🕋 AI 3D 모델
                </label>
              </div>
            </div>

            <div className="flex gap-3 mt-2">
              <Button variant="secondary" className="flex-1 py-3" onClick={() => setUploadModal({ isOpen: false, payload: null, title: '', type: 'blueprint' })}>취소</Button>
              <Button variant="primary" className="flex-1 py-3" onClick={executeUpload}>🚀 저장하기</Button>
            </div>
          </div>
        </div>
      )}

      {view === 'auth' && <AuthView authMode={authMode} setAuthMode={setAuthMode} authForm={authForm} setAuthForm={setAuthForm} handleLogin={handleLogin} handleSignUp={handleSignUp} />}
      
      {view === 'dashboard' && (
        <DashboardView 
          user={user} 
          blueprints={blueprints} 
          setView={handleSetView} 
          setUser={setUser} 
          onSelectBlueprint={(bp) => {
            setSelectedBp(bp);
            handleSetView('detail'); 
          }} 
        />
      )}

      {view === 'explore' && (
        <ExploreView
          blueprints={blueprints}
          setView={handleSetView} 
          onSelectBlueprint={(bp) => {
            setSelectedBp(bp);
            handleSetView('detail'); 
          }}
        />
      )}
      
      {view === 'editor' && (
        <EditorView
          grid={grid}
          setGrid={setGrid}
          mode={mode}
          setMode={setMode}
          paintColor={paintColor}
          setPaintColor={setPaintColor}
          stackedFloors={stackedFloors}
          commitCurrentFloor={commitCurrentFloor}
          goBackToPreviousFloor={goBackToPreviousFloor}
          resetAllFloors={resetAllFloors}
          setView={handleSetView} 
          undo={undo}
          saveHistory={saveHistory}
          uploadToShowcase={triggerUpload} // 🌟 기존 함수 대신 팝업 트리거 함수 연결
          isInsidePreview={isInsidePreview}
          handleMouseDown={handleMouseDown}
          handleMouseEnter={handleMouseEnter}
          handleMouseUp={handleMouseUp}
        />
      )}

      {view === 'detail' && selectedBp && (
        <DetailView
          selectedBp={selectedBp}
          setView={handleSetView} 
          comments={commentsData[selectedBp.id] || []}
          commentInput={commentInput}
          setCommentInput={setCommentInput}
          likeCount={(likesData[selectedBp.id] || []).length}
          hasLiked={(likesData[selectedBp.id] || []).includes(user?.id)}
          onLikeToggle={() => handleLikeToggle(selectedBp.id)}
          onAddComment={() => handleAddComment(selectedBp.id)}
          onEditBlueprint={() => {
            setGrid(selectedBp.grid_data || Array(50).fill().map(() => Array(50).fill(0)));
            setHistory([]);
            handleSetView('editor'); 
          }}
        />
      )}
    </>
  );
}