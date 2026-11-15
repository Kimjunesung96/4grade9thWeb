// FILE PATH: src/utils/stressUtils.js
// CurrentStress.csv -> LiveDemoViewer용 블록 배열 (위험도별 색상)

export const RISK_ORDER = ['Safe', 'Warning', 'Danger', 'Destroyed'];

// 일반(Safe) 블록은 회색, 위험해질수록 노랑 → 빨강 → 보라(파괴)
export const RISK_COLORS = {
  Safe: '#9CA3AF',
  Warning: '#FACC15',
  Danger: '#EF4444',
  Destroyed: '#9333EA',
};

export const RISK_LABELS = {
  Safe: '안전(일반)',
  Warning: '주의',
  Danger: '위험',
  Destroyed: '파괴',
};

const RANK = { Safe: 0, Warning: 1, Danger: 2, Destroyed: 3 };

// BlockID = X_Z_Y (부호문자 + 숫자, 값*10) -> [x, y, z]
function parseIdPos(id) {
  try {
    const [sx, sz, sy] = id.split('_');
    const v = (s) => (s[0] === '-' ? -1 : 1) * parseInt(s.slice(1), 10) / 10;
    const pos = [v(sx), v(sy), v(sz)];
    return pos.some(Number.isNaN) ? null : pos;
  } catch {
    return null;
  }
}

/**
 * @param csvText      CurrentStress.csv 원문
 * @param positionMode 'orig'  = BlockID에 적힌 원래 위치 (형태 유지, 색만 확인)
 *                     'moved' = 테스트 후 현재 위치(PosX/Y/Z) (밀림/붕괴 확인)
 * @returns { blocks, counts }  blocks: [{x,y,z,mat,color,risk}]
 */
export function parseStressCsv(csvText, positionMode = 'orig') {
  const empty = { blocks: [], counts: { Safe: 0, Warning: 0, Danger: 0, Destroyed: 0 } };
  if (!csvText) return empty;

  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return empty;

  const headers = lines[0].split(',').map((h) => h.trim());
  const idx = {
    id: headers.indexOf('BlockID'),
    x: headers.indexOf('PosX'),
    y: headers.indexOf('PosY'),
    z: headers.indexOf('PosZ'),
    risk: headers.indexOf('RiskLevel'),
  };
  if (idx.id === -1 || idx.risk === -1) return empty;

  // 파괴된 블록은 DESTROYED 행으로 중복 기록되므로 BlockID당 1개로 합친다
  const map = new Map();
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const cols = lines[i].split(',');
    const id = (cols[idx.id] || '').trim();
    if (!id) continue;

    const risk = RANK[cols[idx.risk]?.trim()] !== undefined ? cols[idx.risk].trim() : 'Safe';
    const px = parseFloat(cols[idx.x]);
    const py = parseFloat(cols[idx.y]);
    const pz = parseFloat(cols[idx.z]);
    const hasPos = [px, py, pz].every(Number.isFinite);

    const prev = map.get(id);
    if (!prev) {
      map.set(id, { id, risk, cur: hasPos ? [px, py, pz] : null });
    } else {
      if (RANK[risk] > RANK[prev.risk]) prev.risk = risk;
      if (!prev.cur && hasPos) prev.cur = [px, py, pz];
    }
  }

  const counts = { Safe: 0, Warning: 0, Danger: 0, Destroyed: 0 };
  const blocks = [];
  map.forEach((b) => {
    const orig = parseIdPos(b.id);
    const pos = positionMode === 'moved' ? (b.cur || orig) : (orig || b.cur);
    if (!pos) return;
    counts[b.risk] += 1;
    blocks.push({
      x: pos[0],
      y: pos[1],
      z: pos[2],
      mat: 'Concrete',
      color: RISK_COLORS[b.risk],
      risk: b.risk,
    });
  });

  return { blocks, counts };
}