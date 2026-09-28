import os
import re
from collections import defaultdict

# 탐색할 최상위 경로 (현재 스크립트가 있는 폴더 기준)
BASE_DIR = '.'
# 무시할 폴더 (스캔 속도를 높이고 불필요한 추적 방지)
IGNORE_DIRS = {'node_modules', '.git', '.vite', 'dist', 'build', 'public'}

# 그래프 딕셔너리 초기화
# forward_graph: 이 파일이 가져다 쓰는 코드 목록 (Imports)
# reverse_graph: 이 파일을 가져다 쓰는 코드 목록 (Used By)
forward_graph = defaultdict(set)
reverse_graph = defaultdict(set)

def scan_project():
    print("🔍 프로젝트 전체 코드를 스캔하여 관계 지도를 그리는 중입니다...\n")
    
    # 1. 모든 JS/JSX 파일 찾기
    all_files = []
    for root, dirs, files in os.walk(BASE_DIR):
        # 무시할 폴더 제외
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
        for file in files:
            if file.endswith('.js') or file.endswith('.jsx'):
                all_files.append(os.path.normpath(os.path.join(root, file)))

    # import 구문 찾는 정규식
    import_pattern = re.compile(r"import\s+.*?(?:from\s+)?['\"](.*?)['\"]")

    # 2. 각 파일의 import 분석하여 관계망 형성
    for file_path in all_files:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
            
        matches = import_pattern.findall(content)
        
        for match in matches:
            # 경로에서 마지막 파일명만 추출 (예: ../components/Button -> Button)
            target_name = match.split('/')[-1] 
            target_base = target_name.replace('.jsx', '').replace('.js', '')
            
            # 스캔된 전체 로컬 파일 중 이름이 일치하는 파일 찾기 (외부 패키지 제외 효과)
            for target_file in all_files:
                target_filename_base = os.path.basename(target_file).replace('.jsx', '').replace('.js', '')
                if target_base == target_filename_base:
                    forward_graph[file_path].add(target_file)
                    reverse_graph[target_file].add(file_path)

    print(f"✅ 스캔 완료! 총 {len(all_files)}개의 코드를 분석하여 지도를 완성했습니다.")

def search_dependencies():
    while True:
        print("=" * 60)
        query = input("💡 검색할 파일명 입력 (예: App, cadUtils) / 종료는 q: ").strip()
        
        if query.lower() == 'q':
            print("🚀 프로그램을 종료합니다. 커피 한 잔 하시면서 쉬세요!")
            break
            
        if not query:
            continue
            
        # 검색어와 부분 일치하는 파일 찾기
        found_files = [f for f in forward_graph.keys() | reverse_graph.keys() if query.lower() in os.path.basename(f).lower()]
        
        if not found_files:
            print(f"❌ '{query}'(이)가 포함된 코드를 찾을 수 없거나, 연결된 의존성이 없습니다.")
            continue
            
        for target in found_files:
            print(f"\n📂 [선택된 파일]: {target}")
            
            print("\n  [⬇️ 이 파일이 가져다 쓰는 코드 (Imports)]")
            if forward_graph[target]:
                for dep in sorted(forward_graph[target]):
                    print(f"    - {dep}")
            else:
                print("    (없음)")
                
            print("\n  [⬆️ 이 파일을 가져다 쓰는 코드 (Used By)]")
            if reverse_graph[target]:
                for dep in sorted(reverse_graph[target]):
                    print(f"    - {dep}")
            else:
                print("    (없음)")

if __name__ == "__main__":
    scan_project()
    search_dependencies()