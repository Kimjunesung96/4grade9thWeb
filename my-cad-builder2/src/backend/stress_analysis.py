"""
CurrentStress.csv 업로드 -> 정제/요약 -> Google Gemini 분석 -> JSON 반환

main.py 연결 (app = FastAPI() 아래에 2줄):
    from stress_analysis import router as stress_router
    app.include_router(stress_router)

환경변수(.env): GEMINI_API_KEY  (선택: GEMINI_MODEL)
"""
import io
import os
import re
from pathlib import Path

import pandas as pd
import requests
from dotenv import load_dotenv
from fastapi import APIRouter, File, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

# src/backend/.env 와 프로젝트 루트 .env 를 둘 다 읽는다 (없는 파일은 무시됨)
load_dotenv(Path(__file__).resolve().parents[2] / ".env", override=True)
load_dotenv(Path(__file__).with_name(".env"), override=True)

router = APIRouter()

# Gemini의 OpenAI 호환 엔드포인트. 모델 id는 자주 바뀌니까 앞에서부터 순서대로 시도한다.
# 특정 모델을 먼저 쓰고 싶으면 .env에 GEMINI_MODEL=... 추가
LLM_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
DEFAULT_MODELS = [
    "gemini-flash-latest",
    "gemini-2.5-flash",
    "gemini-3-flash-preview",
]
THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL)
LLM_TIMEOUT = 60  # 모델당 최대 대기 (초과하면 다음 모델 시도)
MOVED_THRESHOLD = 3.0  # 블록 한 칸(GRID_PITCH) 이상 밀렸으면 이탈로 본다

REQUIRED_COLS = {
    "BlockID", "PosX", "PosY", "PosZ", "Stress", "RiskLevel",
    "Material", "Tool", "Type",
}

SYSTEM_PROMPT = """너는 블록 기반 건축물 구조 시뮬레이션 결과를 분석하는 구조 안전 분석가야.
입력은 하중 테스트 결과를 요약한 JSON이야. 규칙:
- 입력에 있는 숫자만 근거로 써. 없는 수치는 만들지 마.
- Stress 단위는 모르니까 단위를 붙이지 마.
- H_Beam의 Tensile/Compressive가 0인 것은 '미기록'이야. 강도 0으로 해석하지 마.
- Prescription 컬럼의 의미는 단정하지 마.
- orig_x/y/z는 원래 위치, moved는 테스트 후 원래 위치에서 밀려난 거리야. 위치 설명은 orig 기준으로 해.
- 출력은 한국어 평문(마크다운 기호 없이). 문제점 3~5개를 번호로 쓰고,
  각 항목마다 '근거 수치 / 위치(높이·구역) / 개선 제안'을 한 줄씩 써.
- 마지막에 '가장 먼저 손볼 곳' 한 줄로 마무리해."""


def parse_block_id(block_id: str):
    """BlockID = X_Z_Y (각각 부호문자 + 숫자, 값*10). 예: -405_0615_0015 -> (-40.5, 1.5, 61.5)"""
    try:
        seg_x, seg_z, seg_y = block_id.split("_")
        vals = []
        for seg in (seg_x, seg_y, seg_z):
            sign = -1 if seg[0] == "-" else 1
            vals.append(sign * int(seg[1:]) / 10)
        return tuple(vals)  # (x, y, z)
    except Exception:
        return (float("nan"),) * 3


def load_blocks(csv_bytes: bytes) -> tuple[pd.DataFrame, int]:
    """파괴 블록이 DESTROYED 행으로 중복 기록되는 CSV를 BlockID당 1행으로 합친다."""
    try:
        df = pd.read_csv(io.BytesIO(csv_bytes))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"CSV를 읽을 수 없습니다: {e}")

    missing = REQUIRED_COLS - set(df.columns)
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"필수 컬럼이 없습니다: {', '.join(sorted(missing))}",
        )

    df["_destroyed"] = df["RiskLevel"].eq("Destroyed")
    for col in ("PosX", "PosY", "PosZ", "Stress"):
        df[col] = pd.to_numeric(df[col], errors="coerce")  # 'DESTROYED' -> NaN

    # 좌표가 살아있는 첫 행이 원본 정보(Material/Tool 등)를 가진다
    base = (
        df.dropna(subset=["PosX", "PosY", "PosZ"])
        .drop_duplicates("BlockID", keep="first")
        .set_index("BlockID")
    )
    agg = df.groupby("BlockID").agg(
        max_stress=("Stress", "max"),
        destroyed=("_destroyed", "any"),
    )
    blocks = base.drop(columns=["_destroyed", "Stress"]).join(agg, how="left")
    blocks["final_risk"] = blocks["RiskLevel"].where(~blocks["destroyed"], "Destroyed")

    blocks = blocks.reset_index()
    orig = blocks["BlockID"].map(parse_block_id)
    blocks["orig_x"] = orig.map(lambda t: t[0])
    blocks["orig_y"] = orig.map(lambda t: t[1])
    blocks["orig_z"] = orig.map(lambda t: t[2])
    # 현재 좌표(PosX/Y/Z)는 테스트 후 위치라서, ID의 원래 좌표와의 거리 = 밀려난 정도
    blocks["moved"] = (
        (blocks["PosX"] - blocks["orig_x"]) ** 2
        + (blocks["PosY"] - blocks["orig_y"]) ** 2
        + (blocks["PosZ"] - blocks["orig_z"]) ** 2
    ) ** 0.5

    orphans = df["BlockID"].nunique() - len(blocks)  # 좌표 행이 없는 ID
    return blocks, int(orphans)


def _risk_counts(frame: pd.DataFrame) -> dict:
    return {k: int(v) for k, v in frame["final_risk"].value_counts().items()}


def build_summary(blocks: pd.DataFrame, orphans: int) -> dict:
    total = len(blocks)

    by_tool = {}
    for tool, g in blocks.groupby("Tool"):
        by_tool[tool] = {
            "count": int(len(g)),
            "risk": _risk_counts(g),
            "destroyed_pct": round(float(g["destroyed"].mean()) * 100, 1),
            "median_stress": round(float(g["max_stress"].median()), 2),
        }

    by_height = []
    bands = pd.cut(blocks["orig_y"], bins=5)
    for band, g in blocks.groupby(bands, observed=True):
        by_height.append({
            "y_range": f"{band.left:.1f}~{band.right:.1f}",
            "count": int(len(g)),
            "destroyed_pct": round(float(g["destroyed"].mean()) * 100, 1),
            "median_stress": round(float(g["max_stress"].median()), 2),
        })

    zones = blocks.assign(
        zx=pd.cut(blocks["orig_x"], bins=3, labels=["X낮음", "X중간", "X높음"]),
        zz=pd.cut(blocks["orig_z"], bins=3, labels=["Z낮음", "Z중간", "Z높음"]),
    )
    zone_stats = (
        zones.groupby(["zx", "zz"], observed=True)["destroyed"]
        .agg(["sum", "count"])
        .sort_values("sum", ascending=False)
        .head(3)
    )
    top_zones = [
        {"zone": f"{zx}/{zz}", "destroyed": int(r["sum"]), "blocks": int(r["count"])}
        for (zx, zz), r in zone_stats.iterrows()
    ]

    shifted = blocks[blocks["moved"] > MOVED_THRESHOLD]
    movement = {
        "threshold": MOVED_THRESHOLD,
        "moved_count": int(len(shifted)),
        "moved_pct": round(len(shifted) / total * 100, 1),
        "moved_median": round(float(shifted["moved"].median()), 1) if len(shifted) else 0.0,
        "moved_max": round(float(blocks["moved"].max()), 1),
        "moved_by_risk": _risk_counts(shifted),
    }

    cols = ["BlockID", "orig_x", "orig_y", "orig_z", "moved", "max_stress", "Tool", "Material", "final_risk"]
    hotspots = (
        blocks.sort_values("max_stress", ascending=False)
        .head(10)[cols]
        .round(2)
        .to_dict("records")
    )

    reinf = blocks[blocks["Tool"] == "Reinforcement"]
    failed_reinf = reinf[reinf["final_risk"].isin(["Danger", "Destroyed"])]

    return {
        "total_blocks": int(total),
        "orphan_destroyed_ids": orphans,
        "risk": _risk_counts(blocks),
        "stress_median": round(float(blocks["max_stress"].median()), 2),
        "stress_max": round(float(blocks["max_stress"].max()), 2),
        "by_tool": by_tool,
        "by_height": by_height,
        "top_destroyed_zones": top_zones,
        "reinforcement_failed_count": int(len(failed_reinf)),
        "reinforcement_total": int(len(reinf)),
        "movement": movement,
        "hotspots": hotspots,
    }


def model_chain() -> list[str]:
    custom = os.getenv("GEMINI_MODEL")
    return ([custom] if custom else []) + [m for m in DEFAULT_MODELS if m != custom]


def _post(headers: dict, model: str, summary: dict, low_effort: bool):
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": str(summary)},
        ],
        "temperature": 0.3,
        "max_tokens": 4096,
    }
    if low_effort:
        body["reasoning_effort"] = "low"  # 사고 시간을 줄여서 타임아웃 방지
    return requests.post(LLM_URL, headers=headers, json=body, timeout=LLM_TIMEOUT)


def call_llm(summary: dict) -> tuple[str, str]:
    key = (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "").strip().strip("\"'")
    if not key:
        raise RuntimeError("GEMINI_API_KEY가 .env에 설정되지 않았습니다.")

    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    errors = []
    for model in model_chain():
        try:
            resp = _post(headers, model, summary, low_effort=True)
            if resp.status_code == 400 and "reasoning" in resp.text.lower():
                resp = _post(headers, model, summary, low_effort=False)  # 이 모델은 옵션 미지원
        except requests.exceptions.Timeout:
            errors.append(f"{model}: 시간초과")
            continue

        if resp.status_code in (400, 401, 403):
            raise RuntimeError(
                f"{resp.status_code} 인증/요청 오류 - 서버가 읽은 키: {key[:4]}...{key[-3:]} (길이 {len(key)}). "
                f"Gemini 키는 보통 'AIza'로 시작하고 39자입니다. 응답: {resp.text[:200]}"
            )
        if resp.status_code == 429:
            raise RuntimeError("429 무료 한도 초과입니다. 잠시 후(1분 뒤) 다시 시도하세요.")
        if resp.status_code in (404, 500, 503):  # 없는 모델/일시 장애 -> 다음 모델
            errors.append(f"{model}: {resp.status_code}")
            continue
        resp.raise_for_status()
        message = resp.json()["choices"][0]["message"]
        text = THINK_RE.sub("", message.get("content") or "").strip()
        if text:
            return text, model
        errors.append(f"{model}: 빈 응답")

    raise RuntimeError("사용 가능한 모델이 없습니다 -> " + ", ".join(errors))


@router.post("/api/analyze-stress")
async def analyze_stress(file: UploadFile = File(...)):
    csv_bytes = await file.read()
    blocks, orphans = load_blocks(csv_bytes)
    summary = build_summary(blocks, orphans)

    analysis, analysis_error, model_used = None, None, None
    try:
        analysis, model_used = await run_in_threadpool(call_llm, summary)
    except Exception as e:
        # LLM이 실패해도 통계는 돌려준다
        analysis_error = str(e)

    return {
        "stats": summary,
        "analysis": analysis,
        "analysis_error": analysis_error,
        "model": model_used,
    }