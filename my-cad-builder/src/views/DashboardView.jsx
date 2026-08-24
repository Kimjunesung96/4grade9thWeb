import React from 'react';
import BlueprintCard from '../components/BlueprintCard';
import Button from '../components/ui/Button';

export default function DashboardView({ user, blueprints, setView, setUser, onSelectBlueprint }) {
  return (
    <div className="flex h-screen bg-gray-50 text-gray-800 font-sans">
      <aside className="w-64 bg-white border-r border-gray-200 p-6 flex flex-col shrink-0">
        <div className="text-2xl font-black text-blue-600 mb-10">DESIGN CENTER</div>
        <div className="bg-blue-50 p-4 rounded-xl mb-10">
          <div className="text-xs font-bold text-blue-400 uppercase mb-1">Signed in as</div>
          <div className="font-bold text-blue-700">{user?.username}</div>
        </div>
    
        <nav className="flex-1 space-y-2">
          <button className="w-full text-left p-3 bg-blue-600 text-white rounded-lg font-bold shadow-md">🏠 대시보드</button>
          <button onClick={() => setView('editor')} className="w-full text-left p-3 hover:bg-gray-100 rounded-lg text-gray-600 font-medium transition-colors">📐 새 도면 그리기</button>
          {/* 🌟 나중에 만들 전체 전시관 버튼만 미리 달아뒀습니다 */}
          <button onClick={() => setView('explore')} className="w-full text-left p-3 hover:bg-gray-100 rounded-lg text-gray-600 font-medium transition-colors">🌐 전체 전시관 (검색)</button>
        </nav>
        <button onClick={() => { setUser(null); setView('auth'); }} className="p-3 text-gray-400 font-bold hover:text-red-500 transition-colors">로그아웃</button>
      </aside>

      <main className="flex-1 p-10 overflow-y-auto">
        <header className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-black text-gray-900">내 구조물</h2>
          <Button variant="primary" onClick={() => setView('editor')} className="px-6 py-3 rounded-full">새 프로젝트 시작</Button>
        </header>

        {/* 🌟 1. 내 구조물 영역: 높이(약 2줄/6개 분량)를 고정하고 내부 스크롤 활성화 */}
        <div className="max-h-[580px] overflow-y-auto pr-3 mb-12 border border-transparent hover:border-gray-100 rounded-2xl transition-colors">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {blueprints.mine.length === 0 ? (
              <div className="col-span-3 h-32 bg-gray-100 rounded-2xl flex items-center justify-center text-gray-400 font-medium">아직 저장된 도면이 없습니다</div>
            ) : (
              blueprints.mine.map(bp => (
                <BlueprintCard key={bp.id} bp={bp} onClick={() => onSelectBlueprint(bp)} />
              ))
            )}
          </div>
        </div>

        <div className="border-t border-gray-200 pt-10">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-black text-gray-900">🌐 전체 전시관 미리보기</h2>
            {/* 🌟 나중에 뚫어놓을 '더보기' 버튼 */}
            <Button variant="secondary" onClick={() => setView('explore')}>더보기 (전체보기) ➔</Button>
          </div>
  
          {/* 🌟 2. 전체 전시관 영역: 높이 고정 및 내부 스크롤 똑같이 적용 */}
          <div className="max-h-[580px] overflow-y-auto pr-3 border border-transparent hover:border-gray-100 rounded-2xl transition-colors">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {blueprints.others.length === 0 ? (
                <div className="col-span-3 h-32 bg-gray-100 rounded-2xl flex items-center justify-center text-gray-400 font-medium">다른 사용자의 도면이 없습니다</div>
              ) : (
                blueprints.others.map(bp => (
                  <BlueprintCard key={bp.id} bp={bp} onClick={() => onSelectBlueprint(bp)} />
                ))
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}