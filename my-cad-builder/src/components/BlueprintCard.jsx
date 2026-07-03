import React from 'react';

export default function BlueprintCard({ bp, onClick }) {
  // 🌟 썸네일(사진) 존재 여부로 3D / 2D 프로젝트를 판별합니다.
  const is3D = !!bp.thumbnail_url;

  return (
    <div 
      onClick={onClick} 
      className="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-xl transition-all group cursor-pointer active:scale-98 relative"
    >
      {/* 🌟 우측 상단 뱃지 추가 (3D vs 2D 직관적 구분) */}
      <div className="absolute top-3 right-3 z-10 px-2 py-1 bg-white/90 backdrop-blur-sm rounded-lg shadow-sm text-[10px] font-black border border-gray-100 text-gray-700">
        {is3D ? '🕋 3D AI 모델' : '📐 2D 정밀 도면'}
      </div>

      {/* 🌟 썸네일 영역 */}
      {is3D ? (
        // 3D 프로젝트: 찰칵 찍어둔 썸네일 이미지를 꽉 차게 보여줌
        <div className="h-40 w-full bg-gray-900 overflow-hidden">
          <img 
            src={bp.thumbnail_url} 
            alt={bp.name} 
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        </div>
      ) : (
        // 2D 프로젝트: 기존처럼 아이콘 표시
        <div className="h-40 bg-gray-100 flex items-center justify-center text-4xl group-hover:bg-blue-50 transition-colors">
          🏗️
        </div>
      )}
      
      <div className="p-5">
        <div className="font-bold text-lg text-gray-900">{bp.name}</div>
        <div className="flex justify-between items-center mt-2">
          <span className="text-sm text-blue-600 font-bold">{bp.author}</span>
          <span className="text-xs text-gray-400">{new Date(bp.created_at).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
}