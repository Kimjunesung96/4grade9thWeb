// FILE PATH: src/views/ExploreView.jsx
import React, { useState, useMemo, useEffect, useRef } from 'react';
import BlueprintCard from '../components/BlueprintCard';

const shuffleArray = (array) => {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

export default function ExploreView({ blueprints, setView, onSelectBlueprint }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchType, setSearchType] = useState('name'); 
  
  const [activeTab, setActiveTab] = useState('all');

  const [displayCount, setDisplayCount] = useState(6);
  const [randomBlueprints, setRandomBlueprints] = useState([]);
  
  const scrollContainerRef = useRef(null); 
  const loaderRef = useRef(null); 

  const allBlueprints = useMemo(() => {
    return [...blueprints.mine, ...blueprints.others];
  }, [blueprints]);

  useEffect(() => {
    setRandomBlueprints(shuffleArray(allBlueprints));
    setDisplayCount(6);
  }, [allBlueprints]);

  useEffect(() => {
    setDisplayCount(6);
  }, [searchTerm, searchType, activeTab]);

  const processedBlueprints = useMemo(() => {
    // 🌟 1. DB의 project_type을 이용한 초정밀 필터링!
    const tabFiltered = randomBlueprints.filter(bp => {
      const type = bp.project_type || 'blueprint'; // 하위 호환
      if (activeTab === 'blueprint') return type === 'blueprint';
      if (activeTab === 'structure') return type === 'structure';
      if (activeTab === '3dmodel') return type === '3dmodel';
      return true; // 'all'
    });

    if (!searchTerm.trim()) return tabFiltered;

    const term = searchTerm.toLowerCase().trim();
    const scored = tabFiltered.map(bp => {
      let score = 0;
      const title = bp.name?.toLowerCase() || '';
      const author = bp.author?.toLowerCase() || '';

      if (searchType === 'name') {
        if (title === term) score = 100;
        else if (title.startsWith(term)) score = 50;
        else if (title.includes(term)) score = 10;
      } else if (searchType === 'author') {
        if (author === term) score = 100;
        else if (author.includes(term)) score = 10;
      }
      return { ...bp, score };
    });

    return scored.filter(bp => bp.score > 0).sort((a, b) => b.score - a.score);
  }, [randomBlueprints, searchTerm, searchType, activeTab]);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && displayCount < processedBlueprints.length) {
        setDisplayCount(prev => prev + 6);
      }
    }, { 
      root: scrollContainerRef.current,
      threshold: 0.1 
    });

    if (loaderRef.current) observer.observe(loaderRef.current);
    
    return () => {
      if (loaderRef.current) observer.unobserve(loaderRef.current);
    };
  }, [displayCount, processedBlueprints.length]);

  const visibleBlueprints = processedBlueprints.slice(0, displayCount);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <header className="bg-white border-b border-gray-200 px-8 py-4 flex flex-col sm:flex-row items-center justify-between shadow-sm sticky top-0 z-10 gap-4">
        <div className="flex items-center space-x-4 w-full sm:w-auto">
          <button onClick={() => setView('dashboard')} className="p-2 hover:bg-gray-100 rounded-xl text-gray-600 font-bold transition-all flex items-center space-x-1 text-sm">
            <span>◀</span> <span>대시보드로 가기</span>
          </button>
          <div className="h-6 w-[1px] bg-gray-200" />
          <h2 className="text-xl font-black text-gray-900">🌐 커뮤니티 갤러리</h2>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select 
            value={searchType} 
            onChange={(e) => setSearchType(e.target.value)}
            className="bg-gray-50 border border-gray-200 text-sm font-bold p-2.5 rounded-lg outline-none focus:border-blue-500"
          >
            <option value="name">제목 검색</option>
            <option value="author">제작자 검색</option>
          </select>
          <input
            type="text"
            placeholder={searchType === 'name' ? "도면 제목을 검색하세요..." : "제작자(아이디)를 검색하세요..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full sm:w-72 bg-gray-50 border border-gray-200 p-2.5 rounded-lg outline-none focus:border-blue-500 focus:bg-white transition-all text-sm font-medium"
          />
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-8 flex flex-col">
        <div className="flex items-center gap-3 mb-6 border-b border-gray-200 pb-4">
          <button onClick={() => setActiveTab('all')} className={`px-5 py-2 rounded-full text-sm font-bold transition-all ${activeTab === 'all' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>전체 보기</button>
          <button onClick={() => setActiveTab('blueprint')} className={`px-5 py-2 rounded-full text-sm font-bold transition-all ${activeTab === 'blueprint' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>📝 1층 설계도</button>
          <button onClick={() => setActiveTab('structure')} className={`px-5 py-2 rounded-full text-sm font-bold transition-all ${activeTab === 'structure' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>🏗️ 다층 구조물</button>
          <button onClick={() => setActiveTab('3dmodel')} className={`px-5 py-2 rounded-full text-sm font-bold transition-all ${activeTab === '3dmodel' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>🕋 AI 3D 모델</button>
          
          <div className="ml-auto text-sm font-bold text-gray-500 hidden sm:block">
            {searchTerm.trim() ? '검색 결과' : '전체 수량'}: <span className="text-blue-600">{processedBlueprints.length}</span>개
          </div>
        </div>

        <div ref={scrollContainerRef} className="flex-1 max-h-[580px] overflow-y-auto pr-3 bg-white p-6 border border-gray-200 rounded-2xl shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {visibleBlueprints.length === 0 ? (
              <div className="col-span-full py-20 flex flex-col items-center justify-center text-gray-400">
                <span className="text-4xl mb-3">📭</span>
                <span className="font-medium">해당 카테고리에 등록된 작품이 없습니다.</span>
              </div>
            ) : (
              visibleBlueprints.map(bp => (
                <BlueprintCard key={bp.id} bp={bp} onClick={() => onSelectBlueprint(bp)} />
              ))
            )}
          </div>

          {displayCount < processedBlueprints.length && (
            <div ref={loaderRef} className="col-span-full py-10 flex items-center justify-center">
              <div className="animate-pulse flex flex-col items-center">
                <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-2"></div>
                <span className="text-sm font-bold text-gray-400">더 불러오는 중...</span>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}