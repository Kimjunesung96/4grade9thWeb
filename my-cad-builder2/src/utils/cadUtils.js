import CryptoJS from 'crypto-js';

// 비밀번호 암호화 로직 [cite: 29]
export const hashPw = (pw) => CryptoJS.SHA256(pw).toString();

// Flood Fill 알고리즘 [cite: 2-7]
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

// 블록 ID 포맷 생성기 [cite: 7-8]
export const formatID = (val) => {
  const absVal = Math.round(Math.abs(val));
  const sign = val < 0 ? "-" : "0";
  return sign + absVal.toString().padStart(3, '0');
};

// CSV 구조 데이터 파일 추출 [cite: 9-14]
export const exportToCSV = (grid) => {
  let csvContent = "BlockID,PosX,PosY,PosZ,Stress,RiskLevel,Prescription,Material,Tensile,Compressive,Tool,Type\n";
  grid.forEach((row, rIdx) => {
    row.forEach((cell, cIdx) => {
      if (cell !== 0) {
        const xCoord = cIdx * 3 + 1.5;
        const zCoord = rIdx * 3 + 1.5;
        const idX = formatID(xCoord * 10);
        const idZ = formatID(zCoord * 10);
        if (cell === 1) {
          for (let n = 1; n <= 5; n++) {
            const yCoord = n * 3 - 1.5;
            const idY = formatID(yCoord * 10);
            csvContent += `${idX}_${idZ}_${idY},${xCoord.toFixed(2)},${yCoord.toFixed(2)},${zCoord.toFixed(2)},0.00,Safe,N,Default,0.0,0.0,Existing,Wall\n`;
          }
        } else if (cell === 2) {
          csvContent += `${idX}_${idZ}_015,${xCoord.toFixed(2)},1.50,${zCoord.toFixed(2)},0.00,Safe,N,Default,0.0,0.0,Existing,Floor\n`;
        }
      }
    });
  });
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `blueprint_final.csv`;
  link.click();
};

// PNG 캔버스 이미지 저장 [cite: 14-17]
export const exportToPNG = (grid) => {
  const cellSize = 10;
  const canvas = document.createElement('canvas');
  canvas.width = 50 * cellSize; canvas.height = 50 * cellSize;
  const ctx = canvas.getContext('2d');
  grid.forEach((row, rIdx) => {
    row.forEach((cell, cIdx) => {
      ctx.fillStyle = cell === 1 ? '#000000' : cell === 2 ? '#D2D2D2' : '#FFFFFF';
      ctx.fillRect(cIdx * cellSize, rIdx * cellSize, cellSize, cellSize);
    });
  });
  const link = document.createElement('a');
  link.download = `blueprint_draw.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
};

// 이미지 파일에서 격자판 역추적 로드 [cite: 18-23]
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
    for (let r = 0; r < 50; r++) {
      for (let c = 0; c < 50; c++) {
        if ((imageData[(r * 50 + c) * 4] + imageData[(r * 50 + c) * 4 + 1] + imageData[(r * 50 + c) * 4 + 2]) / 3 < 128) {
          newGrid[r][c] = 1;
        }
      }
    }
    URL.revokeObjectURL(url);
    callback(newGrid);
  };
  img.src = url;
};