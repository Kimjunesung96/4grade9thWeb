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

# 리액트(Vite) 프론트엔드에서 API를 호출할 수 있도록 CORS 허용 세팅
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 실제 배포 시에는 "http://localhost:5173" 등으로 제한
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ====================================================================
# 🌟 콜랍에서 띄운 ngrok 주소. 콜랍 노트북을 다시 켤 때마다 바뀌니
#    매번 여기를 갱신해줘야 합니다!
# ====================================================================
COLAB_API_URL = "https://subject-campfire-malformed.ngrok-free.dev/generate-mesh"

MAX_BLOCKS = 10000          # 유니티 렌더링 한도 (블록 렌더링 X / 10,000 MAX)
GRID_PITCH = 3.0            # 기존 스케일 약속: 3유닛 = 15cm
UNITS_PER_METER = 20.0      # 1m = 20유닛 (3유닛=15cm 이므로 1m = 6.667*3유닛 -> 20유닛)


def format_id(val):
    """
    JS의 formatID 완벽 재현!
    소수점을 10배수로 날리고 015, -105 형태로 포맷팅합니다.
    """
    abs_val = round(abs(val))
    sign = "-" if val < 0 else "0"
    return f"{sign}{str(abs_val).zfill(3)}"


def get_mesh_from_colab(img_bytes: bytes) -> trimesh.Trimesh:
    """
    콜랍에 올려둔 TripoSR API에 사진을 보내고, 생성된 3D 메시(.glb)를 받아옵니다.
    (정면 사진 한 장 → AI가 뒷면/옆면까지 추론해서 만든 입체 메시)
    """
    resp = requests.post(
        COLAB_API_URL,
        files={"image": ("input.png", img_bytes, "image/png")},
        timeout=180,
    )
    resp.raise_for_status()

    mesh = trimesh.load(io.BytesIO(resp.content), file_type="glb")
    # GLB는 여러 메시가 묶인 Scene으로 로드될 수 있어서 하나로 합쳐줍니다
    if isinstance(mesh, trimesh.Scene):
        mesh = trimesh.util.concatenate(mesh.dump())
    return mesh


def mesh_to_blocks(mesh: trimesh.Trimesh, real_height_m: float, max_blocks: int = MAX_BLOCKS):
    """
    🌟 건프라 축소 비율 방식: 건물 표면적에 맞춰 블록 크기(pitch)를 역산해서,
    랜덤 솎아내기 없이 max_blocks 예산 안에서 표면 전체를 빈틈없이 덮습니다.
    """
    # 0. 🌟 축 보정: range가 제일 큰 축 = 실제 "높이"라고 보고, 그 축을 Y로 맞춤
    #    (고정 90도 보정 대신, TripoSR 결과물 방향이 들쭉날쭉해도 항상 맞도록 자동 판별)
    extents = mesh.bounds[1] - mesh.bounds[0]  # [x_range, y_range, z_range]
    tallest_axis = int(np.argmax(extents))

    if tallest_axis == 2:  # 높이가 Z축 -> X축 기준 -90도 회전해서 Y로
        rot = trimesh.transformations.rotation_matrix(
            angle=np.radians(-90), direction=[1, 0, 0], point=mesh.centroid
        )
        mesh.apply_transform(rot)
    elif tallest_axis == 0:  # 높이가 X축 -> Z축 기준 90도 회전해서 Y로
        rot = trimesh.transformations.rotation_matrix(
            angle=np.radians(90), direction=[0, 0, 1], point=mesh.centroid
        )
        mesh.apply_transform(rot)
    # tallest_axis == 1이면 이미 Y축이 높이니까 회전 안 함

    # 🌟 앞뒤(Z축) 반전 보정: TripoSR/GLB 결과물이 항상 앞뒤가 뒤집혀서 나오므로
    #    여기서 실제 메시 좌표 자체를 거울처럼 뒤집어서 CSV/미리보기가 처음부터 올바르게 나오게 함.
    #    (프론트엔드에서 화면용으로 임시로 뒤집던 방식은 제거했음 — 이제 데이터 자체가 정답)
    mirror = trimesh.transformations.scale_matrix(-1, direction=[0, 0, 1], origin=mesh.centroid)
    mesh.apply_transform(mirror)
    mesh.invert()  # 미러링하면 face winding이 뒤집혀서 법선이 반대로 계산됨 → 다시 뒤집어서 복구

    print(f"📏 축 보정: extents={extents}, tallest_axis={tallest_axis}")

    # 1. AI가 만든 메시는 임의 크기라, 사용자가 입력한 실제 건물 높이에 맞춰 스케일 보정
    mesh_height_raw = mesh.bounds[1][1] - mesh.bounds[0][1]
    if mesh_height_raw <= 0:
        raise ValueError("메시 높이를 계산할 수 없습니다 (생성된 메시가 비정상일 수 있음)")

    target_height_units = real_height_m * UNITS_PER_METER
    mesh.apply_scale(target_height_units / mesh_height_raw)
    mesh.apply_translation([0, -mesh.bounds[0][1], 0])  # 바닥을 Y=0(유니티 그라운드)에 맞춤

    surface_area = mesh.area
    pitch = max(GRID_PITCH, round(((surface_area / max_blocks) ** 0.5) / GRID_PITCH) * GRID_PITCH)


    # 2. 안전장치: 예산을 넘기면 랜덤 제거 대신 pitch를 키워 재시도 (균일 압축 유지, 구멍 방지)
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

            # 🌟 칸 번호(grid_x/y/z)는 그대로 유지, 저장 좌표는 항상 GRID_PITCH(3)로 압축
            #    → 점 개수/모양은 안 바뀌고, 점들 사이 실제 거리만 좁아짐 (유니티 코드 안 건드려도 됨)
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

            # 표면 법선의 Y성분으로 바닥/지붕(Floor) vs 벽(Wall) 자동 판정
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
        pitch += GRID_PITCH  # 넘쳤으면 한 칸 더 키워서 재시도

    return raw_blocks


@app.post("/api/extract-3d-csv")
async def extract_3d_csv(
    file: UploadFile = File(...),
    startX: float = Form(...),
    startY: float = Form(...),
    endX: float = Form(...),
    endY: float = Form(...),
    realHeightMeters: float = Form(...),
):
    print(f"📥 사진 데이터 및 박스 좌표 수신: ({startX}, {startY}) ~ ({endX}, {endY}) | 실제 높이: {realHeightMeters}m")

    # 1. 이미지 로드 (박스 영역만 잘라서 콜랍으로 보내면 결과가 더 정확함)
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

    # 2. 콜랍 TripoSR 모델로 단일 사진 → 3D 메시 생성 (뒷면/옆면까지 AI가 추론)
    print("🤖 콜랍 AI 모델에 메시 생성 요청 중...")
    mesh = get_mesh_from_colab(crop_bytes)
    print(f"✅ 메시 수신 완료 (vertices={len(mesh.vertices)}, faces={len(mesh.faces)})")

    # 3. 메시를 실제 크기로 스케일 보정 후, 표면(겉면)만 빈틈없이 블록화
    raw_blocks = mesh_to_blocks(mesh, real_height_m=realHeightMeters)

    # 4. Pandas 데이터프레임화
    df = pd.DataFrame(raw_blocks)
    df = df.drop_duplicates(subset=["BlockID"])
    df = df.sort_values(by=["PosZ", "PosX", "PosY"])

    print(f"✅ 총 {len(df)}개의 3D 빌딩 블록 엑셀 변환 완료! (속은 비어있는 표면 전용 구조)")

    # 5. CSV 스트리밍 반환
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