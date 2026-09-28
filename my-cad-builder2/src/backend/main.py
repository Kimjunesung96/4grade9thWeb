import io
import pillow_avif  # noqa: F401  (AVIF 포맷 지원 — PIL 기본 탑재 아님, import만 해도 등록됨)
import requests
import trimesh
import numpy as np
import uvicorn
import pandas as pd
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from PIL import Image

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

COLAB_API_URL = "https://subject-campfire-malformed.ngrok-free.dev/generate-mesh"

MAX_BLOCKS = 10000
GRID_PITCH = 3.0
UNITS_PER_METER = 20.0


def format_id(val):
    abs_val = round(abs(val))
    sign = "-" if val < 0 else "0"
    return f"{sign}{str(abs_val).zfill(3)}"


def get_mesh_from_colab(img_bytes: bytes) -> trimesh.Trimesh:
    resp = requests.post(
        COLAB_API_URL,
        files={"image": ("input.png", img_bytes, "image/png")},
        params={"flatten_roof": "false", "snap_grid": "false"},
        timeout=180,
    )
    resp.raise_for_status()

    mesh = trimesh.load(io.BytesIO(resp.content), file_type="glb")
    if isinstance(mesh, trimesh.Scene):
        mesh = trimesh.util.concatenate(mesh.dump())
    return mesh


def mesh_to_blocks(mesh: trimesh.Trimesh, real_height_m: float, max_blocks: int = MAX_BLOCKS):
    extents = mesh.bounds[1] - mesh.bounds[0]
    tallest_axis = int(np.argmax(extents))

    if tallest_axis == 2:
        rot = trimesh.transformations.rotation_matrix(
            angle=np.radians(-90), direction=[1, 0, 0], point=mesh.centroid
        )
        mesh.apply_transform(rot)
    elif tallest_axis == 0:
        rot = trimesh.transformations.rotation_matrix(
            angle=np.radians(90), direction=[0, 0, 1], point=mesh.centroid
        )
        mesh.apply_transform(rot)

    mirror = trimesh.transformations.scale_matrix(-1, direction=[0, 0, 1], origin=mesh.centroid)
    mesh.apply_transform(mirror)
    mesh.invert()

    print(f"📏 축 보정: extents={extents}, tallest_axis={tallest_axis}")

    mesh_height_raw = mesh.bounds[1][1] - mesh.bounds[0][1]
    if mesh_height_raw <= 0:
        raise ValueError("메시 높이를 계산할 수 없습니다 (생성된 메시가 비정상일 수 있음)")

    target_height_units = real_height_m * UNITS_PER_METER
    mesh.apply_scale(target_height_units / mesh_height_raw)
    mesh.apply_translation([0, -mesh.bounds[0][1], 0])

    surface_area = mesh.area
    pitch = max(GRID_PITCH, round(((surface_area / max_blocks) ** 0.5) / GRID_PITCH) * GRID_PITCH)

    raw_blocks = []
    for attempt in range(5):
        estimated_cells = surface_area / (pitch ** 2)
        sample_count = max(int(estimated_cells * 6), 5000)
        points, face_indices = trimesh.sample.sample_surface(mesh, count=sample_count)
        normals = mesh.face_normals[face_indices]

        raw_blocks = []
        seen_ids = set()
        for (x, y, z), normal in zip(points, normals):
            grid_x = round((x - 1.5) / pitch)
            grid_y = round((y - 1.5) / pitch)
            grid_z = round((z - 1.5) / pitch)

            pos_x = grid_x * GRID_PITCH + 1.5
            pos_y = grid_y * GRID_PITCH + 1.5
            pos_z = grid_z * GRID_PITCH + 1.5

            id_x = format_id(pos_x * 10)
            id_z = format_id(pos_z * 10)
            id_y = format_id(pos_y * 10)
            block_id = f"{id_x}_{id_z}_{id_y}"
            if block_id in seen_ids:
                continue
            seen_ids.add(block_id)

            block_type = "Floor" if abs(normal[1]) > 0.7 else "Wall"

            raw_blocks.append({
                "BlockID": block_id,
                "PosX": round(pos_x, 2),
                "PosY": round(pos_y, 2),
                "PosZ": round(pos_z, 2),
                "Stress": 0.00,
                "RiskLevel": "Safe",
                "Prescription": "N",
                "Material": "Default",
                "Tensile": 400.0,
                "Compressive": 400.0,
                "Tool": "Existing",
                "Type": block_type,
            })

        print(f"📐 시도 {attempt + 1}: pitch={pitch} → {len(raw_blocks)}개 블록")
        if len(raw_blocks) <= max_blocks:
            break
        pitch += GRID_PITCH

    return raw_blocks


# ====================================================================
# 🌟 지붕 모서리 A/B/C/D 자동 추정 (카메라와의 수평 거리 기준 정렬)
# ====================================================================
def order_roof_corners_by_distance(mesh, x_min, x_max, z_min, z_max):
    """
    지붕 4개 모서리를 카메라와 가까운 순서대로 A→D 로 라벨링.
    - 거리 판정은 X,Z 평면(수평)만 사용. Y(높이)는 결과값이라 거리 계산에서 반드시 제외.
    - main.py의 미러링 보정 이후 좌표계 기준, Z가 큰 쪽이 카메라(정면)에 가깝다고 가정.
    """
    verts = mesh.vertices
    y_max = verts[:, 1].max()
    y_min = verts[:, 1].min()
    roof_mask = verts[:, 1] >= y_max - (y_max - y_min) * 0.10
    roof_verts = verts[roof_mask]

    if len(roof_verts) == 0:
        roof_verts = verts  # 안전장치: 지붕 영역이 안 잡히면 전체 정점으로 대체

    corners_xz = {
        "TL": (x_min, z_min),
        "TR": (x_max, z_min),
        "BL": (x_min, z_max),
        "BR": (x_max, z_max),
    }

    corner_info = {}
    for key, (cx, cz) in corners_xz.items():
        # 1. 이 모서리 위치(cx, cz)에 가장 가까운 실제 지붕 꼭짓점 찾기 (X,Z만 비교)
        dists_to_corner = np.hypot(roof_verts[:, 0] - cx, roof_verts[:, 2] - cz)
        nearest = roof_verts[dists_to_corner.argmin()]
        corner_info[key] = {
            "pos": (float(nearest[0]), float(nearest[1]), float(nearest[2])),
        }

    # 2. 카메라(정면, Z가 큰 방향)에 가까운 순서로 정렬 — Z값 큰 것부터
    ordered_keys = sorted(corner_info.keys(), key=lambda k: -corner_info[k]["pos"][2])

    label_map = {}
    for i, key in enumerate(ordered_keys):
        letter = chr(ord("A") + i)  # A, B, C, D
        label_map[letter] = {
            "original_position": key,
            "estimated_height_m": round(corner_info[key]["pos"][1] / UNITS_PER_METER, 2),
        }
    return label_map


# ====================================================================
# 🌟 지붕 높이 보정: 평지붕(기본값) 또는 4개 모서리 보간(상세입력)
# ====================================================================
def apply_roof_correction(raw_blocks: list, corner_heights: dict | None = None):
    """
    corner_heights가 없으면(아무 입력 없음): 모서리 4개 높이가 같다고 가정 → 평지붕으로 강제.
    corner_heights가 있으면: {"tl":.., "tr":.., "bl":.., "br":..} (미터) 로 bilinear interpolation.
    """
    if not raw_blocks:
        return raw_blocks

    xs = [b["PosX"] for b in raw_blocks]
    zs = [b["PosZ"] for b in raw_blocks]
    ys = [b["PosY"] for b in raw_blocks]
    x_min, x_max = min(xs), max(xs)
    z_min, z_max = min(zs), max(zs)
    y_max, y_min = max(ys), min(ys)

    roof_threshold = y_max - (y_max - y_min) * 0.10
    roof_blocks = [b for b in raw_blocks if b["Type"] == "Floor" and b["PosY"] >= roof_threshold]
    other_blocks = [b for b in raw_blocks if b not in roof_blocks]

    if not roof_blocks:
        return raw_blocks

    if corner_heights is None:
        flat_y = round(y_max, 2)
        for b in roof_blocks:
            b["PosY"] = flat_y
        print(f"🏠 지붕 상세입력 없음 → 모서리 4개 동일 높이({flat_y})로 평지붕 보정")
    else:
        tl = corner_heights["tl"] * UNITS_PER_METER
        tr = corner_heights["tr"] * UNITS_PER_METER
        bl = corner_heights["bl"] * UNITS_PER_METER
        br = corner_heights["br"] * UNITS_PER_METER

        def interp_height(x, z):
            u = 0.0 if x_max == x_min else (x - x_min) / (x_max - x_min)
            v = 0.0 if z_max == z_min else (z - z_min) / (z_max - z_min)
            top = tl + (tr - tl) * u
            bot = bl + (br - bl) * u
            return top + (bot - top) * v

        for b in roof_blocks:
            b["PosY"] = round(interp_height(b["PosX"], b["PosZ"]), 2)
        print(f"🏠 모서리 4개 입력값으로 지붕 보간 완료 (tl={tl}, tr={tr}, bl={bl}, br={br})")

    return other_blocks + roof_blocks


# ====================================================================
# 🌟 새 엔드포인트: 지붕 모서리 A/B/C/D 자동 추정 (박스 드래그 직후 프론트에서 호출)
# ====================================================================
@app.post("/api/estimate-roof-corners")
async def estimate_roof_corners(
    file: UploadFile = File(...),
    startX: float = Form(...),
    startY: float = Form(...),
    endX: float = Form(...),
    endY: float = Form(...),
):
    img_bytes = await file.read()
    try:
        image = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"이미지를 읽을 수 없습니다: {e}")

    sx, sy = max(0, int(startX)), max(0, int(startY))
    ex, ey = min(image.width, int(endX)), min(image.height, int(endY))
    cropped = image.crop((sx, sy, ex, ey))

    crop_bytes_io = io.BytesIO()
    cropped.save(crop_bytes_io, format="PNG")
    crop_bytes = crop_bytes_io.getvalue()

    mesh = get_mesh_from_colab(crop_bytes)

    x_min, x_max = float(mesh.bounds[0][0]), float(mesh.bounds[1][0])
    z_min, z_max = float(mesh.bounds[0][2]), float(mesh.bounds[1][2])

    label_map = order_roof_corners_by_distance(mesh, x_min, x_max, z_min, z_max)
    return label_map
    # 예: {"A": {"original_position": "BR", "estimated_height_m": 12.3}, "B": {...}, "C": {...}, "D": {...}}


@app.post("/api/extract-3d-csv")
async def extract_3d_csv(
    file: UploadFile = File(...),
    startX: float = Form(...),
    startY: float = Form(...),
    endX: float = Form(...),
    endY: float = Form(...),
    realHeightMeters: float = Form(...),
    # 🌟 지붕 모서리 4개 높이(미터) — 상세입력 안 하면 전부 None → 평지붕 기본값
    roofTL: float | None = Form(None),
    roofTR: float | None = Form(None),
    roofBL: float | None = Form(None),
    roofBR: float | None = Form(None),
):
    print(f"📥 사진 데이터 및 박스 좌표 수신: ({startX}, {startY}) ~ ({endX}, {endY}) | 실제 높이: {realHeightMeters}m")

    img_bytes = await file.read()
    try:
        image = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"이미지를 읽을 수 없습니다 (지원하지 않는 포맷일 수 있음): {e}",
        )

    sx, sy = max(0, int(startX)), max(0, int(startY))
    ex, ey = min(image.width, int(endX)), min(image.height, int(endY))
    cropped = image.crop((sx, sy, ex, ey))

    crop_bytes_io = io.BytesIO()
    cropped.save(crop_bytes_io, format="PNG")
    crop_bytes = crop_bytes_io.getvalue()

    print("🤖 콜랍 AI 모델에 메시 생성 요청 중...")
    mesh = get_mesh_from_colab(crop_bytes)
    print(f"✅ 메시 수신 완료 (vertices={len(mesh.vertices)}, faces={len(mesh.faces)})")

    raw_blocks = mesh_to_blocks(mesh, real_height_m=realHeightMeters)

    # 🌟 지붕 보정: 4개 값이 모두 들어오면 상세 보간, 하나라도 비어있으면 평지붕 기본값
    corner_heights = None
    if None not in (roofTL, roofTR, roofBL, roofBR):
        corner_heights = {"tl": roofTL, "tr": roofTR, "bl": roofBL, "br": roofBR}
    raw_blocks = apply_roof_correction(raw_blocks, corner_heights)

    df = pd.DataFrame(raw_blocks)
    df = df.drop_duplicates(subset=["BlockID"])
    df = df.sort_values(by=["PosZ", "PosX", "PosY"])

    print(f"✅ 총 {len(df)}개의 3D 빌딩 블록 엑셀 변환 완료! (속은 비어있는 표면 전용 구조)")

    output = io.StringIO()
    df.to_csv(output, index=False)
    output.seek(0)

    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=ai_extracted_3d.csv"},
    )


if __name__ == "__main__":
    print("🚀 CAD AI 백엔드 서버를 시작합니다. (포트 8000)")
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)