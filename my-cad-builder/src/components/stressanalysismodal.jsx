import React, { useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import LiveDemoViewer from './LiveDemoViewer';
import { parseStressCsv, RISK_ORDER, RISK_COLORS, RISK_LABELS } from '../utils/stressUtils';

const API_URL = 'http://localhost:8000/api/analyze-stress';

const RISK_META = {
  Safe: { label: RISK_LABELS.Safe, color: RISK_COLORS.Safe },
  Warning: { label: RISK_LABELS.Warning, color: RISK_COLORS.Warning },
  Danger: { label: RISK_LABELS.Danger, color: RISK_COLORS.Danger },
  Destroyed: { label: RISK_LABELS.Destroyed, color: RISK_COLORS.Destroyed },
};

function RiskBar({ risk, total }) {
  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
        {Object.entries(RISK_META).map(([key, meta]) => {
          const n = risk[key] || 0;
          return n > 0 ? (
            <div key={key} style={{ width: `${(n / total) * 100}%`, backgroundColor: meta.color }} title={`${meta.label} ${n}`} />
          ) : null;
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-gray-600 font-medium">
        {Object.entries(RISK_META).map(([key, meta]) => (
          <span key={key} className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: meta.color }} />
            {meta.label} {risk[key] || 0}
          </span>
        ))}
      </div>
    </div>
  );
}

const BTN = 'px-4 py-2.5 rounded-xl text-xs font-bold shadow-sm transition-all disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none disabled:cursor-not-allowed';

export default function StressAnalysisModal({
  isOpen,
  onClose,
  blueprint,
  savedAnalysis = null, // 이미 저장돼 있는 분석 (있으면 참고용으로 표시)
  canUpload = true,
  onUploaded,
  onPreview, // 파일 선택 즉시 CSV 원문을 부모(DetailView 3D 뷰어)로 전달
}) {
  const [file, setFile] = useState(null);
  const [csvText, setCsvText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [posMode, setPosMode] = useState('orig'); // 'orig' = 원위치, 'moved' = 테스트 후 위치

  // 🌟 AI 분석을 기다리지 않고, CSV의 RiskLevel만으로 바로 색을 입힌 3D 블록 생성
  const preview = useMemo(() => parseStressCsv(csvText, posMode), [csvText, posMode]);

  if (!isOpen) return null;

  // 업로드는 "새 분석이 성공적으로 도착한 뒤"에만 활성화
  const canSubmit = canUpload && !!result?.analysis && !loading && !uploading && !uploaded;

  const handleSelect = async (e) => {
    const picked = e.target.files?.[0];
    e.target.value = ''; // 같은 파일을 다시 골라도 change 이벤트가 오도록
    if (!picked) return;
    const text = await picked.text();
    setFile(picked);
    setCsvText(text);
    onPreview?.(text); // 🌟 상세 화면 3D 뷰어도 즉시 위험도 색으로 전환
    setResult(null); // 파일이 바뀌면 이전 분석은 무효 → 업로드 다시 비활성화
    setError('');
    setUploaded(false);
  };

  const handleAnalyze = async () => {
    if (!file) return;
    setLoading(true);
    setResult(null);
    setError('');
    setUploaded(false);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(API_URL, { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || '분석 요청에 실패했습니다.');
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    setUploading(true);
    setError('');
    const fields = { stress_csv: csvText, ai_analysis: result.analysis };
    const { data, error: dbError } = await supabase
      .from('blueprints')
      .update(fields)
      .eq('id', blueprint.id)
      .select('id');
    setUploading(false);

    // RLS에 막히면 error 없이 0행이 반환될 수 있어서 같이 확인
    if (dbError || !data?.length) {
      setError(dbError?.message || '저장 권한이 없거나 도면을 찾을 수 없습니다.');
      return;
    }
    setUploaded(true);
    onUploaded?.(fields);
  };

  const stats = result?.stats;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[88vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-black text-gray-900">🧪 하중 테스트 결과 업로드 · AI 분석</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl text-gray-500 font-bold text-sm">✕</button>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-2">
          <label className={`${BTN} bg-gray-800 text-white hover:bg-black cursor-pointer`}>
            파일 선택
            <input type="file" accept=".csv" className="hidden" onChange={handleSelect} disabled={loading || uploading} />
          </label>
          <button onClick={handleAnalyze} disabled={!file || loading || uploading} className={`${BTN} bg-blue-600 text-white hover:bg-blue-700`}>
            {loading ? '분석 중...' : result ? '다시 분석' : 'AI 분석'}
          </button>
          <button onClick={handleUpload} disabled={!canSubmit} className={`${BTN} bg-green-600 text-white hover:bg-green-700`}>
            {uploaded ? '업로드 완료' : uploading ? '업로드 중...' : '업로드'}
          </button>
        </div>
        <div className="text-xs text-gray-500 font-medium mb-5">
          {file ? `선택한 파일: ${file.name}` : 'CurrentStress.csv 파일을 선택하세요.'}
          {!canUpload && ' · 내가 만든 도면에만 업로드할 수 있어요.'}
        </div>

        {/* 🌟 위험도 색상 3D 미리보기 (파일 선택 즉시 표시) */}
        {preview.blocks.length > 0 && (
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold text-gray-500">
                위험도 3D 미리보기 (블록 {preview.blocks.length.toLocaleString()}개)
              </div>
              <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
                {[['orig', '원위치'], ['moved', '테스트 후 위치']].map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setPosMode(key)}
                    className={`px-3 py-1 rounded-md text-[11px] font-bold transition-all ${
                      posMode === key ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:bg-gray-200/60'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-[400px] rounded-xl overflow-hidden border border-gray-200">
              <LiveDemoViewer data={preview.blocks} mode="static" maxBlocks={10000} />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-gray-600 font-medium">
              {RISK_ORDER.map((key) => (
                <span key={key} className="flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: RISK_COLORS[key] }} />
                  {RISK_LABELS[key]} {preview.counts[key]}
                </span>
              ))}
            </div>
          </div>
        )}

        {loading && <p className="text-xs text-blue-600 font-bold mb-4">AI 응답까지 최대 2~3분 걸릴 수 있어요.</p>}
        {error && <p className="text-xs text-red-600 font-bold bg-red-50 border border-red-200 rounded-xl p-3 mb-4">{error}</p>}

        {stats && (
          <div className="space-y-5">
            <div>
              <div className="text-xs font-bold text-gray-500 mb-2">위험도 분포 (블록 {stats.total_blocks}개)</div>
              <RiskBar risk={stats.risk} total={stats.total_blocks} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {Object.entries(stats.by_tool).map(([tool, t]) => (
                <div key={tool} className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-xs">
                  <div className="font-bold text-gray-700 mb-1">
                    {tool === 'Reinforcement' ? '보강 블록' : '기존 블록'} ({t.count})
                  </div>
                  <div className="text-gray-500 font-medium">파괴율 {t.destroyed_pct}%</div>
                  <div className="text-gray-500 font-medium">응력 중앙값 {t.median_stress}</div>
                </div>
              ))}
            </div>

            <div className="text-xs text-gray-500 font-medium">
              보강 블록 {stats.reinforcement_total}개 중 {stats.reinforcement_failed_count}개가 위험/파괴 · 원위치에서 밀려난 블록 {stats.movement.moved_pct}%
            </div>

            {result.analysis ? (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                <div className="text-xs font-bold text-blue-700 mb-2">AI 분석 결과</div>
                <p className="text-xs text-gray-800 font-medium leading-relaxed whitespace-pre-wrap">{result.analysis}</p>
              </div>
            ) : (
              <p className="text-xs text-yellow-700 font-bold bg-yellow-50 border border-yellow-200 rounded-xl p-3">
                AI 분석을 가져오지 못해 업로드할 수 없습니다. 통계는 정상 집계됐어요. ({result.analysis_error})
              </p>
            )}
          </div>
        )}

        {!result && !loading && savedAnalysis && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <div className="text-xs font-bold text-gray-500 mb-2">이 도면에 저장된 분석</div>
            <p className="text-xs text-gray-700 font-medium leading-relaxed whitespace-pre-wrap">{savedAnalysis}</p>
          </div>
        )}
      </div>
    </div>
  );
}