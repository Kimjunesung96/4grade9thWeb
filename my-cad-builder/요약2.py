import os
import datetime

def gather_files():
    # 🔍 수집할 핵심 파일 확장자 (.js, .css 등 추가 가능)
    target_extensions = ('.py', '.jsx', '.html', '.bat', '.js')
    ignore_folders = {'node_modules', '.git', '__pycache__', 'dist', 'build', '.vscode'}
    
    # 💡 1000줄 넘으면 다음 part로 분할
    MAX_LINES_PER_FILE = 1000 
    
    base_dir = os.path.dirname(os.path.abspath(__file__))
    files_data = []
    
    print("📦 파일 스캔 및 내용 수집 중...")
    
    for root, dirs, files in os.walk(base_dir):
        dirs[:] = [d for d in dirs if d not in ignore_folders]
        
        for file in files:
            if file.endswith(target_extensions):
                # 💡 만들어진 결과물이 다시 스캔되는 것을 방지
                if file.startswith("코드모음_"):
                    continue
                    
                filepath = os.path.join(root, file)
                # AI가 파일 구조를 이해하기 쉽도록 절대경로 대신 상대경로 추출
                rel_path = os.path.relpath(filepath, base_dir) 
                
                try:
                    mtime = os.path.getmtime(filepath)
                    dt = datetime.datetime.fromtimestamp(mtime).strftime('%y-%m-%d %H:%M')
                    
                    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                        lines = f.readlines()
                        content = "".join(lines)
                        line_count = len(lines)
                        
                    files_data.append({
                        'path': rel_path.replace("\\", "/"), # 윈도우 경로(\)를 표준(/)으로 변경
                        'time': dt,
                        'line_count': line_count,
                        'content': content,
                        'extension': file.split('.')[-1]
                    })
                except Exception as e:
                    print(f"⚠️ {file} 읽기 실패: {e}")
                    
    files_data.sort(key=lambda x: x['time'], reverse=True)
    
    if not files_data:
        print("❌ 수집할 파일이 없습니다.")
        return

    current_part = 1
    current_lines = 0
    out_f = open(os.path.join(base_dir, f"코드모음_part{current_part}.txt"), "w", encoding="utf-8")
    
    for f_data in files_data:
        # 💡 AI가 완벽하게 파싱할 수 있는 파일 헤더와 마크다운 코드 블록 양식
        header = f"// FILE PATH: {f_data['path']}\n"
        header += f"// MODIFIED: {f_data['time']} | LINES: {f_data['line_count']}\n"
        code_block_start = f"```{f_data['extension']}\n"
        code_block_end = "\n```\n\n"
        
        formatted_content = header + code_block_start + f_data['content'] + code_block_end
        
        added_lines = f_data['line_count'] + 6 
        
        if current_lines + added_lines > MAX_LINES_PER_FILE and current_lines > 0:
            out_f.close()
            current_part += 1
            out_f = open(os.path.join(base_dir, f"코드모음_part{current_part}.txt"), "w", encoding="utf-8")
            current_lines = 0
            
        out_f.write(formatted_content)
        current_lines += added_lines
        
    out_f.close()
    print(f"✅ 총 {current_part}개의 파트로 AI 최적화 코드 모음이 생성되었습니다.")

if __name__ == "__main__":
    gather_files()