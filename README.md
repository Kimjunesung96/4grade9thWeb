# My CAD Builder

2D 그리드 에디터로 건물 평면을 그리거나, **건물 사진 한 장에서 3D 블록 구조(CSV)를 자동 추출**해서 저장·공유할 수 있는 웹 CAD 도구입니다.
Virtual Construct 프로젝트의 프론트엔드/백엔드 부분이며, 결과물인 CSV는 구조 시뮬레이션(Unity)에서 불러와 쓸 수 있는 블록 데이터 포맷입니다.

## 주요 기능

- **2D 그리드 에디터** (50×50): 벽 그리기 / 바닥 채우기 / 바닥 드래그 / 지우개 / 되돌리기, 벽 색상(1~5) 선택
- **층 쌓기**: 여러 층을 쌓아 하나의 3D 구조로 내보내기 (CSV / PNG / ZIP)
- **사진 → 3D 블록 추출**: 사진에서 건물 영역을 박스로 지정하면 AI가 3D 메쉬를 만들고, 이를 블록 CSV로 변환
- **지붕 보정**: 평지붕 기본값, 또는 모서리 4개 높이(A/B/C/D)를 직접 입력해 경사 지붕으로 보간
- **라이브 3D 뷰어**: 저장된 설계를 브라우저에서 바로 3D로 확인 (React Three Fiber)
- **갤러리/탐색**: 로그인 후 내 설계 관리, 다른 사용자 설계 탐색, 좋아요·댓글

## 기술 스택

| 영역 | 사용 기술 |
|---|---|
| 프론트엔드 | React 19, Vite, Tailwind CSS, React Three Fiber / drei / three, JSZip |
| 백엔드 | FastAPI, uvicorn, trimesh, numpy, pandas, Pillow |
| AI 추론 | TripoSR (단일 이미지 → 3D 메쉬), Google Colab(GPU) + ngrok |
| 데이터 | Supabase (users / blueprints / likes / comments) |

## 아키텍처

```
[React 프론트엔드]  ──(사진 + 박스 좌표)──▶  [FastAPI 백엔드 :8000]
        ▲                                          │
        │ CSV 다운로드                              │ 크롭한 이미지 전송
        │                                          ▼
        └───────── 블록 CSV ◀── 메쉬→블록 변환 ◀── [Colab: TripoSR + ngrok]
                                (+ 지붕 보정)            (GLB 메쉬 반환)
```

GPU가 필요한 TripoSR 추론은 Colab에서 돌리고, 백엔드는 그 결과 메쉬를 받아 블록 격자로 변환합니다.

## 시작하기

### 1. 프론트엔드

```bash
npm install
```

프로젝트 루트에 `.env` 파일을 만들고 Supabase 값을 넣습니다.

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

```bash
npm run dev
```

### 2. 백엔드

```bash
cd src/backend
pip install -r requirements.txt
pip install trimesh requests pillow-avif-plugin
python main.py        # http://localhost:8000
```

> `requirements.txt`에는 `trimesh`, `requests`, `pillow-avif-plugin`이 빠져 있어 위처럼 따로 설치해야 합니다. (`main.py`에서 import 함)

`src/backend/main.py` 상단의 `COLAB_API_URL`을 현재 실행 중인 Colab(ngrok) 주소로 바꿔야 합니다.

```python
COLAB_API_URL = "https://<ngrok-주소>/generate-mesh"
```

### 3. Colab (TripoSR 서버)

1. Colab 런타임 유형을 **GPU(T4)** 로 설정
2. 설치 셀 실행 후, 재시작 경고가 뜨면 **런타임 재시작**
3. 서버 셀 실행 → 출력되는 ngrok 주소를 위 `COLAB_API_URL`에 반영 (무료 ngrok은 실행할 때마다 주소가 바뀜)

백엔드가 기대하는 Colab API 규격:

| 항목 | 값 |
|---|---|
| 경로 | `POST /generate-mesh` |
| 업로드 필드명 | `image` (multipart) |
| 쿼리 파라미터 | `flatten_roof`, `snap_grid` (백엔드가 `"false"`로 전달) |
| 응답 | GLB 바이너리 (`trimesh.load(..., file_type="glb")`로 읽음) |

## API

### `POST /api/extract-3d-csv`
사진과 건물 영역을 받아 3D 블록 CSV를 반환합니다.

| 필드 | 설명 |
|---|---|
| `file` | 원본 사진 |
| `startX, startY, endX, endY` | 건물 영역 박스 (원본 이미지 픽셀 좌표) |
| `realHeightMeters` | 실제 건물 높이(m) — 메쉬 스케일 기준 |
| `roofTL, roofTR, roofBL, roofBR` | (선택) 지붕 모서리 높이(m). 4개 모두 있어야 보간 적용 |

### `POST /api/estimate-roof-corners`
박스 영역의 지붕 모서리 4개 높이를 추정합니다. 카메라와 가까운 순서대로 `A→D` 라벨을 붙여 `{"A": {"original_position": "BR", "estimated_height_m": 12.3}, ...}` 형태로 반환합니다.

## 지붕 보정 동작

- **입력 없음**: 지붕 영역(최상단 10%)의 Floor 블록을 전부 최상단 높이로 맞춰 **평지붕**으로 만듭니다.
- **A/B/C/D 4개 입력**: 모서리 높이를 bilinear 보간해 경사 지붕을 만듭니다. 서버는 추정 시 받은 `original_position`(TL/TR/BL/BR)으로 라벨을 슬롯에 매핑합니다.
- 지붕 블록을 옮길 때 생기는 빈틈은 **Wall 블록으로 채워** 몸체와 이어지게 합니다. (안 채우면 뚜껑만 공중에 뜸)

## CSV 포맷

```
BlockID,PosX,PosY,PosZ,Stress,RiskLevel,Prescription,Material,Tensile,Compressive,Tool,Type
```

- `Type`: `Floor`(수평면) / `Wall`(수직면) — 표면 블록만 생성되며 내부는 비어 있음
- 격자 간격 `GRID_PITCH = 3.0`, 좌표는 `격자 × 3 + 1.5`
- 스케일 `UNITS_PER_METER = 20` (1m = 20 단위)
- 블록 수 상한 `MAX_BLOCKS = 10000` (초과하면 격자를 키워 재시도)

## 폴더 구조

```
src/
├─ App.jsx                 # 라우팅(뷰 전환), 인증, 업로드 팝업
├─ supabaseClient.js
├─ views/                  # AuthView, DashboardView, EditorView, DetailView, ExploreView
├─ components/             # LiveDemoViewer(3D), BlueprintCard, BlueprintDetailModal, ui/
├─ utils/cadUtils.js       # 그리드·CSV·PNG 변환 유틸
└─ backend/
   ├─ main.py              # FastAPI 서버 (사진 → 메쉬 → 블록 CSV)
   └─ requirements.txt
```

## 문제 해결

- **Colab에서 `state_dict` 키 불일치 (`Missing/Unexpected key(s)`)**: `transformers`를 최신으로 올리면 ViT 레이어 이름이 달라져 TripoSR 체크포인트와 안 맞습니다. `transformers==4.35.0`으로 고정하세요. (`strict=False`로 넘기면 에러는 안 나지만 일부 가중치가 로드되지 않아 품질이 떨어질 수 있음)
- **Colab에서 `cupy` / `jax` + numpy 충돌**: Colab 기본 패키지가 `numpy>=2`를 요구해서 생깁니다. 서버 셀의 transformers 첫 import 전에 `USE_FLAX=0`, `USE_TF=0` 환경변수를 설정하고, 세션 재시작 직후 한 번만 실행하세요.
- **재시작 후 `No module named 'tsr'`**: 작업 디렉터리가 초기화된 것입니다. `%cd /content/TripoSR` 또는 `sys.path.append('/content/TripoSR')`를 셀 맨 위에 두세요.
- **지붕만 공중에 떠 있음**: 지붕 보정 시 틈 메우기 로직이 빠진 구버전 `main.py`입니다. 최신 `apply_roof_correction()`을 사용하세요.
- **백엔드 호출이 404/422**: `COLAB_API_URL`의 경로가 `/generate-mesh`인지, Colab 쪽 업로드 필드명이 `image`인지 확인하세요.
