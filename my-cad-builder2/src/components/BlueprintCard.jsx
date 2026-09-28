// FILE PATH: src/components/BlueprintCard.jsx
import React from 'react';

export default function BlueprintCard({ bp, onClick }) {
  // 🌟 기존 유추 로직 제거하고 DB에 있는 명시적 타입 사용!
  // (과거에 올린 데이터는 project_type이 없을 수 있으므로 기본값 'blueprint' 처리)
  const type = bp.project_type || 'blueprint';

  return (
    <div 
      onClick={onClick} 
      className="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-xl transition-all group cursor-pointer active:scale-98 relative"
    >
      {/* 🌟 3단계 뱃지 시스템 */}
      <div className="absolute top-3 right-3 z-10 px-2 py-1 bg-white/90 backdrop-blur-sm rounded-lg shadow-sm text-[10px] font-black border border-gray-100 text-gray-700">
        {type === '3dmodel' && '🕋 3D AI 모델'}
        {type === 'structure' && '🏗️ 다층 구조물'}
        {type === 'blueprint' && '📐 1층 설계도'}
      </div>

      {/* 썸네일 영역 (3dmodel이면서 썸네일 데이터가 있을 때만 이미지 렌더링) */}
      {type === '3dmodel' && bp.thumbnail_url ? (
        <div className="h-40 w-full bg-gray-900 overflow-hidden">
          <img 
            src={bp.thumbnail_url} 
            alt={bp.name} 
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        </div>
      ) : (
        <div className="h-40 bg-gray-100 flex items-center justify-center text-4xl group-hover:bg-blue-50 transition-colors">
          {type === 'structure' ? '🏢' : '📝'}
        </div>
      )}
      
      <div className="p-5">
        <div className="font-bold text-lg text-gray-900 truncate">{bp.name}</div>
        <div className="flex justify-between items-center mt-2">
          <span className="text-sm text-blue-600 font-bold truncate pr-2">{bp.author}</span>
          <span className="text-xs text-gray-400 shrink-0">{new Date(bp.created_at).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
}