import React, { useEffect, useMemo, useState } from 'react';
import { downloadFloorPagesAsZip, exportToPNG, exportToCSV, getCellColorClass } from '../utils/cadUtils';
import { parseStressCsv, RISK_ORDER, RISK_COLORS, RISK_LABELS } from '../utils/stressUtils';
import LiveDemoViewer from '../components/LiveDemoViewer';
import StressAnalysisModal from '../components/StressAnalysisModal';
// 🌟 DB에 문자열로 저장된 csv_data를 라이브 데모 뷰어가 인식할 수 있는 블록 배열로 바꾸는 헬퍼 함수
function parseCsvToBlocks(csvText) {
  if (!csvText) return [];
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  const idx = {
    x: headers.indexOf('PosX'),
    y: headers.indexOf('PosY'),
    z: headers.indexOf('PosZ'),
    mat: headers.indexOf('Material'),
  };

  const MATERIAL_HEX = { Concrete: '#95a5a6', Wood: '#d35400', Steel: '#2c3e50', Glass: '#3498db', Default: '#bdc3c7' };
  const blocks = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const cols = lines[i].split(',');
    const matName = idx.mat !== -1 ? cols[idx.mat] : 'Default';
    blocks.push({
      x: parseFloat(cols[idx.x]),
      y: parseFloat(cols[idx.y]),
      z: parseFloat(cols[idx.z]),
      mat: matName,
      color: MATERIAL_HEX[matName] || MATERIAL_HEX.Default,
    });
  }
  return blocks;
}

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
  onEditBlueprint,
  isOwner = true
}) {
  // 하중 테스트 결과 업로드 팝업
  const [stressOpen, setStressOpen] = useState(false);
  const [savedAnalysis, setSavedAnalysis] = useState(selectedBp?.ai_analysis ?? null);

  // 🌟 하중 테스트 결과(CurrentStress.csv 원문) + 뷰어 표시 모드
  const [stressCsv, setStressCsv] = useState(selectedBp?.stress_csv ?? null);
  const [colorMode, setColorMode] = useState(selectedBp?.stress_csv ? 'risk' : 'normal'); // 'normal' | 'risk'
  const [posMode, setPosMode] = useState('orig'); // 'orig' | 'moved'

  // 다른 도면으로 이동하면 이전 도면의 분석/결과가 남지 않도록 초기화
  useEffect(() => {
    setSavedAnalysis(selectedBp?.ai_analysis ?? null);
    setStressCsv(selectedBp?.stress_csv ?? null);
    setColorMode(selectedBp?.stress_csv ? 'risk' : 'normal');
    setPosMode('orig');
  }, [selectedBp?.id]);

  // 격자 데이터를 기반으로 한 실제 용량 계산 로직 (KB단위)
  // 🌟 2D/3D 유연하게 대응하는 용량 계산 함수
  const calculateFileSize = () => {
    const targetData = selectedBp?.grid_data || selectedBp?.csv_data;
    if (!targetData) return "0.00 KB";
    const strLen = typeof targetData === 'string' ? targetData.length : JSON.stringify(targetData).length;
    return (strLen / 1024).toFixed(2) + " KB";
  };

  // 🌟 현재 도면이 3D AI 기반 프로젝트인지 판별하고 블록 파싱 수행
  const is3D = !!selectedBp?.csv_data;
  const parsed3DBlocks = useMemo(() => {
    return is3D ? parseCsvToBlocks(selectedBp.csv_data) : null;
  }, [selectedBp?.csv_data, is3D]);

  // 🌟 위험도 색상 블록 (일반=회색, 주의=노랑, 위험=빨강, 파괴=보라)
  const stressPreview = useMemo(() => parseStressCsv(stressCsv, posMode), [stressCsv, posMode]);
  const showRisk = is3D && colorMode === 'risk' && stressPreview.blocks.length > 0;

  const handlePngDownload = async () => {
    // 브라우저/웹뷰에서 prompt()가 차단될 수 있으므로 프로젝트 이름을 바로 사용한다.
    const name = selectedBp.name || '도면';

    if (is3D) {
      // 3D CSV는 5개 층씩 2D PNG로 변환한다. PNG가 많아지면 ZIP으로 묶어 내려받는다.
      await downloadFloorPagesAsZip(selectedBp.csv_data, name);
      return;
    }

    exportToPNG(selectedBp.grid_data, name);
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
          <div className="text-xs font-bold text-gray-400 mb-4 uppercase tracking-wider">
            {is3D ? (showRisk ? "3D 하중 테스트 위험도 프리뷰" : "3D AI 건축물 입체 프리뷰") : "구조물 설계도 평면도 미리보기"}
          </div>

          {/* 🌟 하중 테스트 결과가 있을 때만: 기본 색 / 위험도 색 전환 */}
          {is3D && stressCsv && (
            <div className="w-full flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
                {[['normal', '기본 색'], ['risk', '위험도 색']].map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setColorMode(key)}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                      colorMode === key ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:bg-gray-200/60'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {colorMode === 'risk' && (
                <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
                  {[['orig', '원위치'], ['moved', '테스트 후 위치']].map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setPosMode(key)}
                      className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                        posMode === key ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:bg-gray-200/60'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          
          {/* 🌟 3D 모드라면 parsed3DBlocks(또는 위험도 색 블록)를, 2D 모드라면 기존대로 grid 데이터를 바인딩 */}
          <div className="w-full h-[350px] mb-2 rounded-2xl overflow-hidden border border-gray-200 shadow-inner">
            <LiveDemoViewer 
              grid={!is3D ? selectedBp?.grid_data : null} 
              data={is3D ? (showRisk ? stressPreview.blocks : parsed3DBlocks) : null} 
              mode="static" 
              maxBlocks={10000} 
            />
          </div>

          {/* 🌟 위험도 범례 */}
          {showRisk && (
            <div className="w-full flex flex-wrap gap-x-4 gap-y-1 mb-4 text-[11px] text-gray-600 font-medium">
              {RISK_ORDER.map((key) => (
                <span key={key} className="flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: RISK_COLORS[key] }} />
                  {RISK_LABELS[key]} {stressPreview.counts[key]}
                </span>
              ))}
            </div>
          )}
          {!showRisk && <div className="mb-2" />}

          {/* 🌟 2D 설계도일 때만 하단의 미니 격자판(2D 레고 도면)을 렌더링하고, 3D 건축물일 때는 공간을 차지하지 않도록 숨깁니다. */}
          {!is3D && selectedBp.grid_data && (
            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 shadow-inner overflow-auto max-w-full flex items-center justify-center min-h-[150px] w-full">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(50, 7px)', gap: '0px' }}>
                {selectedBp.grid_data.map((row, rIdx) => row.map((cell, cIdx) => (
                  <div
                    key={`detail-cell-${rIdx}-${cIdx}`}
                    className={`w-[7px] h-[7px] border-[0.05px] border-gray-200/50 ${getCellColorClass(cell)}`}
                  />
                )))}
              </div>
            </div>
          )}
          
          <div className="w-full flex flex-col gap-3 mt-4">
            <div className="grid grid-cols-2 gap-3">
              <button onClick={handlePngDownload} className="p-3.5 bg-gray-800 text-white rounded-xl text-xs font-bold hover:bg-black transition-all shadow-sm">
                📸 PNG 이미지 다운로드 (mbs_)
              </button>
              <button onClick={() => {
                if (is3D) {
                  const url = URL.createObjectURL(new Blob([selectedBp.csv_data], { type: 'text/csv' }));
                  const a = document.createElement('a');
                  a.href = url; a.download = `mbs_${selectedBp.name || 'model'}.csv`; a.click();
                  URL.revokeObjectURL(url);
                } else if (selectedBp.grid_data) {
                  exportToCSV(selectedBp.grid_data);
                }
              }} className="p-3.5 bg-blue-50 text-blue-600 border border-blue-200 rounded-xl text-xs font-bold hover:bg-blue-100 transition-all shadow-sm">
                📊 CSV 데이터 내보내기
              </button>
            </div>
            <button onClick={onEditBlueprint} className="w-full p-4 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 shadow-md transition-all">
              📐 이 도면 편집기로 열기 (CAD 작업실 이동)
            </button>
            {is3D && (
              <button onClick={() => setStressOpen(true)} className="w-full p-4 bg-white text-gray-800 border border-gray-300 rounded-xl text-sm font-bold hover:bg-gray-50 shadow-sm transition-all">
                🧪 하중 테스트 결과 업로드 · AI 분석
              </button>
            )}
          </div>
        </div>

        {/* 오른쪽 영역: 상세 정보 메타데이터 및 실시간 좋아요/댓글 피드백 시스템 (기존 코드 완벽 유지) */}
        <div className="w-full md:w-[400px] bg-white border border-gray-200 rounded-2xl p-6 flex flex-col shadow-sm justify-between">
          <div>
            <h3 className="text-base font-black text-gray-900 mb-4 pb-2 border-b border-gray-100">📋 설계 도면 정보</h3>
            
            <div className="bg-gray-50 p-4 rounded-xl text-xs space-y-3 text-gray-600 font-medium mb-5 border border-gray-100">
              <div className="flex justify-between"><span>👤 설계자</span> <span className="text-blue-600 font-bold">{selectedBp.author}</span></div>
              <div className="flex justify-between"><span>📅 제작일자</span> <span className="text-gray-900 font-bold">{new Date(selectedBp.created_at).toLocaleString()}</span></div>
              <div className="flex justify-between"><span>💾 파일 용량</span> <span className="text-green-600 font-bold">{calculateFileSize()}</span></div>
            </div>

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

      <StressAnalysisModal
        isOpen={stressOpen}
        onClose={() => setStressOpen(false)}
        blueprint={selectedBp}
        savedAnalysis={savedAnalysis}
        canUpload={isOwner}
        onPreview={(text) => { setStressCsv(text); setColorMode('risk'); }}
        onUploaded={(f) => { setSavedAnalysis(f.ai_analysis); setStressCsv(f.stress_csv); }}
      />
    </div>
  );
}
