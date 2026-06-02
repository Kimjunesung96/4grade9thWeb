import React from 'react';

export default function BlueprintCard({ bp }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-xl transition-all group">
      <div className="h-40 bg-gray-100 flex items-center justify-center text-4xl group-hover:bg-blue-50 transition-colors">🏗️</div>
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