import CryptoJS from 'crypto-js';
import JSZip from 'jszip';

// 비밀번호 암호화 로직
export const hashPw = (pw) => CryptoJS.SHA256(pw).toString();

// ===================== 층별 벽 색상 매핑 =====================
// grid 값 체계: 0=빈칸, 1~5=벽(1~5층), 9=바닥
export const FLOOR_COLORS = {
  1: { hex: '#9CA3AF', tw: 'bg-gray-400', label: '1층' },   // 회색
  2: { hex: '#EF4444', tw: 'bg-red-500',  label: '2층' },   // 빨강
  3: { hex: '#F97316', tw: 'bg-orange-500', label: '3층' }, // 주황
  4: { hex: '#EAB308', tw: 'bg-yellow-500', label: '4층' }, // 노랑
  5: { hex: '#000000', tw: 'bg-black',    label: '5층' },   // 검정
};
export const FLOOR_VALUE = 9; // 바닥 칸 값 (기존 2에서 변경 → 1~5 벽 값과 충돌 방지)

// 셀 값을 기준으로 표시 색상(hex)을 반환
export const getCellColorHex = (cell) => {
  if (cell === FLOOR_VALUE) return '#D2D2D2';
  if (cell >= 1 && cell <= 5) return FLOOR_COLORS[cell].hex;
  return '#FFFFFF';
};

// 셀 값을 기준으로 표시 색상(tailwind 클래스)을 반환
export const getCellColorClass = (cell) => {
  if (cell === FLOOR_VALUE) return 'bg-gray-300';
  if (cell >= 1 && cell <= 5) return FLOOR_COLORS[cell].tw;
  return 'bg-white';
};

// Flood Fill 알고리즘
export const floodFill = (grid, r, c, replacementVal) => {
  const targetVal = grid[r][c];
  if (targetVal === replacementVal) return grid;
  const newGrid = JSON.parse(JSON.stringify(grid));
  const stack = [[r, c]];
  while (stack.length > 0) {
    const [currR, currC] = stack.pop();
    if (currR >= 0 && currR < 50 && currC >= 0 && currC < 50 && newGrid[currR][currC] === targetVal) {
      newGrid[currR][currC] = replacementVal;
      stack.push([currR + 1, currC], [currR - 1, currC], [currR, currC + 1], [currR, currC - 1]);
    }
  }
  return newGrid;
};

// 블록 ID 포맷 생성기
export const formatID = (val) => {
  const absVal = Math.round(Math.abs(val));
  const sign = val < 0 ? "-" : "0";
  return sign + absVal.toString().padStart(3, '0');
};

// 사각형 테두리(두께 2칸)만 칠하고 안쪽은 비우는 벽 그리기 로직
// startR/endR/startC/endC: 드래그 영역의 행/열 범위 (min~max 정렬된 값)
// thickness: 테두리 두께 (기본 2칸)
export const applyWallBorder = (gridRef, startR, endR, startC, endC, floorValue, thickness = 2) => {
  for (let r = startR; r <= endR; r++) {
    for (let c = startC; c <= endC; c++) {
      const distFromTop = r - startR;
      const distFromBottom = endR - r;
      const distFromLeft = c - startC;
      const distFromRight = endC - c;
      const minDist = Math.min(distFromTop, distFromBottom, distFromLeft, distFromRight);
      // 테두리(바깥쪽 thickness칸)에 해당하면 칠하고, 안쪽이면 건드리지 않음
      if (minDist < thickness) {
        gridRef[r][c] = floorValue;
      }
    }
  }
  return gridRef;
};

// CSV 구조 데이터 파일 추출 (1~5층 벽 + 바닥)
export const exportToCSV = (grid) => {
  let csvContent = "BlockID,PosX,PosY,PosZ,Stress,RiskLevel,Prescription,Material,Tensile,Compressive,Tool,Type\n";
  grid.forEach((row, rIdx) => {
    row.forEach((cell, cIdx) => {
      if (cell === 0) return;
      const xCoord = cIdx * 3 + 1.5;
      const zCoord = rIdx * 3 + 1.5;
      const idX = formatID(xCoord * 10);
      const idZ = formatID(zCoord * 10);

      if (cell >= 1 && cell <= 5) {
        // cell 값 = 층 번호. 해당 층 높이에만 벽 블록 생성
        const floorNum = cell;
        const yCoord = floorNum * 3 - 1.5;
        const idY = formatID(yCoord * 10);
        csvContent += `${idX}_${idZ}_${idY},${xCoord.toFixed(2)},${yCoord.toFixed(2)},${zCoord.toFixed(2)},0.00,Safe,N,Default,0.0,0.0,Existing,Wall_F${floorNum}\n`;
      } else if (cell === FLOOR_VALUE) {
        csvContent += `${idX}_${idZ}_015,${xCoord.toFixed(2)},1.50,${zCoord.toFixed(2)},0.00,Safe,N,Default,0.0,0.0,Existing,Floor\n`;
      }
    });
  });
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `blueprint_final.csv`;
  link.click();
};

// ===================== 무한 누적(페이지 스택) 시스템 =====================
// 페이지(한 장) 안에서는 셀 값(1~5)이 "그 페이지 안에서의 상대 높이(색)"를 의미.
// 페이지를 기입(commit)할 때, 그 페이지에서 실제 쓰인 최고 색번호(maxColorUsed)를
// 이전 페이지의 (pageBase + maxColorUsed) + 1 에 이어붙여서 다음 페이지의 시작 높이를 정한다.
// → 종이(페이지)를 한 장씩 쌓아 올리되, 페이지마다 두께(1~5칸)가 달라도 절대 안 겹침.

// 현재 grid에서 실제 쓰인 색(1~5) 중 최댓값을 찾는다 (안 쓰였으면 1)
export const getMaxColorUsed = (grid) => {
  let maxColorUsed = 0;
  grid.forEach(row => row.forEach(cell => {
    if (cell >= 1 && cell <= 5 && cell > maxColorUsed) maxColorUsed = cell;
  }));
  return maxColorUsed || 1;
};

// 이전 스택 정보를 바탕으로 다음 페이지가 시작될 pageBase를 계산
export const getNextPageBase = (stackedFloors) => {
  if (stackedFloors.length === 0) return 0;
  const prev = stackedFloors[stackedFloors.length - 1];
  return prev.pageBase + prev.maxColorUsed;
};

// 누적된 모든 페이지를 하나의 CSV로 합쳐서 내보내기
// 🌟 셀 값(cell, 1~5)은 "그 칸에 쌓을 블록 개수(반복 층수)"를 의미한다.
//    예: 색=2(빨강)면 pageBase+1층, pageBase+2층 이렇게 2칸을 그 자리에 쌓아 올린다.
// 🌟 CSV로 불러온 페이지(csvPages)와 수동으로 이어그린 페이지(stackedFloors)를
//    "지금 실제로 존재하는 건물 전체"로 합쳐서 하나의 stackedFloors 형식 배열로 반환.
//    - csvPages가 있는 상태(= 아직 "이 페이지 기입하고 다음 장으로"를 눌러 흡수되기 전)라면
//      CSV 페이지들을 pageBase = pageIndex*5 에 깔아준다. 지금 편집 중인 페이지(csvPageIndex)는
//      csvPages 스냅샷이 아니라 화면에 있는 최신 grid를 써서, 커밋 전 수정사항도 내보내기/미리보기에 반영되게 한다.
//    - csvPages가 비어있다면(=CSV 미로드거나 이미 흡수됨) 기존 stackedFloors를 그대로 사용.
//    ⚠️ 두 시스템은 항상 배타적으로 취급한다: commitCurrentFloor에서 csvPages를 stackedFloors로
//       흡수시킨 뒤 비우기 때문에, 흡수 이후에는 stackedFloors 쪽 로직만 타면 된다.
export const getCombinedFloors = (stackedFloors, csvPages, csvPageIndex, currentGrid) => {
  if (!csvPages || csvPages.length === 0) return stackedFloors;
  return csvPages.map((pageGrid, i) => ({
    pageBase: i * 5,
    maxColorUsed: 5,
    grid: i === csvPageIndex ? currentGrid : pageGrid,
  }));
};

export const exportStackedFloorsToCSV = (stackedFloors) => {
  let csvContent = "BlockID,PosX,PosY,PosZ,Stress,RiskLevel,Prescription,Material,Tensile,Compressive,Tool,Type\n";
  stackedFloors.forEach(({ pageBase, grid }) => {
    grid.forEach((row, rIdx) => {
      row.forEach((cell, cIdx) => {
        if (cell < 1 || cell > 5) return; // 0(빈칸)은 무시.
        const xCoord = cIdx * 3 + 1.5;
        const zCoord = rIdx * 3 + 1.5;
        const idX = formatID(xCoord * 10);
        const idZ = formatID(zCoord * 10);
        for (let layer = 1; layer <= cell; layer++) {
          const n = pageBase + layer; // 절대 누적 높이 인덱스
          const yCoord = 1.5 + 3 * n;
          const idY = formatID(yCoord * 10);
          csvContent += `${idX}_${idZ}_${idY},${xCoord.toFixed(2)},${yCoord.toFixed(2)},${zCoord.toFixed(2)},0.00,Safe,N,Default,0.0,0.0,Existing,Block_N${n}\n`;
        }
      });
    });
  });
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `blueprint_stacked.csv`;
  link.click();
};

// PNG 캔버스 이미지 저장 (mbs_ 접두사 자동 부여)
export const exportToPNG = (grid, fileName) => {
  const cellSize = 10;
  const canvas = document.createElement('canvas');
  canvas.width = 50 * cellSize; canvas.height = 50 * cellSize;
  const ctx = canvas.getContext('2d');
  grid.forEach((row, rIdx) => {
    row.forEach((cell, cIdx) => {
      ctx.fillStyle = getCellColorHex(cell);
      ctx.fillRect(cIdx * cellSize, rIdx * cellSize, cellSize, cellSize);
    });
  });

  // 유니티 스캐너 인식용 mbs_ 접두사 강제 부여
  let baseName = (fileName && fileName.trim()) ? fileName.trim() : 'blueprint_draw';
  baseName = baseName.replace(/\.png$/i, ''); // 혹시 사용자가 .png까지 입력해도 중복 방지
  baseName = baseName.replace(/^mbs_/i, '');   // 이미 mbs_가 붙어있으면 중복 방지
  const finalName = `mbs_${baseName}.png`;

  const link = document.createElement('a');
  link.download = finalName;
  link.href = canvas.toDataURL('image/png');
  link.click();
};

// 🌟 grid 하나를 PNG Blob으로 변환 (다운로드 없이 메모리에서만, zip에 넣기 위함)
const gridToPngBlob = (grid) => {
  const cellSize = 10;
  const canvas = document.createElement('canvas');
  canvas.width = 50 * cellSize; canvas.height = 50 * cellSize;
  const ctx = canvas.getContext('2d');
  grid.forEach((row, rIdx) => {
    row.forEach((cell, cIdx) => {
      ctx.fillStyle = getCellColorHex(cell);
      ctx.fillRect(cIdx * cellSize, rIdx * cellSize, cellSize, cellSize);
    });
  });
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
};

// 🌟 여러 장의 grid를 PNG로 각각 변환한 뒤 zip 파일 하나로 묶어서 한 번에 다운로드
// pages: [grid1, grid2, ...], labels: 각 grid에 대응하는 파일명(확장자 제외, mbs_ 접두사는 자동 부여)
export const downloadGridPagesAsZip = async (pages, labels, zipName = 'floor_pages') => {
  if (!pages || pages.length === 0) return;
  const zip = new JSZip();
  for (let i = 0; i < pages.length; i++) {
    const blob = await gridToPngBlob(pages[i]);
    const label = (labels && labels[i]) ? labels[i] : `page_${i + 1}`;
    zip.file(`mbs_${label}.png`, blob);
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(zipBlob);
  link.download = `${zipName}.zip`;
  link.click();
  URL.revokeObjectURL(link.href);
};

// 🌟 페이지 수에 따라 자동으로 방식을 결정: 6장 미만이면 개별 PNG 다운로드, 6장 이상이면 zip 하나로 묶어서 다운로드
// (브라우저 팝업 차단 및 다운로드 폴더 지저분해지는 문제를 방지하기 위한 기준값)
const ZIP_THRESHOLD = 6;
export const downloadPagesAsPngOrZip = async (pages, labels, zipName = 'floor_pages') => {
  if (!pages || pages.length === 0) return;
  if (pages.length >= ZIP_THRESHOLD) {
    await downloadGridPagesAsZip(pages, labels, zipName);
  } else {
    for (let i = 0; i < pages.length; i++) {
      const label = (labels && labels[i]) ? labels[i] : `page_${i + 1}`;
      exportToPNG(pages[i], label);
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
};

// 이미지 파일에서 격자판 역추적 로드 (층별 색상 인식)
export const importPNGToGrid = (file, callback) => {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 50; canvas.height = 50;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, 50, 50);
    const imageData = ctx.getImageData(0, 0, 50, 50).data;
    const newGrid = Array(50).fill(null).map(() => Array(50).fill(0));

    // 색상 → grid 값 역매핑 테이블 준비 (RGB 거리 기준 최근접 매칭)
    const colorTable = [
      { val: FLOOR_VALUE, rgb: [210, 210, 210] }, // 바닥
      ...Object.entries(FLOOR_COLORS).map(([val, info]) => {
        const hex = info.hex.replace('#', '');
        const rgb = [
          parseInt(hex.substring(0, 2), 16),
          parseInt(hex.substring(2, 4), 16),
          parseInt(hex.substring(4, 6), 16),
        ];
        return { val: Number(val), rgb };
      }),
    ];

    for (let r = 0; r < 50; r++) {
      for (let c = 0; c < 50; c++) {
        const idx = (r * 50 + c) * 4;
        const px = [imageData[idx], imageData[idx + 1], imageData[idx + 2]];
        // 흰색(빈칸)에 가까우면 0으로 처리
        if (px[0] > 245 && px[1] > 245 && px[2] > 245) {
          newGrid[r][c] = 0;
          continue;
        }
        // 가장 가까운 색을 찾아 매핑
        let bestVal = 0;
        let bestDist = Infinity;
        for (const entry of colorTable) {
          const d = Math.pow(px[0] - entry.rgb[0], 2) + Math.pow(px[1] - entry.rgb[1], 2) + Math.pow(px[2] - entry.rgb[2], 2);
          if (d < bestDist) { bestDist = d; bestVal = entry.val; }
        }
        newGrid[r][c] = bestVal;
      }
    }
    URL.revokeObjectURL(url);
    callback(newGrid);
  };
  img.src = url;
};
// 2D 격자 데이터를 3D 뷰어용 배열(x, y, z, mat)로 변환해주는 함수
export const convertGridTo3DData = (grid) => {
  if (!grid) return [];
  const blocks = [];
  grid.forEach((row, rIdx) => {
    row.forEach((cell, cIdx) => {
      if (cell) {
        // 셀 값이 숫자면 해당 층수, 아니면 기본 1층으로 계산
        const floorHeight = typeof cell === 'number' ? cell : 1; 
        blocks.push({
          x: cIdx * 3.0, 
          y: floorHeight * 3.0 - 1.5, 
          z: rIdx * 3.0, 
          mat: 'Concrete' // 기본 뷰는 콘크리트 재질로 통일
        });
      }
    });
  });
  return blocks;
};

// ===================== 3D CSV → 층별 PNG 분할 =====================
// 🌟 Unity에서 넘어온 3D CSV(20층 등 여러 층)를 웹의 2D grid 색상 체계(1~5층)에
//    맞게 5층씩 잘라서 grid 배열 여러 개로 변환. (각 grid는 exportToPNG 그대로 사용 가능)
export const csvDataToFloorPages = (csvText, floorsPerPage = 5, gridSize = 50) => {
  if (!csvText) return [];
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  const idx = {
    x: headers.indexOf('PosX'),
    y: headers.indexOf('PosY'),
    z: headers.indexOf('PosZ'),
  };
  if (idx.x === -1 || idx.y === -1 || idx.z === -1) return [];

  const points = [];
  let minX = Infinity, minZ = Infinity;
  const ySet = new Set();

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const cols = lines[i].split(',');
    const x = parseFloat(cols[idx.x]);
    const y = parseFloat(cols[idx.y]);
    const z = parseFloat(cols[idx.z]);
    if ([x, y, z].some(Number.isNaN)) continue;
    points.push({ x, y, z });
    if (x < minX) minX = x;
    if (z < minZ) minZ = z;
    ySet.add(Math.round(y));
  }
  if (points.length === 0) return [];

  // 실제 존재하는 층 높이들을 오름차순 정렬 → "몇 번째 층"인지 인덱스 매기기
  const sortedYs = Array.from(ySet).sort((a, b) => a - b);
  const floorIndexOf = (y) => sortedYs.indexOf(Math.round(y));

  const totalFloors = sortedYs.length;
  const pageCount = Math.ceil(totalFloors / floorsPerPage);
  const pages = Array.from({ length: pageCount }, () =>
    Array(gridSize).fill().map(() => Array(gridSize).fill(0))
  );

  points.forEach(p => {
    const col = Math.round((p.x - minX) / 3.0);
    const row = Math.round((p.z - minZ) / 3.0);
    if (col < 0 || col >= gridSize || row < 0 || row >= gridSize) return;

    const floorIdx = floorIndexOf(p.y); // 0 ~ totalFloors-1
    const pageNum = Math.floor(floorIdx / floorsPerPage);
    const colorInPage = (floorIdx % floorsPerPage) + 1; // 1~5

    // 이미 더 높은 색(층)이 칠해져 있으면 덮어쓰지 않고 최대값 유지
    pages[pageNum][row][col] = Math.max(pages[pageNum][row][col], colorInPage);
  });

  return pages; // [grid1, grid2, grid3, ...] 각 grid는 exportToPNG(grid, name) 그대로 사용 가능
};

// 🌟 쪼갠 grid들을 기존 exportToPNG로 순차 다운로드 (파일이 개별로 여러 장 떨어짐 — 구버전, 호환용으로 유지)
//    (브라우저가 연속 다운로드를 팝업처럼 막는 경우가 있어 약간의 딜레이를 둠)
export const downloadFloorPagesAsPngs = async (csvText, baseName = 'structure', floorsPerPage = 5) => {
  const pages = csvDataToFloorPages(csvText, floorsPerPage);
  if (pages.length === 0) {
    alert('CSV에서 유효한 좌표(PosX/PosY/PosZ)를 찾지 못했습니다.');
    return;
  }
  for (let i = 0; i < pages.length; i++) {
    const startFloor = i * floorsPerPage + 1;
    const endFloor = Math.min((i + 1) * floorsPerPage, pages.length * floorsPerPage);
    const label = `${baseName}_p${i + 1}_floors${startFloor}-${endFloor}`;
    exportToPNG(pages[i], label);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
};

// 🌟 쪼갠 grid들을 PNG로 변환해서 다운로드 (6장 미만은 개별, 6장 이상은 zip 하나로 자동 전환)
export const downloadFloorPagesAsZip = async (csvText, baseName = 'structure', floorsPerPage = 5) => {
  const pages = csvDataToFloorPages(csvText, floorsPerPage);
  if (pages.length === 0) {
    alert('CSV에서 유효한 좌표(PosX/PosY/PosZ)를 찾지 못했습니다.');
    return;
  }
  const labels = pages.map((_, i) => {
    const startFloor = i * floorsPerPage + 1;
    const endFloor = Math.min((i + 1) * floorsPerPage, pages.length * floorsPerPage);
    return `${baseName}_p${i + 1}_floors${startFloor}-${endFloor}`;
  });
  await downloadPagesAsPngOrZip(pages, labels, `${baseName}_floors`);
};