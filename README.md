# Student Score Analysis System
學生成績分析系統

## Description 專案說明
A web application for analyzing student scores with various visualization charts.
這是一個用於分析學生成績的網頁應用程序，提供多種視覺化圖表來展示成績數據。

## Features 功能特點
- 📊 Grade Distribution Analysis 成績分布分析
  - Box plots for grade level comparison 年級成績箱形圖比較
  - Histogram for score distribution 分數分布直方圖

- 📈 Performance Analysis 成績表現分析
  - Subject-wise performance 各科目表現
  - Class-wise comparison 班級間比較
  - Individual student tracking 個別學生追蹤

## Installation & Usage 安裝與使用

### Prerequisites 前置需求
- Node.js
- npm

### Setup 設置步驟
1. Clone the repository 克隆專案
\`\`\`
git clone https://github.com/leofok/student-score-analysis-system.git
cd student-score-analysis-system
\`\`\`

2. Install dependencies 安裝依賴
\`\`\`
npm install
\`\`\`

3. Prepare data files 準備數據文件
Create the following CSV files in the project root directory:
在專案根目錄下創建以下 CSV 文件：

- \`students.csv\`: Student basic information 學生基本資料
- \`averageScores.csv\`: Score data 成績數據
- \`subjects.csv\`: Subject data 科目資料
- \`classCode.csv\`: Class code mapping 班級代號映射
- \`gradeCode.csv\`: Grade code mapping 年級代號映射

4. Run the application 運行應用
\`\`\`
npm start
\`\`\`

## Data Format Requirements 數據格式要求

### students.csv
\`\`\`
id,姓名,性別
S001,張三,男
\`\`\`

### averageScores.csv
\`\`\`
id,學年,學期,班級,學號,科目,平均分
S001,112,1,初一忠,1,國文,85
\`\`\`

### subjects.csv
\`\`\`
年級,科目
初一,國文
\`\`\`

### classCode.csv
\`\`\`
班級代號,班級名稱,年級代號
1A,初一忠,J1
\`\`\`

### gradeCode.csv
\`\`\`
年級代號,年級
J1,初一
\`\`\`

## Tech Stack 技術架構
- HTML5
- JavaScript
- Chart.js - 圖表視覺化
- csv-parser - CSV 文件處理

## Important Notes 重要注意事項
1. All CSV files must be UTF-8 encoded
   所有 CSV 文件必須使用 UTF-8 編碼

2. Data format must follow the above examples
   數據格式需符合上述範例

3. The system will generate HTML report automatically
   系統會自動生成 HTML 報告

## Error Handling 錯誤處理
系統會在以下情況顯示錯誤信息：
- 找不到必要的 CSV 文件
- CSV 文件格式不正確
- 數據缺失或格式錯誤
- 班級或年級代號映射錯誤

## FAQ 常見問題
Q: 為什麼我的圖表沒有顯示數據？
A: 請確認 CSV 文件格式是否正確，且使用 UTF-8 編碼。

Q: 如何新增新的年級或班級？
A: 在 classCode.csv 和 gradeCode.csv 中添加相應的映射關係。

## License 授權
MIT License

## Contributing 貢獻指南
1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## Contact 聯絡方式
如有任何問題或建議，請開啟 Issue 或發送 Pull Request。

## 數據準備
1. 在專案根目錄創建以下 CSV 文件：
   - `students.csv`（參考 examples/students.example.csv）
   - `averageScores.csv`（參考 examples/averageScores.example.csv）
   - `subjects.csv`（參考 examples/subjects.example.csv）
   - `classCode.csv`（參考 examples/classCode.example.csv）
   - `gradeCode.csv`（參考 examples/gradeCode.example.csv）

2. 按照示例文件格式填入您的數據

注意：請勿將實際數據文件上傳至版本控制系統
