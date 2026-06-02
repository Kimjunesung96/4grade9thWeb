import os
import datetime

def gather_files():
    # 🔍 수집할 핵심 파일 확장자
    target_extensions = ('.py', '.jsx', '.html', '.bat')
    ignore_folders = {'node_modules', '.git', '__pycache__', 'dist', 'build', '.vscode'}
    
    # 💡 한 텍스트 파일당 최대 몇 줄까지 담을지 설정 (원하시면 숫자를 수정하세요!)
    MAX_LINES_PER_FILE = 1000 
    
    base_dir = os.path.dirname(os.path.abspath(__file__))
    files_data = []
    
    print("📦 파일 스캔 및 내용 수집 중...")
    
    for root, dirs, files in os.walk(base_dir):
        dirs[:] = [d for d in dirs if d not in ignore_folders]
        
        for file in files:
            if file.endswith(target_extensions):
                # 💡 만들어진 결과물(코드모음_*.txt)이 다시 스캔되는 것을 방지
                if file.startswith("코드모음_"):
                    continue
                    
                filepath = os.path.join(root, file)
                
                try:
                    mtime = os.path.getmtime(filepath)
                    dt = datetime.datetime.fromtimestamp(mtime).strftime('%y-%m-%d %H:%M')
                    
                    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                        lines = f.readlines()
                        content = "".join(lines)
                        line_count = len(lines) # 글자 수가 아닌 '줄 수' 계산!
                    
                    files_data.append({
                        'path': os.path.relpath(filepath, base_dir),
                        'time': dt,
                        'line_count': line_count,
                        'mtime': mtime,
                        'content': content
                    })
                    
                except Exception as e:
                    pass 

    # 최근 수정된 순서대로 정렬
    files_data.sort(key=lambda x: x['mtime'], reverse=True)
    
    if not files_data:
        print("❌ 수집할 파일이 없습니다.")
        return

    # ---------------------------------------------------------
    # 💡 수집된 내용들을 여러 개의 텍스트 파일로 쪼개서 저장하기
    # ---------------------------------------------------------
    current_part = 1
    current_lines = 0
    out_f = open(os.path.join(base_dir, f"코드모음_part{current_part}.txt"), "w", encoding="utf-8")
    
    for f_data in files_data:
        # 파일별 제목 헤더 (예: [26-05-12 16:44] main.py (50줄))
        header = f"\n\n{'='*60}\n[{f_data['time']}] {f_data['path']} ({f_data['line_count']}줄)\n{'='*60}\n\n"
        
        # 파일 하나를 추가할 때 예상되는 줄 수
        added_lines = f_data['line_count'] + 6 
        
        # 만약 이 파일을 넣었을 때 제한(MAX_LINES_PER_FILE)을 넘는다면 새 파일 만들기
        # 단, current_lines가 0일 때는 파일 하나가 1000줄이 넘더라도 일단 무조건 넣습니다.
        if current_lines + added_lines > MAX_LINES_PER_FILE and current_lines > 0:
            out_f.close()
            current_part += 1
            out_f = open(os.path.join(base_dir, f"코드모음_part{current_part}.txt"), "w", encoding="utf-8")
            current_lines = 0
            
        out_f.write(header)
        out_f.write(f_data['content'])
        current_lines += added_lines

    out_f.close()
    
    print("=" * 60)
    print(f"✅ 총 {len(files_data)}개의 파일 코드를 성공적으로 수집했습니다!")
    print(f"📁 '코드모음_part1.txt' ~ '코드모음_part{current_part}.txt' 에 나뉘어 저장되었습니다.")
    print("=" * 60)

if __name__ == "__main__":
    gather_files()
    input("\n엔터를 누르면 종료됩니다...")