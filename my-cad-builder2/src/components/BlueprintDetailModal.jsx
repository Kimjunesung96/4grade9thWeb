import React from 'react';
import { exportToPNG, exportToCSV, getCellColorClass } from '../utils/cadUtils';

export default function BlueprintDetailModal({
  selectedBp,
  onClose,
  comments,
  commentInput,
  setCommentInput,
  likeCount,
  hasLiked,
  onLikeToggle,
  onAddComment
}) {
  const handlePngDownload = () => {
    const name = prompt("파일 이름을 입력하세요 (mbs_ 가 자동으로 붙습니다)", selectedBp.name || "도면");
    if (name === null) return;
    exportToPNG(selectedBp.grid_data, name);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col md:flex-row overflow-hidden">
        
        {/* 왼쪽: 미니 그리드뷰 및 다운로드 */}
        <div className="w-full md:w-1/2 bg-gray-100 p-6 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-gray-200">
          <div className="text-sm font-bold text-gray-500 mb-3 uppercase tracking-wider">구조물 설계도 평면도</div>
          <div className="bg-white p-2 rounded-xl shadow-md overflow-auto max-w-full max-h-[350px]">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(50, 6px)', width: '300px' }}>
              {selectedBp.grid_data?.map((row, rIdx) => row.map((cell, cIdx) => (
                <div
                  key={`modal-cell-${rIdx}-${cIdx}`}
                  className={`w-[6px] h-[6px] border-[0.05px] border-gray-100 ${getCellColorClass(cell)}`}
                />
              )))}
            </div>
          </div>
          
          <div className="w-full grid grid-cols-2 gap-3 mt-6">
            <button onClick={handlePngDownload} className="p-3 bg-gray-880 text-white rounded-xl text-xs font-bold hover:bg-black transition-all">
              📸 PNG 이미지 다운 (mbs_)
            </button>
            <button onClick={() => exportToCSV(selectedBp.grid_data)} className="p-3 bg-blue-50 text-blue-600 border border-blue-200 rounded-xl text-xs font-bold hover:bg-blue-100 transition-all">
              📊 CSV 데이터 내보내기
            </button>
          </div>
        </div>

        {/* 오른쪽: 소셜 및 정보 영역 */}
        <div className="w-full md:w-1/2 p-6 flex flex-col h-full overflow-hidden justify-between">
          <div>
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-2xl font-black text-gray-900">{selectedBp.name}</h3>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold p-1">✕</button>
            </div>
            <div className="text-sm text-gray-500 font-medium mb-4">
              설계자: <span className="text-blue-600 font-bold">{selectedBp.author}</span>
            </div>

            {/* 좋아요 버튼 */}
            <div className="mb-6">
              <button 
                onClick={onLikeToggle} 
                className={`flex items-center space-x-2 px-4 py-2 rounded-full border text-sm font-bold transition-all ${
                  hasLiked ? 'bg-red-50 border-red-200 text-red-500' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span>{hasLiked ? '❤️' : '🤍'}</span>
                <span>좋아요 {likeCount}개</span>
              </button>
            </div>

            {/* 댓글 목록 */}
            <div className="border-t border-gray-100 pt-4">
              <h4 className="text-sm font-bold text-gray-700 mb-2">댓글 ({comments.length})</h4>
              <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                {comments.length === 0 ? (
                  <p className="text-xs text-gray-400 py-4 text-center">첫 댓글을 남겨 자라나는 구조물을 칭찬해 보세요!</p>
                ) : (
                  comments.map(comment => (
                    <div key={comment.id} className="bg-gray-50 p-3 rounded-xl text-xs">
                      <div className="flex justify-between font-bold text-gray-700 mb-1">
                        <span>{comment.username || '익명'}</span>
                        <span className="text-[10px] text-gray-400 font-normal">{new Date(comment.created_at).toLocaleDateString()}</span>
                      </div>
                      <p className="text-gray-600 font-medium break-all">{comment.content}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* 댓글 입력 바 */}
          <div className="border-t border-gray-100 pt-4 mt-4 flex gap-2">
            <input 
              type="text" 
              value={commentInput}
              onChange={e => setCommentInput(e.target.value)}
              placeholder="멋진 구조물이네요! 댓글을 남겨보세요..."
              className="flex-1 bg-gray-50 border border-gray-200 p-3 rounded-xl text-xs outline-none focus:border-blue-500 transition-all"
              onKeyDown={e => { if(e.key === 'Enter') onAddComment(); }}
            />
            <button onClick={onAddComment} className="px-4 py-3 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-all">
              등록
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}