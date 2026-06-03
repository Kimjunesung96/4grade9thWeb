import React from 'react';
import { exportToPNG, exportToCSV } from '../utils/cadUtils';

export default function DetailView({
  selectedBp,
  setView,
  comments,
  commentInput,
  setCommentInput,
  likeCount,
  hasLiked,
  onLikeToggle,
  onAddComment,
  onEditBlueprint
}) {
  // 격자 데이터를 기반으로 한 실제 용량 계산 로직 (KB단위)
  const calculateFileSize = () => {
    if (!selectedBp?.grid_data) return "0.00 KB";
    const strLen = JSON.stringify(selectedBp.grid_data).length;
    return (strLen / 1024).toFixed(2) + " KB";
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans flex flex-col">
      {/* 상단 네비게이션 헤더 */}
      <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between shadow-sm sticky top-0 z-10">
        <div className="flex items-center space-x-4">
          <button 
            onClick={() => setView('dashboard')} 
            className="p-2 hover:bg-gray-100 rounded-xl text-gray-600 font-bold transition-all flex items-center space-x-1 text-sm"
          >
            <span>◀</span> <span>대시보드로 가기</span>
          </button>
          <div className="h-6 w-[1px] bg-gray-200" />
          <h2 className="text-xl font-black text-gray-900">{selectedBp.name}</h2>
        </div>
        <div className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full">
          설계도 뷰어 모드
        </div>
      </header>

      {/* 대화형 메인 그리드 및 소셜 시스템 (2분할 구성) */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8 flex flex-col md:flex-row gap-8">
        
        {/* 왼쪽 영역: 도면 시각화 프리뷰 및 내보내기 다운로드 컨트롤 */}
        <div className="flex-1 bg-white border border-gray-200 rounded-2xl p-6 flex flex-col items-center justify-center shadow-sm">
          <div className="text-xs font-bold text-gray-400 mb-4 uppercase tracking-wider">구조물 설계도 평면도 미리보기</div>
          
          <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 shadow-inner overflow-auto max-w-full flex items-center justify-center min-h-[380px] w-full">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(50, 7px)', gap: '0px' }}>
              {selectedBp.grid_data?.map((row, rIdx) => row.map((cell, cIdx) => (
                <div
                  key={`detail-cell-${rIdx}-${cIdx}`}
                  className={`w-[7px] h-[7px] border-[0.05px] border-gray-200/50 ${
                    cell === 1 ? 'bg-black' : cell === 2 ? 'bg-gray-400' : 'bg-white'
                  }`}
                />
              )))}
            </div>
          </div>
          
          <div className="w-full flex flex-col gap-3 mt-6">
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => exportToPNG(selectedBp.grid_data)} className="p-3.5 bg-gray-800 text-white rounded-xl text-xs font-bold hover:bg-black transition-all shadow-sm">
                📸 PNG 이미지 다운로드
              </button>
              <button onClick={() => exportToCSV(selectedBp.grid_data)} className="p-3.5 bg-blue-50 text-blue-600 border border-blue-200 rounded-xl text-xs font-bold hover:bg-blue-100 transition-all shadow-sm">
                📊 CSV 데이터 내보내기
              </button>
            </div>
            <button onClick={onEditBlueprint} className="w-full p-4 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 shadow-md transition-all">
              📐 이 도면 편집기로 열기 (CAD 작업실 이동)
            </button>
          </div>
        </div>

        {/* 오른쪽 영역: 상세 정보 메타데이터 및 실시간 좋아요/댓글 피드백 시스템 */}
        <div className="w-full md:w-[400px] bg-white border border-gray-200 rounded-2xl p-6 flex flex-col shadow-sm justify-between">
          <div>
            <h3 className="text-base font-black text-gray-900 mb-4 pb-2 border-b border-gray-100">📋 설계 도면 정보</h3>
            
            {/* 요청 항목: 제작자, 제작일자, 파일 크기 컴포넌트 */}
            <div className="bg-gray-50 p-4 rounded-xl text-xs space-y-3 text-gray-600 font-medium mb-5 border border-gray-100">
              <div className="flex justify-between"><span>👤 설계자</span> <span className="text-blue-600 font-bold">{selectedBp.author}</span></div>
              <div className="flex justify-between"><span>📅 제작일자</span> <span className="text-gray-900 font-bold">{new Date(selectedBp.created_at).toLocaleString()}</span></div>
              <div className="flex justify-between"><span>💾 파일 용량</span> <span className="text-green-600 font-bold">{calculateFileSize()}</span></div>
            </div>

            {/* 요청 항목: 1인 1회 토글식 좋아요 시스템 */}
            <div className="mb-6">
              <button 
                onClick={onLikeToggle} 
                className={`flex items-center space-x-2 px-5 py-2.5 rounded-full border text-xs font-bold transition-all shadow-sm ${
                  hasLiked ? 'bg-red-50 border-red-200 text-red-500 shadow-red-100/30' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span>{hasLiked ? '❤️' : '🤍'}</span>
                <span>좋아요 {likeCount}개</span>
              </button>
            </div>

            {/* 댓글 리스트 */}
            <div className="border-t border-gray-100 pt-5">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">💬 피드백 및 댓글 ({comments.length})</h4>
              <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
                {comments.length === 0 ? (
                  <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-200 text-xs text-gray-400 font-medium">
                    등록된 피드백이 없습니다.<br/>첫 댓글을 달아 칭찬해보세요!
                  </div>
                ) : (
                  comments.map(comment => (
                    <div key={comment.id} className="bg-gray-50 p-3 rounded-xl text-xs border border-gray-100">
                      <div className="flex justify-between font-bold text-gray-700 mb-1">
                        <span>{comment.username || '익명'}</span>
                        <span className="text-[10px] text-gray-400 font-normal">{new Date(comment.created_at).toLocaleDateString()}</span>
                      </div>
                      <p className="text-gray-600 font-medium break-all whitespace-pre-wrap">{comment.content}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* 하단 댓글 입력 폼 */}
          <div className="border-t border-gray-100 pt-4 mt-6 flex gap-2">
            <input 
              type="text" 
              value={commentInput}
              onChange={e => setCommentInput(e.target.value)}
              placeholder="댓글을 남겨보세요..."
              className="flex-1 bg-gray-50 border border-gray-200 p-3 rounded-xl text-xs outline-none focus:border-blue-500 focus:bg-white transition-all font-medium"
              onKeyDown={e => { if(e.key === 'Enter') onAddComment(); }}
            />
            <button onClick={onAddComment} className="px-5 py-3 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 shadow-sm transition-all whitespace-nowrap">
              등록
            </button>
          </div>

        </div>
      </main>
    </div>
  );
}