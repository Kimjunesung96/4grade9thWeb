import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { hashPw, applyWallBorder, floodFill, FLOOR_VALUE } from './utils/cadUtils';
import AuthView from './views/AuthView';
import DashboardView from './views/DashboardView';
import EditorView from './views/EditorView';
import DetailView from './views/DetailView';

export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('auth');
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ id: '', pw: '', email: '' });
  const [grid, setGrid] = useState(Array(50).fill().map(() => Array(50).fill(0)));
  const [mode, setMode] = useState('wall_rect');
  const [activeFloor, setActiveFloor] = useState(1); // 현재 선택된 층 (1~5)
  const [isDrawing, setIsDrawing] = useState(false);
  const [history, setHistory] = useState([]);
  const [startPos, setStartPos] = useState(null);
  const [currentPos, setCurrentPos] = useState(null);
  const [blueprints, setBlueprints] = useState({ mine: [], others: [] });

  // 소셜 상태 데이터 전역 상태 관리 저장소
  const [selectedBp, setSelectedBp] = useState(null);
  const [commentInput, setCommentInput] = useState('');
  const [likesData, setLikesData] = useState({}); // { 도면ID: [유저ID리스트] }
  const [commentsData, setCommentsData] = useState({}); // { 도면ID: [댓글배열] }

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

  // 매개변수 payload를 받아서 유연하게 DB에 넣도록 수정
  const uploadToShowcase = async (payload) => {
    if (!user) return;
    const title = prompt("작품 이름을 지어주세요!", "새 프로젝트");
    if (!title) return;

    const { error } = await supabase.from('blueprints').insert([{ 
      name: title, 
      user_id: user.id, 
      author: user.username,
      ...payload // grid_data, csv_data, thumbnail_url 등이 알아서 들어감
    }]);

    if (!error) { 
      alert("업로드 완료!"); 
      setView('dashboard'); 
    } else {
      alert("에러: " + error.message);
    }
  };

  const saveHistory = () => setHistory(prev => [...prev, JSON.parse(JSON.stringify(grid))].slice(-20));
  const undo = () => { if (history.length === 0) return;
  setGrid(history[history.length - 1]); setHistory(prev => prev.slice(0, -1)); };

  const handleMouseDown = (r, c) => {
    // 바닥 채우기(클릭) 모드는 드래그 개념이 없으므로 즉시 flood fill 실행
    if (mode === 'floor_fill') {
      saveHistory();
      setGrid(prevGrid => floodFill(prevGrid, r, c, FLOOR_VALUE));
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
        // 벽: 사각형 테두리만 두께 2칸으로 칠하고 안쪽은 비움 (선택된 층 값으로)
        newGrid = applyWallBorder(newGrid, startR, endR, startC, endC, activeFloor, 2);
      } else if (mode === 'floor_rect') {
        // 바닥(드래그): 영역 전체를 채움
        for (let r = startR; r <= endR; r++) {
          for (let c = startC; c <= endC; c++) { newGrid[r][c] = FLOOR_VALUE; }
        }
      } else if (mode === 'rect_eraser') {
        // 지우개: 영역 전체를 비움
        for (let r = startR; r <= endR; r++) {
          for (let c = startC; c <= endC; c++) { newGrid[r][c] = 0; }
        }
      }
      setGrid(newGrid);
    }
    setIsDrawing(false); setStartPos(null); setCurrentPos(null);
  };

  const isInsidePreview = (r, c) => {
    if (!isDrawing || !startPos || !currentPos || !mode.includes('rect')) return false;
    return r >= Math.min(startPos.r, currentPos.r) && r <= Math.max(startPos.r, currentPos.r) && c >= Math.min(startPos.c, currentPos.c) && c <= Math.max(startPos.c, currentPos.c);
  };

  // 1인 1회 토글형 좋아요 알고리즘 구현
  const handleLikeToggle = (bpId) => {
    if (!user) return;
    const currentLikedUsers = likesData[bpId] || [];
    if (currentLikedUsers.includes(user.id)) {
      setLikesData({ ...likesData, [bpId]: currentLikedUsers.filter(uid => uid !== user.id) });
    } else {
      setLikesData({ ...likesData, [bpId]: [...currentLikedUsers, user.id] });
    }
  };

  // 고유 도면 아이디 기반 독립형 댓글 작성 처리
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
      {view === 'auth' && <AuthView authMode={authMode} setAuthMode={setAuthMode} authForm={authForm} setAuthForm={setAuthForm} handleLogin={handleLogin} handleSignUp={handleSignUp} />}
      
      {view === 'dashboard' && (
        <DashboardView 
          user={user} 
          blueprints={blueprints} 
          setView={setView} 
          setUser={setUser} 
          onSelectBlueprint={(bp) => {
            setSelectedBp(bp);
            setView('detail'); // 💡 팝업 모달 대신 상세페이지('detail') 뷰로 화면 라우팅 전환
          }} 
        />
      )}
      
      {view === 'editor' && (
        <EditorView
          grid={grid}
          setGrid={setGrid}
          mode={mode}
          setMode={setMode}
          activeFloor={activeFloor}
          setActiveFloor={setActiveFloor}
          setView={setView}
          undo={undo}
          saveHistory={saveHistory}
          uploadToShowcase={uploadToShowcase}
          isInsidePreview={isInsidePreview}
          handleMouseDown={handleMouseDown}
          handleMouseEnter={handleMouseEnter}
          handleMouseUp={handleMouseUp}
        />
      )}

      {view === 'detail' && selectedBp && (
        <DetailView
          selectedBp={selectedBp}
          setView={setView}
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
            setView('editor');
          }}
        />
      )}
    </>
  );
}