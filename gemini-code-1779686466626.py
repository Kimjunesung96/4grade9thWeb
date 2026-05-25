import os
import subprocess
import shutil
import tempfile
import datetime

# ================= 설정 구간 =================
# 1. 내 컴퓨터의 원본 소스 경로 (졸작웹 폴더)
SOURCE_DIR = r"C:\Users\skrkt\Desktop\졸작\졸작웹"

# 2. 깃허브 저장소 정보 (새 창고 주소)
REPO_URL = "https://github.com/Kimjunesung96/4grade9thWeb.git"

# 3. 저장소 내에서 파일을 넣을 대상 폴더 (루트에 바로 넣으려면 ""로 비워두세요)
TARGET_SUBFOLDER = "" 
# =============================================

def run_command(cmd, cwd=None):
    """터미널 명령어를 실행하고 결과를 출력합니다. (utf-8 적용)"""
    try:
        result = subprocess.run(cmd, shell=True, cwd=cwd, check=True, capture_output=True, text=True, encoding='utf-8')
        print(result.stdout)
    except subprocess.CalledProcessError as e:
        print(f"❌ 에러 발생: {e.stderr}")
        raise

def main():
    # 1. 임시 작업 폴더 생성
    with tempfile.TemporaryDirectory() as temp_dir:
        print(f"📂 1. 임시 작업소 생성: {temp_dir}")

        # 2. 깃허브에서 기존 데이터 클론
        print("📥 2. 깃허브에서 기존 데이터를 안전하게 복제 중...")
        run_command(f"git clone {REPO_URL} .", cwd=temp_dir)

        # 3. 대상 폴더 경로 설정
        target_path = os.path.join(temp_dir, TARGET_SUBFOLDER)
        os.makedirs(target_path, exist_ok=True)

        # 4. 파일 복사 (node_modules, .git 등 불필요한 찌꺼기 제거)
        print("📦 3. 로컬 파일 복사 중 (node_modules 제외)...")
        ignore_patterns = shutil.ignore_patterns(
            "node_modules", ".git", "__pycache__", ".vscode", "*.pyc", "*.lnk", "dist"
        )
        
        for item in os.listdir(SOURCE_DIR):
            s = os.path.join(SOURCE_DIR, item)
            d = os.path.join(target_path, item)
            
            # 깃허브 관리에 방해되는 폴더 제외
            if any(x in item for x in ["node_modules", ".git"]):
                continue

            if os.path.isdir(s):
                shutil.copytree(s, d, ignore=ignore_patterns, dirs_exist_ok=True)
            else:
                if not item.endswith('.lnk') and item != "sync_graduation_web.py":
                    shutil.copy2(s, d)

        # 5. 깃허브 업로드 진행
        print("📤 4. 변경사항을 깃허브로 안전하게 전송 중...")
        try:
            run_command("git add .", cwd=temp_dir)
            
            now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            commit_msg = f"[졸업작품] 웹 에디터 동기화 ({now})"
            
            run_command(f'git commit -m "{commit_msg}"', cwd=temp_dir)
            run_command("git push origin main", cwd=temp_dir)
            
            print("\n✅ 모든 작업이 성공적으로 완료되었습니다!")
            print(f"🔗 확인: {REPO_URL}")
            
        except subprocess.CalledProcessError:
            print("\nℹ️ 변경된 내용이 없거나 업로드에 실패했습니다.")

if __name__ == "__main__":
    main()
    input("\n계속하려면 엔터를 누르세요...")