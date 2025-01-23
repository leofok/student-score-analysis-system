'use strict';
// 或者使用
/* eslint-env es6 */

const fs = require('fs');
const csv = require('csv-parser');

// 定義全局變量
const students = new Map();
const averageScoreRecords = [];
let classCodeMap = {};
let classOrder = [];
let classGradeMap = {};  // 新增：存儲班級代號到年級代號的映射
let gradeCodeMap = {};  // 新增：用於保存年級代號映射
let gradeOrder = [];  // 用於保存年級順序
const subjects = new Map(); // 用於存儲每個年級的科目列表
let subjectOrder = []; // 用於保存科目順序

/**
 * 讀取班級代號映射的函數
 * 從 classCode.csv 讀取班級名稱和代號的映射
 */
function loadClassCodeMap() {
    return new Promise((resolve, reject) => {
        try {
            const fileContent = fs.readFileSync('classCode.csv', 'utf8');
            const lines = fileContent.split('\n').map(line => line.trim()).filter(Boolean);
            const headers = lines[0].split(',').map(h => h.trim());
            
            const classIndex = headers.findIndex(h => h === '班級');
            const classCodeIndex = headers.findIndex(h => h === '班級代號');
            const gradeCodeIndex = headers.findIndex(h => h === '年級代號');
            
            if (classIndex === -1 || classCodeIndex === -1 || gradeCodeIndex === -1) {
                throw new Error('找不到必要的列，當前標題行: ' + headers.join(', '));
            }

            classOrder = [];
            const tempClassMap = {};
            const tempClassGradeMap = {}; // 新增：存儲班級代號到年級代號的映射

            for (let i = 1; i < lines.length; i++) {
                const cols = lines[i].split(',').map(col => col.trim());
                const className = cols[classIndex];
                const classCode = cols[classCodeIndex];
                const gradeCode = cols[gradeCodeIndex];
                
                if (className && classCode && gradeCode) {
                    classOrder.push(className);
                    tempClassMap[classCode] = className;
                    tempClassGradeMap[classCode] = gradeCode; // 保存班級代號對應的年級代號
                }
            }

            if (classOrder.length === 0) {
                throw new Error('沒有讀取到任何有效的班級數據');
            }

            classCodeMap = tempClassMap;
            classGradeMap = tempClassGradeMap; // 保存班級到年級的映射
            resolve();
        } catch (error) {
            console.error('讀取班級代號映射時發生錯誤：', error);
            reject(error);
        }
    });
}

/**
 * 讀取學生資料的函數
 * 從 students.csv 讀取學生基本資料
 */
function loadStudents() {
    return new Promise((resolve, reject) => {
        fs.createReadStream('students.csv', { encoding: 'utf8' })
            .pipe(csv({
                mapHeaders: ({ header }) => header.trim(),
                mapValues: ({ value }) => value.trim()
            }))
            .on('data', (data) => {
                const studentId = String(data.id || data['學號']).trim().toUpperCase();
                const studentName = String(data.姓名 || data['name']).trim();
                const gender = String(data.性別 || data.gender || data['姓別'] || '').trim().toUpperCase();

                if (!studentId || !studentName) {
                    console.error('無效的學生資料：', data);
                    return;
                }
                
                let normalizedGender = 'Unknown';
                if (gender === '男' || gender === 'M' || gender === 'MALE') {
                    normalizedGender = '男';
                } else if (gender === '女' || gender === 'F' || gender === 'FEMALE') {
                    normalizedGender = '女';
                }

                // 從 averageScores 中查找該學生最新的班級信息
                const studentScores = averageScoreRecords
                    .filter(record => record.id === studentId)
                    .sort((a, b) => {
                        const yearDiff = b.academicYear.localeCompare(a.academicYear);
                        return yearDiff !== 0 ? yearDiff : b.semester - a.semester;
                    });

                const latestClass = studentScores.length > 0 ? studentScores[0].class : '未分班';

                students.set(studentId, {
                    id: studentId,
                    name: studentName,
                    gender: normalizedGender,
                    class: latestClass
                });
            })
            .on('end', () => {
                resolve();
            })
            .on('error', (error) => {
                console.error('讀取學生資料時發生錯誤：', error);
                reject(error);
            });
    });
}

/**
 * 讀取平均分資料的函數
 * 從 grades.csv 讀取所有學生的平均分記錄
 */
function loadAverageScores() {
    return new Promise((resolve, reject) => {
        fs.createReadStream('averageScores.csv', { encoding: 'utf8' })
            .pipe(csv({
                skipLines: 0,
                strict: true,
                mapHeaders: ({ header }) => header.trim()
            }))
            .on('data', (data) => {
                const studentId = String(data.id).trim().toUpperCase();
                const academicYear = data.學年?.trim();
                const semester = parseInt(data.學期);
                const className = data.班級?.trim();
                const studentNumber = data.學號?.trim();
                const subject = data.科目?.trim();
                const score = parseFloat(data.平均分);

                // 從完整班級名稱找到對應的班級代號
                const classEntry = Object.entries(classCodeMap).find(([, name]) => name === className);
                if (!classEntry) {
                    console.error('找不到班級名稱對應的代號：', className + ' ' + studentId + ' ' + studentNumber + ' ' + subject + ' ' + score + ' ' + academicYear + ' ' + semester);
                    return;
                }

                const classCode = classEntry[0];
                // 使用 classGradeMap 獲取年級代號
                const gradeCode = classGradeMap[classCode];
                if (!gradeCode) {
                    console.error('找不到班級代號對應的年級代號：', classCode);
                    return;
                }

                // 使用 gradeCodeMap 獲取年級名稱
                const gradeName = gradeCodeMap[gradeCode];
                if (!gradeName) {
                    console.error('找不到年級代號對應的年級名稱：', gradeCode);
                    return;
                }

                if (!studentId || !academicYear || !className || !subject || isNaN(score)) {
                    console.error('無效的成績記錄：', data);
                    return;
                }

                averageScoreRecords.push({
                    id: studentId,
                    academicYear: academicYear,
                    semester: semester,
                    gradeLevel: gradeName,
                    class: className,
                    studentNumber: studentNumber,
                    subject: subject,
                    averageScore: score
                });
            })
            .on('end', () => {
                resolve();
            })
            .on('error', (error) => {
                console.error('讀取平均分資料時發生錯誤：', error);
                reject(error);
            });
    });
}

/**
 * 讀取年級代號映射的函數
 */
function loadGradeCodeMap() {
    return new Promise((resolve, reject) => {
        try {
            const fileContent = fs.readFileSync('gradeCode.csv', 'utf8');
            const lines = fileContent.split('\n').map(line => line.trim()).filter(Boolean);
            const headers = lines[0].split(',').map(h => h.trim());
            
            const gradeIndex = headers.findIndex(h => 
                h === '年級' || 
                h === '年級名稱' || 
                h === 'grade' ||
                h === 'gradeName'
            );
            
            if (gradeIndex === -1) {
                throw new Error('找不到年級列，當前標題行: ' + headers.join(', '));
            }

            const codeIndex = headers.findIndex(h => 
                h === '年級代號' || 
                h === 'code' || 
                h === 'gradeCode'
            );

            if (codeIndex === -1) {
                throw new Error('找不到年級代號列，當前標題行: ' + headers.join(', '));
            }

            gradeOrder = [];
            const tempGradeMap = {};

            for (let i = 1; i < lines.length; i++) {
                const cols = lines[i].split(',').map(col => col.trim());
                const gradeName = cols[gradeIndex];
                const gradeCode = cols[codeIndex];
                
                if (gradeName && gradeCode) {
                    gradeOrder.push(gradeName); // 使用完整年級名稱
                    tempGradeMap[gradeCode] = gradeName; // 反向映射：代號 -> 名稱
                }
            }

            if (gradeOrder.length === 0) {
                throw new Error('沒有讀取到任何有效的年級數據');
            }

            gradeCodeMap = tempGradeMap;
            resolve();
        } catch (error) {
            console.error('讀取年級代號映射時發生錯誤：', error);
            reject(error);
        }
    });
}

/**
 * 讀取科目資料的函數
 * 從 subjects.csv 讀取各年級的科目列表
 */
function loadSubjects() {
    return new Promise((resolve, reject) => {
        const tempSubjectOrder = [];
        
        fs.createReadStream('subjects.csv', { encoding: 'utf8' })
            .pipe(csv({
                mapHeaders: ({ header }) => header.trim(),
                mapValues: ({ value }) => value.trim()
            }))
            .on('data', (data) => {
                const grade = data.年級?.trim();
                const subject = data.科目?.trim();

                if (grade && subject) {
                    if (!subjects.has(grade)) {
                        subjects.set(grade, new Set());
                    }
                    subjects.get(grade).add(subject);
                    
                    if (!tempSubjectOrder.includes(subject)) {
                        tempSubjectOrder.push(subject);
                    }
                }
            })
            .on('end', () => {
                subjectOrder = tempSubjectOrder;
                resolve();
            })
            .on('error', (error) => {
                console.error('讀取科目資料時發生錯誤：', error);
                reject(error);
            });
    });
}

/**
 * 生成成績分布分析的HTML
 */
function generateGradeDistributionHTML() {
    return `
    <div class="page" id="gradeDistribution">
        <h2>成績分布分析</h2>
        <div class="controls">
            <select id="gradeDistSubject">
                <option value="all">所有科目</option>
            </select>
            <select id="gradeDistYear">
                <option value="all">所有年度</option>
            </select>
        </div>
        <div class="distribution-container">
            <div class="chart-section">
                <div class="chart-container">
                    <canvas id="histogramChart"></canvas>
                </div>
            </div>
            <div class="student-section">
                <div id="studentListContainer">
                    <div class="student-list-header">
                        <h3>選定區間的學生列表</h3>
                        <div class="interval-selector">
                            <select id="scoreIntervalSelect">
                                <option value="">選擇分數區間...</option>
                                <option value="0-10">0-10</option>
                                <option value="11-20">11-20</option>
                                <option value="21-30">21-30</option>
                                <option value="31-40">31-40</option>
                                <option value="41-50">41-50</option>
                                <option value="51-60">51-60</option>
                                <option value="61-70">61-70</option>
                                <option value="71-80">71-80</option>
                                <option value="81-90">81-90</option>
                                <option value="91-100">91-100</option>
                            </select>
                        </div>
                    </div>
                    <div id="studentList">
                        <p>請選擇分數區間來查看學生列表</p>
                    </div>
                </div>
            </div>
        </div>
        <div class="boxplot-section">
            <div class="chart-container">
                <canvas id="boxplotChart"></canvas>
            </div>
        </div>
        <style>
            .student-list-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
                padding: 10px;
                background-color: #f5f5f5;
                border-radius: 4px;
            }
            
            .student-list-header h3 {
                margin: 0;
            }
            
            .interval-selector select {
                padding: 5px;
                border-radius: 4px;
                border: 1px solid #ddd;
            }
            
            /* 其他原有的樣式保持不變 */
        </style>
    </div>
    `;
}

/**
 * 生成年度成績趨勢分析的HTML
 */
function generateYearlyTrendHTML() {
    return `
    <div class="page" id="yearlyTrend">
        <h2>年度成績趨勢分析</h2>
        <div class="controls">
            <select id="trendSubject">
                <option value="all">所有科目</option>
            </select>
            <select id="trendGrade">
                <option value="all">所有年級</option>
            </select>
        </div>
        <div class="chart-container" style="position: relative; height: 400px; width: 100%;">
            <canvas id="trendChart"></canvas>
        </div>
        <div class="controls">
            <div class="select-all">
                <label><input type="checkbox" id="trendSelectAll" checked> 全選科目</label>
            </div>
        </div>
        <div class="chart-container" style="position: relative; height: 400px; width: 100%; margin-top: 20px;">
            <canvas id="gradesTrendChart"></canvas>
        </div>
        <div class="controls">
            <div class="select-all">
                <label><input type="checkbox" id="gradesTrendSelectAll" checked> 全選年級</label>
            </div>
        </div>
    </div>
    `;
}

/**
 * 生成科目表現比較的HTML
 */
function generateSubjectComparisonHTML() {
    return `
    <div class="page" id="subjectComparison">
        <h2>科目表現比較</h2>
        <div class="chart-container">
            <canvas id="subjectChart"></canvas>
        </div>
        <div class="controls">
            <div class="grade-selection">
                <div class="select-all">
                    <label><input type="checkbox" value="all" checked> 全選年級</label>
                </div>
                <div id="gradeCheckboxes" class="checkbox-grid">
                    <!-- 年級選項將在 JavaScript 中動態添加 -->
                </div>
            </div>
            <div class="year-selection">
                <select id="subjectYear">
                    <option value="all">所有年度</option>
                </select>
            </div>
        </div>
        <style>
            /* 修改控制區域樣式 */
            #subjectComparison .controls {
                display: flex;
                flex-direction: column;
                gap: 10px;
                margin: 20px 0;
            }

            #subjectComparison .grade-selection {
                margin-bottom: 10px;
            }

            #subjectComparison .checkbox-grid {
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
                margin-top: 5px;
            }

            #subjectComparison .checkbox-grid label {
                margin-right: 15px;
                white-space: nowrap;
            }

            #subjectComparison .year-selection {
                margin-top: 5px;
            }

            #subjectComparison .select-all {
                margin-bottom: 5px;
            }
        </style>
    </div>
    `;
}

/**
 * 生成分類分析的HTML
 */
function generateCategoryAnalysisHTML() {
    return `
    <div class="page" id="categoryAnalysis">
        <h2>分類分析</h2>
        <div class="chart-container" style="height: 300px;">
            <canvas id="genderChart"></canvas>
            <canvas id="gradeChart"></canvas>
        </div>
        <div class="controls">
            <select id="categoryYear">
                <option value="all">所有年度</option>
            </select>
            <select id="categorySubject">
                <option value="all">所有科目</option>
            </select>
        </div>
    </div>
    `;
}

/**
 * 生成學生個別成績追蹤的HTML
 */
function generateStudentTrackingHTML() {
    return `
    <div class="page" id="studentTracking">
        <h2>學生個別成績追蹤</h2>
        <div class="chart-container" style="position: relative; height: 500px; width: 100%;">
            <canvas id="studentChart"></canvas>
        </div>
        <div class="controls">
            <div class="student-selection">
                <select id="trackingYear">
                    <option value="">選擇學年...</option>
                </select>
                <select id="trackingClass" disabled>
                    <option value="">選擇班級...</option>
                </select>
                <select id="trackingStudent" disabled>
                    <option value="">選擇學生...</option>
                </select>
            </div>
            <div class="legend-control">
                <label><input type="checkbox" id="trackingSelectAll" checked> 全選</label>
            </div>
        </div>
        <style>
            .student-selection {
                margin-bottom: 15px;
            }
            .student-selection select {
                margin-right: 10px;
            }
            .legend-control {
                margin-top: 10px;
            }
            .legend-control label {
                cursor: pointer;
            }
            #studentTracking .chart-container {
                position: relative;
                height: 500px !important;
                width: 100% !important;
                margin-bottom: 5px;
            }
        </style>
    </div>
    `;
}

/**
 * 生成 HTML 報告的函數
 */
function generateReport() {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>學生成績分析</title>
        <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/@sgratzl/chartjs-chart-boxplot@4.2.4/build/index.umd.min.js"></script>
        <style>
            /* 基本樣式 */
            body {
                margin: 0;
                padding: 0;
                display: flex;
                font-family: Arial, sans-serif;
            }
            
            /* 分布分析頁面樣式 */
            .distribution-container {
                display: flex;
                gap: 20px;
                margin: 20px 0;
            }
            
            .chart-section {
                flex: 1;
                min-width: 0;
            }
            
            .student-section {
                flex: 1;
                min-width: 300px;
                max-width: 500px;
            }
            
            .boxplot-section {
                margin-top: 20px;
                width: 100%;
            }
            
            .chart-container {
                width: 100%;
                height: 400px;
            }
            
            .controls {
                margin: 20px 0;
                display: flex;
                gap: 10px;
            }
            
            #studentListContainer {
                background-color: #fff;
                border: 1px solid #ddd;
                border-radius: 4px;
                padding: 15px;
                height: 400px;
                overflow: hidden;
                display: flex;
                flex-direction: column;
            }
            
            #studentList {
                flex: 1;
                overflow-y: auto;
                margin-top: 10px;
            }
            
            .student-table {
                width: 100%;
                border-collapse: collapse;
            }
            
            .student-table th,
            .student-table td {
                padding: 8px;
                text-align: left;
                border: 1px solid #ddd;
            }
            
            .student-table th {
                background-color: #f5f5f5;
                font-weight: bold;
                position: sticky;
                top: 0;
                z-index: 1;
            }
            
            .student-table tr:nth-child(even) {
                background-color: #f9f9f9;
            }
            
            .student-table tr:hover {
                background-color: #f0f0f0;
            }
            
            .student-list-header {
                margin-bottom: 10px;
                padding: 5px;
                background-color: #eee;
                border-radius: 4px;
            }
            
            /* 其他原有的樣式 */
            #sidebar {
                width: 200px;
                background-color: #f0f0f0;
                padding: 20px;
                height: 100vh;
            }
            
            #content {
                flex: 1;
                padding: 20px;
            }
            
            .nav-item {
                padding: 10px;
                margin: 5px 0;
                cursor: pointer;
                border-radius: 5px;
            }
            
            .nav-item:hover {
                background-color: #ddd;
            }
            
            .nav-item.active {
                background-color: #007bff;
                color: white;
            }
            
            .page {
                display: none;
            }
            
            .page.active {
                display: block;
            }

            /* 新增樣式 */
            .download-csv-btn {
                margin-left: 10px;
                padding: 5px 10px;
                background-color: #4CAF50;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
            }

            .download-csv-btn:hover {
                background-color: #45a049;
            }
        </style>
    </head>
    <body>
        <div id="sidebar">
            <div class="nav-item active" data-page="gradeDistribution">成績分布分析</div>
            <div class="nav-item" data-page="yearlyTrend">年度成績趨勢分析</div>
            <div class="nav-item" data-page="subjectComparison">科目表現比較</div>
            <div class="nav-item" data-page="categoryAnalysis">分類分析</div>
            <div class="nav-item" data-page="studentTracking">學生個別成績追蹤</div>
        </div>
        <div id="content">
            ${generateGradeDistributionHTML()}
            ${generateYearlyTrendHTML()}
            ${generateSubjectComparisonHTML()}
            ${generateCategoryAnalysisHTML()}
            ${generateStudentTrackingHTML()}
        </div>
        <script>
            // 修改基础数据部分，添加 lastSelectedInterval
            let lastSelectedInterval = null; // 添加这一行
            
            const data = {
                students: ${JSON.stringify(Array.from(students.entries()))},
                classCodeMap: ${JSON.stringify(classCodeMap)},
                classOrder: ${JSON.stringify(classOrder)},
                classGradeMap: ${JSON.stringify(classGradeMap)},
                gradeOrder: ${JSON.stringify(gradeOrder)},
                gradeCodeMap: ${JSON.stringify(gradeCodeMap)},
                averageScoreRecords: ${JSON.stringify(averageScoreRecords)},
                subjects: ${JSON.stringify(Array.from(subjects))},
                subjectOrder: ${JSON.stringify(subjectOrder)},
                years: ${JSON.stringify(Array.from(new Set(averageScoreRecords.map(r => r.academicYear))).sort())}
            };

            // 将 students 数据转换回 Map 对象
            const students = new Map(data.students);

            // 導航功能
            document.querySelectorAll('.nav-item').forEach(item => {
                item.addEventListener('click', function() {
                    // 移除所有活動狀態
                    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
                    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
                    
                    // 設置當前項目為活動狀態
                    this.classList.add('active');
                    document.getElementById(this.dataset.page).classList.add('active');
                });
            });

            // 初始化顯示第一個頁面
            document.querySelector('.page').classList.add('active');

            // 工具函數
            function calculateStatistics(scores) {
                const sorted = scores.sort((a, b) => a - b);
                const q1 = sorted[Math.floor(sorted.length * 0.25)];
                const median = sorted[Math.floor(sorted.length * 0.5)];
                const q3 = sorted[Math.floor(sorted.length * 0.75)];
                const min = sorted[0];
                const max = sorted[sorted.length - 1];
                
                return { min, q1, median, q3, max };
            }

            // 修改 calculateHistogramData 函數
            function calculateHistogramData(records) {
                // 先按學生ID和學年分組計算每個學生在每個學年的平均分
                const yearlyAverages = new Map();
                records.forEach(record => {
                    const studentId = record.id.toUpperCase();
                    const key = studentId + '_' + record.academicYear;
                    
                    if (!yearlyAverages.has(key)) {
                        yearlyAverages.set(key, {
                            total: 0,
                            count: 0,
                            studentInfo: {
                                id: studentId,
                                name: record.studentName,
                                class: record.class,
                                studentNumber: record.studentNumber,
                                year: record.academicYear
                            }
                        });
                    }
                    const yearData = yearlyAverages.get(key);
                    yearData.total += record.averageScore;
                    yearData.count++;
                });

                // 計算每個學生的總平均分
                const studentAverages = new Map();
                const selectedYear = document.getElementById('gradeDistYear').value;
                
                if (selectedYear === 'all') {
                    // 如果選擇全學年，先計算每個學年的平均，再計算所有學年的平均
                    // 同時找出每個學生最後的學年資訊
                    const studentLastYearInfo = new Map();
                    
                    // 先找出每個學生的最後學年資訊
                    Array.from(yearlyAverages.entries()).forEach(([key, data]) => {
                        const studentId = data.studentInfo.id;
                        if (!studentLastYearInfo.has(studentId) || 
                            data.studentInfo.year > studentLastYearInfo.get(studentId).year) {
                            studentLastYearInfo.set(studentId, data.studentInfo);
                        }
                    });

                    // 計算平均分並保存最後學年資訊
                    Array.from(yearlyAverages.entries()).forEach(([key, data]) => {
                        const studentId = data.studentInfo.id;
                        const yearlyAverage = data.total / data.count;
                        
                        if (!studentAverages.has(studentId)) {
                            studentAverages.set(studentId, {
                                total: 0,
                                count: 0,
                                studentInfo: studentLastYearInfo.get(studentId) // 使用最後學年的資訊
                            });
                        }
                        
                        const studentData = studentAverages.get(studentId);
                        studentData.total += yearlyAverage;
                        studentData.count++;
                    });
                } else {
                    // 如果選擇特定學年，直接使用該學年的平均
                    Array.from(yearlyAverages.entries()).forEach(([key, data]) => {
                        const studentId = data.studentInfo.id;
                        if (data.studentInfo.year === selectedYear) {
                            studentAverages.set(studentId, {
                                total: data.total,
                                count: data.count,
                                studentInfo: data.studentInfo
                            });
                        }
                    });
                }

                // 創建分數區間
                const intervals = [
                    { label: '0-10', min: 0, max: 10 },
                    { label: '11-20', min: 11, max: 20 },
                    { label: '21-30', min: 21, max: 30 },
                    { label: '31-40', min: 31, max: 40 },
                    { label: '41-50', min: 41, max: 50 },
                    { label: '51-60', min: 51, max: 60 },
                    { label: '61-70', min: 61, max: 70 },
                    { label: '71-80', min: 71, max: 80 },
                    { label: '81-90', min: 81, max: 90 },
                    { label: '91-100', min: 91, max: 100 }
                ].map(interval => ({
                    ...interval,
                    count: 0,
                    students: new Set()
                }));

                // 將每個學生的平均分分配到區間
                Array.from(studentAverages.entries()).forEach(([studentId, data]) => {
                    const average = data.total / data.count;
                    const roundedForInterval = Math.round(average);
                    
                    const interval = intervals.find(int => 
                        roundedForInterval >= int.min && 
                        (roundedForInterval <= int.max || (roundedForInterval === 100 && int.max === 100))
                    );

                    if (interval) {
                        interval.count++;
                        interval.students.add({
                            ...data.studentInfo,
                            average: average
                        });
                    }
                });

                return intervals.filter(interval => interval.count > 0);
            }

            // 修改成績分布分析圖表初始化函數
            function initGradeDistribution() {
                const ctx1 = document.getElementById('histogramChart').getContext('2d');
                
                // 初始化直方图
                histogram = new Chart(ctx1, {
                    type: 'bar',
                    data: {
                        labels: [],
                        datasets: [{
                            label: '學生人數',
                            data: [],
                            backgroundColor: 'rgba(54, 162, 235, 0.5)'
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            title: {
                                display: true,
                                text: '成績分布直方圖',
                                font: { size: 16 }
                            },
                            legend: {
                                display: false
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                title: {
                                    display: true,
                                    text: '學生人數'
                                }
                            },
                            x: {
                                title: {
                                    display: true,
                                    text: '分數區間'
                                }
                            }
                        },
                        onClick: (event, elements) => {
                            if (elements.length > 0) {
                                const index = elements[0].index;
                                const interval = histogram.data.labels[index];
                                
                                // 更新全局變量
                                lastSelectedInterval = interval;
                                
                                // 高亮顯示選中的柱狀
                                const datasets = histogram.data.datasets;
                                datasets[0].backgroundColor = datasets[0].data.map((_, i) => 
                                    i === index ? 'rgba(255, 99, 132, 0.5)' : 'rgba(54, 162, 235, 0.5)'
                                );
                                histogram.update('none');
                                
                                // 更新學生列表
                                updateStudentList(interval);
                            }
                        }
                    }
                });

                // 初始化學生列表為提示信息
                updateStudentList(null);

                // 修改箱形圖初始化
                const ctx2 = document.getElementById('boxplotChart').getContext('2d');
                const boxplot = new Chart(ctx2, {
                    type: 'boxplot',
                    data: {
                        labels: data.gradeOrder,
                        datasets: [{
                            label: '成績箱形圖',
                            data: data.gradeOrder.map(grade => {
                                // 先找出該年級的所有學生
                                const gradeStudents = new Set(
                                    data.averageScoreRecords
                                        .filter(r => r.gradeLevel === grade)
                                        .map(r => r.id)
                                );
                                
                                // 計算每個學生在每個學年的平均分
                                const yearlyAverages = new Map();
                                Array.from(gradeStudents).forEach(studentId => {
                                    const studentRecords = data.averageScoreRecords
                                        .filter(r => r.id === studentId && r.gradeLevel === grade);
                                    
                                    // 按學年分組計算平均分
                                    const years = new Set(studentRecords.map(r => r.academicYear));
                                    years.forEach(year => {
                                        const yearRecords = studentRecords.filter(r => r.academicYear === year);
                                        const yearAverage = yearRecords.reduce((sum, r) => sum + r.averageScore, 0) / yearRecords.length;
                                        
                                        if (!yearlyAverages.has(studentId)) {
                                            yearlyAverages.set(studentId, []);
                                        }
                                        yearlyAverages.get(studentId).push(yearAverage);
                                    });
                                });
                                
                                // 計算每個學生所有學年平均分的平均值
                                const studentFinalAverages = Array.from(yearlyAverages.entries()).map(([_, yearScores]) => {
                                    return yearScores.reduce((sum, score) => sum + score, 0) / yearScores.length;
                                });

                                // 如果沒有數據，返回空值
                                if (studentFinalAverages.length === 0) {
                                    return {
                                        min: null,
                                        q1: null,
                                        median: null,
                                        q3: null,
                                        max: null,
                                        mean: null,
                                        count: 0
                                    };
                                }

                                // 排序最終平均分用於計算四分位數
                                const sorted = studentFinalAverages.sort((a, b) => a - b);
                                
                                return {
                                    min: sorted[0],
                                    q1: calculateQuartile(sorted, 0.25),
                                    median: calculateQuartile(sorted, 0.5),
                                    q3: calculateQuartile(sorted, 0.75),
                                    max: sorted[sorted.length - 1],
                                    mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
                                    count: sorted.length
                                };
                            }),
                            backgroundColor: 'rgba(255, 99, 132, 0.5)',
                            borderColor: 'rgb(255, 99, 132)',
                            borderWidth: 1,
                            itemRadius: 0,
                            itemStyle: 'circle',
                            itemBackgroundColor: 'rgba(255, 99, 132, 0.5)'
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            title: {
                                display: true,
                                text: '各年級成績分布',
                                font: { size: 16 }
                            },
                            legend: {
                                display: false
                            },
                            tooltip: {
                                callbacks: {
                                    title: function(context) {
                                        const index = context[0].dataIndex;
                                        const grade = data.gradeOrder[index];
                                        const count = context[0].raw.count;
                                        return grade + ' (' + count + '人)';
                                    },
                                    label: function(context) {
                                        const value = context.raw;
                                        return [
                                            '平均值: ' + (value.mean ? value.mean.toFixed(1) : 'N/A'),
                                            '最大值: ' + (value.max ? value.max.toFixed(1) : 'N/A'),
                                            '第三四分位數: ' + (value.q3 ? value.q3.toFixed(1) : 'N/A'),
                                            '中位數: ' + (value.median ? value.median.toFixed(1) : 'N/A'),
                                            '第一四分位數: ' + (value.q1 ? value.q1.toFixed(1) : 'N/A'),
                                            '最小值: ' + (value.min ? value.min.toFixed(1) : 'N/A')
                                        ];
                                    }
                                }
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                min: 50,
                                max: 100,
                                title: {
                                    display: true,
                                    text: '分數'
                                }
                            },
                            x: {
                                title: {
                                    display: true,
                                    text: '年級'
                                },
                                ticks: {
                                    callback: function(value) {
                                        const grade = data.gradeOrder[value];
                                        const count = this.chart.data.datasets[0].data[value] ? 
                                            this.chart.data.datasets[0].data[value].count || 0 : 0;
                                        return grade + '\\n(' + count + '人)';
                                    }
                                }
                            }
                        }
                    }
                });

                // 四分位數計算函數
                function calculateQuartile(arr, q) {
                    const sorted = [...arr].sort((a, b) => a - b);
                    const pos = (sorted.length - 1) * q;
                    const base = Math.floor(pos);
                    const rest = pos - base;
                    if (sorted[base + 1] !== undefined) {
                        return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
                    } else {
                        return sorted[base];
                    }
                }

                // 修改更新函數
                function updateDistributionCharts() {
                    const subject = document.getElementById('gradeDistSubject').value;
                    const year = document.getElementById('gradeDistYear').value;
                    
                    // 過濾記錄
                    let filteredRecords = data.averageScoreRecords;
                    if (subject !== 'all') {
                        filteredRecords = filteredRecords.filter(r => r.subject === subject);
                    }
                    if (year !== 'all') {
                        filteredRecords = filteredRecords.filter(r => r.academicYear === year);
                    }

                    // 更新直方圖數據
                    const histogramData = calculateHistogramData(filteredRecords);
                    histogram.data.labels = histogramData.map(interval => interval.label);
                    histogram.data.datasets[0].data = histogramData.map(interval => interval.count);
                    histogram.data.datasets[0].backgroundColor = new Array(histogramData.length)
                        .fill('rgba(54, 162, 235, 0.5)');
                    histogram.update('none');

                    // 更新下拉選單選項
                    const scoreIntervalSelect = document.getElementById('scoreIntervalSelect');
                    scoreIntervalSelect.innerHTML = '<option value="">選擇分數區間...</option>';
                    
                    // 只添加有數據的區間
                    histogramData.forEach(interval => {
                        if (interval.count > 0) {
                            const option = document.createElement('option');
                            option.value = interval.label;
                            option.textContent = interval.label;
                            scoreIntervalSelect.appendChild(option);
                        }
                    });

                    // 重置選中區間和學生列表
                    lastSelectedInterval = null;
                    scoreIntervalSelect.value = '';
                    updateStudentList(null);

                    // 計算每個年級的數據
                    const gradeData = data.gradeOrder.map(grade => {
                        // 先找出該年級的所有學生
                        const gradeStudents = new Set(
                            filteredRecords
                                .filter(r => r.gradeLevel === grade)
                                .map(r => r.id)
                        );
                        
                        // 計算每個學生在篩選條件下的平均分
                        const yearlyAverages = new Map();
                        Array.from(gradeStudents).forEach(studentId => {
                            const studentRecords = filteredRecords
                                .filter(r => r.id === studentId && r.gradeLevel === grade);
                            
                            // 按學年分組計算平均分
                            const years = new Set(studentRecords.map(r => r.academicYear));
                            years.forEach(year => {
                                const yearRecords = studentRecords.filter(r => r.academicYear === year);
                                const yearAverage = yearRecords.reduce((sum, r) => sum + r.averageScore, 0) / yearRecords.length;
                                
                                if (!yearlyAverages.has(studentId)) {
                                    yearlyAverages.set(studentId, []);
                                }
                                yearlyAverages.get(studentId).push(yearAverage);
                            });
                        });
                        
                        // 計算每個學生所有學年平均分的平均值
                        const studentFinalAverages = Array.from(yearlyAverages.entries()).map(([_, yearScores]) => {
                            return yearScores.reduce((sum, score) => sum + score, 0) / yearScores.length;
                        });

                        // 如果沒有數據，返回 null
                        if (studentFinalAverages.length === 0) {
                            return null;
                        }

                        // 排序最終平均分用於計算四分位數
                        const sorted = studentFinalAverages.sort((a, b) => a - b);
                        
                        return {
                            grade,
                            data: {
                                min: sorted[0],
                                q1: calculateQuartile(sorted, 0.25),
                                median: calculateQuartile(sorted, 0.5),
                                q3: calculateQuartile(sorted, 0.75),
                                max: sorted[sorted.length - 1],
                                mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
                                count: sorted.length
                            }
                        };
                    }).filter(item => item !== null); // 過濾掉沒有數據的年級

                    // 更新箱形圖數據
                    boxplot.data.labels = gradeData.map(item => item.grade);
                    boxplot.data.datasets[0].data = gradeData.map(item => item.data);

                    // 更新箱形圖標題
                    let titleText = '各年級成績分布';
                    if (subject !== 'all') {
                        titleText += ' - ' + subject;
                    }
                    if (year !== 'all') {
                        titleText += ' (' + year + ')';
                    }
                    boxplot.options.plugins.title.text = titleText;

                    // 更新 x 軸標籤顯示
                    boxplot.options.scales.x.ticks.callback = function(value) {
                        const grade = boxplot.data.labels[value];
                        const count = boxplot.data.datasets[0].data[value].count;
                        return grade + '\\n(' + count + '人)';  // 使用 \\n 作為換行符
                    };

                    boxplot.update('none');
                }

                // 初始化下拉選單
                const subjectSelect = document.getElementById('gradeDistSubject');
                const yearSelect = document.getElementById('gradeDistYear');

                // 添加科目選項
                const uniqueSubjects = new Set(data.averageScoreRecords.map(r => r.subject));
                uniqueSubjects.forEach(subject => {
                    const option = document.createElement('option');
                    option.value = subject;
                    option.textContent = subject;
                    subjectSelect.appendChild(option);
                });
                
                // 添加年度選項
                data.years.forEach(year => {
                    const option = document.createElement('option');
                    option.value = year;
                    option.textContent = year;
                    yearSelect.appendChild(option);
                });

                // 綁定事件監聽器
                subjectSelect.addEventListener('change', updateDistributionCharts);
                yearSelect.addEventListener('change', updateDistributionCharts);

                // 初始更新
                updateDistributionCharts();
            }

            function initYearlyTrend() {
                const ctx1 = document.getElementById('trendChart').getContext('2d');
                const ctx2 = document.getElementById('gradesTrendChart').getContext('2d');
                const allSubjectsCheckbox = document.getElementById('trendSelectAll');
                const allGradesCheckbox = document.getElementById('gradesTrendSelectAll');
                const subjectSelect = document.getElementById('trendSubject');
                const gradeSelect = document.getElementById('trendGrade');
                
                // 初始化下拉選單
                data.subjectOrder.forEach(subject => {
                    const option = document.createElement('option');
                    option.value = subject;
                    option.textContent = subject;
                    subjectSelect.appendChild(option);
                });

                data.gradeOrder.forEach(grade => {
                    const option = document.createElement('option');
                    option.value = grade;
                    option.textContent = grade;
                    gradeSelect.appendChild(option);
                });

                // 生成顏色函數
                function generateColor(index) {
                    const hue = (index * 137.508) % 360;
                    return 'hsl(' + hue + ', 70%, 60%)';
                }

                // 初始化科目趨勢圖
                const trendChart = new Chart(ctx1, {
                    type: 'line',
                    data: {
                        labels: data.years,
                        datasets: []
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            title: {
                                display: true,
                                text: '科目成績趨勢',
                                font: { size: 16 }
                            },
                            legend: {
                                position: 'bottom',
                                onClick: function(e, legendItem, legend) {
                                    const index = legend.chart.data.datasets.findIndex(ds => ds.label === legendItem.text);
                                    if (index > -1) {
                                        const dataset = legend.chart.data.datasets[index];
                                        dataset.hidden = !dataset.hidden;
                                        const allVisible = legend.chart.data.datasets.every(ds => !ds.hidden);
                                        allSubjectsCheckbox.checked = allVisible;
                                        legend.chart.update();
                                    }
                                }
                            }
                        },
                        scales: {
                            y: {
                                min: 50,
                                max: 100,
                                title: {
                                    display: true,
                                    text: '平均分數'
                                }
                            },
                            x: {
                                title: {
                                    display: true,
                                    text: '學年度'
                                }
                            }
                        }
                    }
                });

                // 初始化年級趨勢圖
                const gradesTrendChart = new Chart(ctx2, {
                    type: 'line',
                    data: {
                        labels: data.years,
                        datasets: []
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            title: {
                                display: true,
                                text: '年級成績趨勢',
                                font: { size: 16 }
                            },
                            legend: {
                                position: 'bottom',
                                onClick: function(e, legendItem, legend) {
                                    const index = legend.chart.data.datasets.findIndex(ds => ds.label === legendItem.text);
                                    if (index > -1) {
                                        const dataset = legend.chart.data.datasets[index];
                                        dataset.hidden = !dataset.hidden;
                                        const allVisible = legend.chart.data.datasets.every(ds => !ds.hidden);
                                        allGradesCheckbox.checked = allVisible;
                                        legend.chart.update();
                                    }
                                }
                            }
                        },
                        scales: {
                            y: {
                                min: 50,
                                max: 100,
                                title: {
                                    display: true,
                                    text: '平均分數'
                                }
                            },
                            x: {
                                title: {
                                    display: true,
                                    text: '學年度'
                                }
                            }
                        }
                    }
                });

                // 更新圖表函數
                function updateCharts() {
                    const selectedSubject = subjectSelect.value;
                    const selectedGrade = gradeSelect.value;

                    // 過濾數據
                    let filteredRecords = data.averageScoreRecords;
                    if (selectedSubject !== 'all') {
                        filteredRecords = filteredRecords.filter(r => r.subject === selectedSubject);
                    }
                    if (selectedGrade !== 'all') {
                        filteredRecords = filteredRecords.filter(r => r.gradeLevel === selectedGrade);
                    }

                    // 更新科目趨勢圖
                    trendChart.data.datasets = data.subjectOrder.map((subject, index) => {
                        const color = generateColor(index);
                        const subjectData = data.years.map(year => {
                            const yearRecords = filteredRecords.filter(r => 
                                r.academicYear === year && 
                                r.subject === subject
                            );
                            if (yearRecords.length === 0) return null;
                            return yearRecords.reduce((sum, r) => sum + r.averageScore, 0) / yearRecords.length;
                        });

                        // 只有當有數據時才返回數據集
                        if (subjectData.some(d => d !== null)) {
                            return {
                                label: subject,
                                data: subjectData,
                                borderColor: color,
                                backgroundColor: color,
                                tension: 0.1,
                                fill: false,
                                hidden: !allSubjectsCheckbox.checked
                            };
                        }
                        return null;
                    }).filter(dataset => dataset !== null);

                    // 更新年級趨勢圖
                    gradesTrendChart.data.datasets = data.gradeOrder.map((grade, index) => {
                        const color = generateColor(index + data.subjectOrder.length); // 使用不同的顏色範圍
                        const gradeData = data.years.map(year => {
                            const yearRecords = filteredRecords.filter(r => 
                                r.academicYear === year && 
                                r.gradeLevel === grade
                            );
                            if (yearRecords.length === 0) return null;
                            return yearRecords.reduce((sum, r) => sum + r.averageScore, 0) / yearRecords.length;
                        });

                        // 只有當有數據時才返回數據集
                        if (gradeData.some(d => d !== null)) {
                            return {
                                label: grade,
                                data: gradeData,
                                borderColor: color,
                                backgroundColor: color,
                                tension: 0.1,
                                fill: false,
                                hidden: !allGradesCheckbox.checked
                            };
                        }
                        return null;
                    }).filter(dataset => dataset !== null);

                    trendChart.update();
                    gradesTrendChart.update();
                }

                // 綁定事件監聽器
                allSubjectsCheckbox.addEventListener('change', function() {
                    const isChecked = this.checked;
                    trendChart.data.datasets.forEach(dataset => {
                        dataset.hidden = !isChecked;
                    });
                    trendChart.update();
                });

                allGradesCheckbox.addEventListener('change', function() {
                    const isChecked = this.checked;
                    gradesTrendChart.data.datasets.forEach(dataset => {
                        dataset.hidden = !isChecked;
                    });
                    gradesTrendChart.update();
                });

                subjectSelect.addEventListener('change', updateCharts);
                gradeSelect.addEventListener('change', updateCharts);

                // 初始更新
                updateCharts();
            }

            function initSubjectComparison() {
                const ctx = document.getElementById('subjectChart').getContext('2d');
                
                // 計算每個科目的平均分
                function calculateSubjectAverages(records) {
                    const subjectData = new Map();
                    
                    // 先按科目和學生分組計算平均分
                    records.forEach(record => {
                        const subject = record.subject;
                        if (!subjectData.has(subject)) {
                            subjectData.set(subject, new Map());
                        }
                        
                        const studentScores = subjectData.get(subject);
                        if (!studentScores.has(record.id)) {
                            studentScores.set(record.id, []);
                        }
                        studentScores.get(record.id).push(record.averageScore);
                    });
                    
                    // 計算每個科目的整體平均分和合格率
                    const result = new Map();
                    subjectData.forEach((studentScores, subject) => {
                        // 先計算每個學生的平均分
                        const studentAverages = Array.from(studentScores.values()).map(scores => 
                            scores.reduce((a, b) => a + b, 0) / scores.length
                        );
                        
                        // 計算合格人數（平均分 >= 60 的學生數）
                        const passCount = studentAverages.filter(avg => avg >= 60).length;
                        const passRate = (passCount / studentAverages.length) * 100;
                        
                        // 儲存統計數據
                        result.set(subject, {
                            average: studentAverages.reduce((a, b) => a + b, 0) / studentAverages.length,
                            count: studentAverages.length,
                            passRate: passRate
                        });
                    });
                    
                    return result;
                }
                
                // 生成隨機顏色
                function generateColor(index) {
                    const hue = (index * 137.508) % 360;
                    return 'hsl(' + hue + ', 70%, 60%)';
                }
                
                // 初始化柱狀圖
                let currentSubjectAverages = calculateSubjectAverages(data.averageScoreRecords);
                
                // 只保留有數據的科目
                const subjectsWithData = data.subjectOrder.filter(subject => 
                    currentSubjectAverages.has(subject)
                );
                
                // 為有數據的科目生成顏色
                const subjectColors = subjectsWithData.map((_, index) => {
                    const color = generateColor(index);
                    return {
                        backgroundColor: color.replace('60%)', '50%)'),
                        borderColor: color.replace('60%)', '70%)')
                    };
                });
                
                const subjectChart = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: subjectsWithData,
                        datasets: [
                            {
                                label: '平均分數',
                                data: subjectsWithData.map(subject => {
                                    const data = currentSubjectAverages.get(subject);
                                    return data ? data.average : null;
                                }),
                                backgroundColor: subjectColors.map(c => c.backgroundColor),
                                borderColor: subjectColors.map(c => c.borderColor),
                                borderWidth: 1,
                                yAxisID: 'y',
                                order: 2  // 設置較大的順序值，使其在下層顯示
                            },
                            {
                                label: '合格率',
                                data: subjectsWithData.map(subject => {
                                    const data = currentSubjectAverages.get(subject);
                                    return data ? data.passRate : null;
                                }),
                                backgroundColor: 'rgba(255, 159, 64, 0.5)',
                                borderColor: 'rgb(255, 159, 64)',
                                borderWidth: 2,  // 增加線條寬度使其更明顯
                                type: 'line',
                                yAxisID: 'y1',
                                order: 1,  // 設置較小的順序值，使其在上層顯示
                                pointRadius: 4,  // 增加數據點大小
                                pointHoverRadius: 6,  // 增加懸停時數據點大小
                                tension: 0.3  // 使線條更平滑
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            title: {
                                display: true,
                                text: '各科目平均表現與合格率',
                                font: {
                                    size: 16
                                }
                            },
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        const subject = context.label;
                                        const data = currentSubjectAverages.get(subject);
                                        if (data) {
                                            if (context.datasetIndex === 0) {
                                                return [
                                                    '平均分數: ' + data.average.toFixed(1),
                                                    '學生人數: ' + data.count
                                                ];
                                            } else {
                                                return '合格率: ' + data.passRate.toFixed(1) + '%';
                                            }
                                        }
                                        return '';
                                    }
                                }
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                position: 'left',
                                title: {
                                    display: true,
                                    text: '平均分數'
                                },
                                grid: {
                                    drawOnChartArea: true
                                },
                                max: 100  // 添加此行，設置Y軸上限為100
                            },
                            y1: {
                                beginAtZero: true,
                                position: 'right',
                                title: {
                                    display: true,
                                    text: '合格率 (%)'
                                },
                                max: 100,
                                grid: {
                                    drawOnChartArea: false
                                }
                            },
                            x: {
                                title: {
                                    display: true,
                                    text: '科目'
                                }
                            }
                        }
                    }
                });

                // 初始化年級複選框
                const gradeCheckboxContainer = document.getElementById('gradeCheckboxes');
                const allGradeCheckbox = document.querySelector('.grade-selection input[value="all"]');
                
                // 按照 gradeOrder 的順序創建年級複選框
                data.gradeOrder.forEach(grade => {
                    const div = document.createElement('div');
                    div.innerHTML = 
                        '<label>' +
                        '<input type="checkbox" value="' + grade + '" checked>' +
                        grade +
                        '</label>';
                    gradeCheckboxContainer.appendChild(div);
                });

                // 處理全選checkbox的事件
                allGradeCheckbox.addEventListener('change', function() {
                    const checkboxes = gradeCheckboxContainer.querySelectorAll('input[type="checkbox"]');
                    checkboxes.forEach(checkbox => {
                        checkbox.checked = this.checked;
                    });
                    updateChart();
                });

                // 處理個別年級checkbox的事件
                gradeCheckboxContainer.addEventListener('change', function(e) {
                    if (e.target.type === 'checkbox') {
                        const allChecked = Array.from(gradeCheckboxContainer.querySelectorAll('input[type="checkbox"]'))
                            .every(cb => cb.checked);
                        allGradeCheckbox.checked = allChecked;
                        updateChart();
                    }
                });

                // 修改更新函數
                function updateChart() {
                    const year = document.getElementById('subjectYear').value;
                    const selectedGrades = Array.from(gradeCheckboxContainer.querySelectorAll('input[type="checkbox"]:checked'))
                        .map(cb => cb.value);
                    
                    let filteredRecords = data.averageScoreRecords;
                    if (year !== 'all') {
                        filteredRecords = filteredRecords.filter(r => r.academicYear === year);
                    }
                    
                    // 根據選擇的年級過濾數據
                    filteredRecords = filteredRecords.filter(r => selectedGrades.includes(r.gradeLevel));
                    
                    // 更新當前的科目平均值數據
                    currentSubjectAverages = calculateSubjectAverages(filteredRecords);
                    
                    // 更新有數據的科目列表
                    const subjectsWithData = data.subjectOrder.filter(subject => 
                        currentSubjectAverages.has(subject)
                    );
                    
                    // 更新圖表數據
                    subjectChart.data.labels = subjectsWithData;
                    subjectChart.data.datasets[0].data = subjectsWithData.map(subject => {
                        const data = currentSubjectAverages.get(subject);
                        return data ? data.average : null;
                    });
                    
                    // 更新合格率數據
                    subjectChart.data.datasets[1].data = subjectsWithData.map(subject => {
                        const data = currentSubjectAverages.get(subject);
                        return data ? data.passRate : null;
                    });
                    
                    // 更新顏色
                    const newColors = subjectsWithData.map((_, index) => {
                        const color = generateColor(index);
                        return {
                            backgroundColor: color.replace('60%)', '50%)'),
                            borderColor: color.replace('60%)', '70%)')
                        };
                    });
                    
                    subjectChart.data.datasets[0].backgroundColor = newColors.map(c => c.backgroundColor);
                    subjectChart.data.datasets[0].borderColor = newColors.map(c => c.borderColor);
                    
                    subjectChart.update();
                }

                // 初始化年度選擇下拉選單
                const yearSelect = document.getElementById('subjectYear');
                data.years.forEach(year => {
                    const option = document.createElement('option');
                    option.value = year;
                    option.textContent = year;
                    yearSelect.appendChild(option);
                });

                // 綁定事件監聽器
                yearSelect.addEventListener('change', updateChart);

                // 初始更新
                updateChart();
            }

            function initCategoryAnalysis() {
                const genderCtx = document.getElementById('genderChart').getContext('2d');
                const gradeCtx = document.getElementById('gradeChart').getContext('2d');
                
                // 計算不同分類的平均分
                function calculateCategoryAverages(records, categoryKey) {
                    const categoryData = new Map();
                    
                    // 先按分類和學生分組計算平均分
                    records.forEach(record => {
                        const category = record[categoryKey];
                        if (!categoryData.has(category)) {
                            categoryData.set(category, new Map());
                        }
                        
                        const studentScores = categoryData.get(category);
                        if (!studentScores.has(record.id)) {
                            studentScores.set(record.id, []);
                        }
                        studentScores.get(record.id).push(record.averageScore);
                    });
                    
                    // 計算每個分類的統計數據
                    const result = new Map();
                    categoryData.forEach((studentScores, category) => {
                        // 計算每個學生的平均分
                        const studentAverages = Array.from(studentScores.values()).map(scores => 
                            scores.reduce((a, b) => a + b, 0) / scores.length
                        );
                        
                        // 計算統計數據
                        result.set(category, {
                            average: studentAverages.reduce((a, b) => a + b, 0) / studentAverages.length,
                            count: studentAverages.length,
                            min: Math.min(...studentAverages),
                            max: Math.max(...studentAverages),
                            data: studentAverages
                        });
                    });
                    
                    return result;
                }
                
                // 生成顏色
                function generateColors(count) {
                    return Array.from({ length: count }, (_, i) => {
                        const hue = (i * 137.508) % 360;
                        return {
                            backgroundColor: 'hsl(' + hue + ', 70%, 50%, 0.5)',
                            borderColor: 'hsl(' + hue + ', 70%, 60%)'
                        };
                    });
                }
                
                // 初始化性別分析圖表
                const genderChart = new Chart(genderCtx, {
                    type: 'bar',
                    data: {
                        labels: ['男', '女'],
                        datasets: [{
                            label: '平均分數',
                            data: [],
                            backgroundColor: ['rgba(54, 162, 235, 0.5)', 'rgba(255, 99, 132, 0.5)'],
                            borderColor: ['rgb(54, 162, 235)', 'rgb(255, 99, 132)'],
                            borderWidth: 1
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                display: false
                            },
                            title: {
                                display: true,
                                text: '性別成績分布',
                                font: { size: 16 }
                            },
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        const data = context.dataset.categoryData?.get(context.label);
                                        if (data) {
                                            return [
                                                '平均分數: ' + data.average.toFixed(1),
                                                '學生人數: ' + data.count,
                                                '最高分: ' + data.max.toFixed(1),
                                                '最低分: ' + data.min.toFixed(1)
                                            ];
                                        }
                                        return '';
                                    }
                                }
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                title: { display: true, text: '平均分數' }
                            }
                        }
                    }
                });
                
                // 初始化年級分析圖表
                const gradeChart = new Chart(gradeCtx, {
                    type: 'bar',
                    data: {
                        labels: data.gradeOrder,
                        datasets: [{
                            label: '平均分數',
                            data: [],
                            backgroundColor: generateColors(data.gradeOrder.length).map(c => c.backgroundColor),
                            borderColor: generateColors(data.gradeOrder.length).map(c => c.borderColor),
                            borderWidth: 1
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                display: false
                            },
                            title: {
                                display: true,
                                text: '年級成績分布',
                                font: { size: 16 }
                            },
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        const data = context.dataset.categoryData?.get(context.label);
                                        if (data) {
                                            return [
                                                '平均分數: ' + data.average.toFixed(1),
                                                '學生人數: ' + data.count,
                                                '最高分: ' + data.max.toFixed(1),
                                                '最低分: ' + data.min.toFixed(1)
                                            ];
                                        }
                                        return '';
                                    }
                                }
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                title: { display: true, text: '平均分數' }
                            }
                        }
                    }
                });

                // 更新函數
                function updateCategoryCharts() {
                    const year = document.getElementById('categoryYear').value;
                    const subject = document.getElementById('categorySubject').value;
                    
                    let filteredRecords = data.averageScoreRecords;
                    
                    if (year !== 'all') {
                        filteredRecords = filteredRecords.filter(r => r.academicYear === year);
                    }
                    if (subject !== 'all') {
                        filteredRecords = filteredRecords.filter(r => r.subject === subject);
                    }

                    // 為每條記錄添加性別信息
                    filteredRecords = filteredRecords.map(record => {
                        const studentInfo = students.get(record.id);
                        return {
                            ...record,
                            gender: studentInfo ? studentInfo.gender : 'Unknown'
                        };
                    });

                    // 只保留有效的性別數據
                    const validGenderRecords = filteredRecords.filter(r => r.gender === '男' || r.gender === '女');

                    // 更新性別分析
                    const genderData = calculateCategoryAverages(validGenderRecords, 'gender');

                    genderChart.data.datasets[0].data = ['男', '女'].map(gender => {
                        const data = genderData.get(gender);
                        return data ? data.average : null;
                    });
                    genderChart.data.datasets[0].categoryData = genderData;
                    
                    // 添加標題更新
                    let titleText = '性別成績分布';
                    if (year !== 'all') {
                        titleText = titleText + ' (' + year + ')';
                    }
                    if (subject !== 'all') {
                        titleText = titleText + ' - ' + subject;
                    }
                    genderChart.options.plugins.title.text = titleText;
                    
                    genderChart.update();
                    
                    // 更新年級分析
                    const gradeData = calculateCategoryAverages(filteredRecords, 'gradeLevel');
                    
                    // 只保留有數據的年級
                    const gradesWithData = data.gradeOrder.filter(grade => 
                        gradeData.has(grade) && gradeData.get(grade).count > 0
                    );
                    
                    // 更新圖表數據
                    gradeChart.data.labels = gradesWithData;
                    gradeChart.data.datasets[0].data = gradesWithData.map(grade => {
                        const data = gradeData.get(grade);
                        return data ? data.average : null;
                    });
                    
                    // 更新顏色
                    const gradeColors = generateColors(gradesWithData.length);
                    gradeChart.data.datasets[0].backgroundColor = gradeColors.map(c => c.backgroundColor);
                    gradeChart.data.datasets[0].borderColor = gradeColors.map(c => c.borderColor);
                    
                    gradeChart.data.datasets[0].categoryData = gradeData;
                    
                    // 更新年級圖表標題
                    titleText = '年級成績分布';
                    if (year !== 'all') {
                        titleText = titleText + ' (' + year + ')';
                    }
                    if (subject !== 'all') {
                        titleText = titleText + ' - ' + subject;
                    }
                    gradeChart.options.plugins.title.text = titleText;
                    
                    gradeChart.update();
                }

                // 初始化下拉選單
                const yearSelect = document.getElementById('categoryYear');
                const subjectSelect = document.getElementById('categorySubject');
                
                // 添加年度選項
                data.years.forEach(year => {
                    const option = document.createElement('option');
                    option.value = year;
                    option.textContent = year;
                    yearSelect.appendChild(option);
                });
                
                // 添加科目選項
                data.subjectOrder.forEach(subject => {
                    const option = document.createElement('option');
                    option.value = subject;
                    option.textContent = subject;
                    subjectSelect.appendChild(option);
                });

                // 綁定事件監聽器
                yearSelect.addEventListener('change', updateCategoryCharts);
                subjectSelect.addEventListener('change', updateCategoryCharts);

                // 初始更新
                updateCategoryCharts();
            }

            function initStudentTracking() {
                const ctx = document.getElementById('studentChart').getContext('2d');
                
                // 初始化選擇控件
                const yearSelect = document.getElementById('trackingYear');
                const classSelect = document.getElementById('trackingClass');
                const studentSelect = document.getElementById('trackingStudent');
                const allSubjectsCheckbox = document.getElementById('trackingSelectAll');

                // 確保所有必要的元素都存在
                if (!yearSelect || !classSelect || !studentSelect || !allSubjectsCheckbox) {
                    console.error('無法找到必要的 DOM 元素');
                    return;
                }

                // 生成顏色函數
                function generateColor(index) {
                    const hue = (index * 137.508) % 360; // 使用黃金角來產生分散的顏色
                    return 'hsl(' + hue + ', 70%, 60%)'; // 使用 HSL 顏色空間
                }

                // 初始化圖表
                const studentChart = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: [],
                        datasets: []
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            title: {
                                display: true,
                                text: '學生成績追蹤',
                                font: { size: 16 }
                            },
                            legend: {
                                display: true,
                                position: 'bottom',
                                onClick: function(e, legendItem, legend) {
                                    const index = legend.chart.data.datasets.findIndex(d => d.label === legendItem.text);
                                    
                                    if (index > -1) {
                                        // 切換數據集的顯示狀態
                                        const dataset = legend.chart.data.datasets[index];
                                        dataset.hidden = !dataset.hidden;
                                        
                                        // 檢查是否所有數據集都顯示
                                        const allVisible = legend.chart.data.datasets.every(ds => !ds.hidden);
                                        allSubjectsCheckbox.checked = allVisible;
                                        
                                        legend.chart.update();
                                    }
                                }
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                title: {
                                    display: true,
                                    text: '分數'
                                }
                            },
                            x: {
                                title: {
                                    display: true,
                                    text: '學年'
                                }
                            }
                        }
                    }
                });

                // 初始化學年選單
                const years = Array.from(new Set(
                    data.averageScoreRecords.map(r => r.academicYear)
                )).sort((a, b) => a.localeCompare(b));

                yearSelect.innerHTML = '<option value="">選擇學年...</option>';
                years.forEach(year => {
                    const option = document.createElement('option');
                    option.value = year;
                    option.textContent = year;
                    yearSelect.appendChild(option);
                });

                // 學年選擇事件處理
                yearSelect.addEventListener('change', function() {
                    const selectedYear = this.value;
                    
                    // 重置班級和學生選擇
                    classSelect.innerHTML = '<option value="">選擇班級...</option>';
                    studentSelect.innerHTML = '<option value="">選擇學生...</option>';
                    
                    if (selectedYear) {
                        // 獲取該學年的所有班級
                        const yearClasses = Array.from(new Set(
                            data.averageScoreRecords
                                .filter(r => r.academicYear === selectedYear)
                                .map(r => r.class)
                        ));

                        // 按照 classOrder 的順序排序班級
                        const sortedClasses = data.classOrder.filter(className => 
                            yearClasses.includes(className)
                        );

                        // 添加班級選項
                        sortedClasses.forEach(className => {
                            const option = document.createElement('option');
                            option.value = className;
                            option.textContent = className;
                            classSelect.appendChild(option);
                        });

                        // 啟用班級選擇器
                        classSelect.disabled = false;
                        studentSelect.disabled = true;
                    } else {
                        // 如果沒有選擇學年，禁用班級和學生選擇器
                        classSelect.disabled = true;
                        studentSelect.disabled = true;
                    }
                    
                    updateStudentTrackingChart();
                });

                // 班級選擇事件處理
                classSelect.addEventListener('change', function() {
                    const selectedYear = yearSelect.value;
                    const selectedClass = this.value;
                    
                    // 重置學生選擇
                    studentSelect.innerHTML = '<option value="">選擇學生...</option>';
                    
                    if (selectedClass) {
                        // 獲取該班級的所有學生
                        const studentIds = new Set(
                            data.averageScoreRecords
                                .filter(r => r.academicYear === selectedYear && r.class === selectedClass)
                                .map(r => r.id)
                        );

                        // 獲取學生詳細資料並排序
                        const classStudents = Array.from(students.values())
                            .filter(student => studentIds.has(student.id))
                            .sort((a, b) => {
                                const studentA = data.averageScoreRecords.find(r => 
                                    r.id === a.id && 
                                    r.academicYear === selectedYear && 
                                    r.class === selectedClass
                                );
                                const studentB = data.averageScoreRecords.find(r => 
                                    r.id === b.id && 
                                    r.academicYear === selectedYear && 
                                    r.class === selectedClass
                                );
                                
                                // 將學號轉換為數值進行比較
                                const numA = parseInt(studentA?.studentNumber || '0', 10);
                                const numB = parseInt(studentB?.studentNumber || '0', 10);
                                return numA - numB;
                            });

                        // 添加學生選項
                        classStudents.forEach(student => {
                            const option = document.createElement('option');
                            option.value = student.id;
                            
                            const studentRecord = data.averageScoreRecords.find(r => 
                                r.id === student.id && 
                                r.academicYear === selectedYear && 
                                r.class === selectedClass
                            );
                            
                            option.textContent = studentRecord?.studentNumber ? 
                                studentRecord.studentNumber + ' - ' + student.name : 
                                student.name;
                                
                            studentSelect.appendChild(option);
                        });

                        // 啟用學生選擇器
                        studentSelect.disabled = false;
                    } else {
                        // 如果沒有選擇班級，禁用學生選擇器
                        studentSelect.disabled = true;
                    }
                    
                    updateStudentTrackingChart();
                });

                // 全選 checkbox 事件處理
                allSubjectsCheckbox.addEventListener('change', function() {
                    const isChecked = this.checked;
                    
                    // 強制更新所有數據集的顯示狀態
                    if (studentChart.data.datasets) {
                        studentChart.data.datasets.forEach(dataset => {
                            dataset.hidden = !isChecked;
                        });
                        
                        // 更新圖例狀態
                        studentChart.legend.legendItems.forEach(legendItem => {
                            legendItem.hidden = !isChecked;
                        });
                        
                        studentChart.update();
                    }
                });

                // 添加學生選擇事件處理
                studentSelect.addEventListener('change', updateStudentTrackingChart);

                // 定義更新圖表函數
                function updateStudentTrackingChart() {
                    const studentId = studentSelect.value;
                    
                    if (!studentId) {
                        studentChart.data.labels = [];
                        studentChart.data.datasets = [];
                        studentChart.update();
                        return;
                    }

                    // 獲取所有科目（使用 subjectOrder）
                    const allSubjects = data.subjectOrder;
                    const studentInfo = students.get(studentId);
                    
                    if (!studentInfo) {
                        console.error('找不到學生資料:', studentId);
                        return;
                    }

                    // 獲取學生的所有成績記錄
                    let studentRecords = data.averageScoreRecords.filter(r => 
                        r.id === studentId && 
                        allSubjects.includes(r.subject)
                    );

                    // 獲取所有學年並排序
                    const years = Array.from(new Set(studentRecords.map(r => r.academicYear))).sort();

                    // 更新圖表數據
                    studentChart.data.labels = years;
                    studentChart.data.datasets = allSubjects.map((subject, index) => {
                        const color = generateColor(index);
                        const subjectRecords = studentRecords.filter(r => r.subject === subject);
                        
                        // 按學年計算平均分
                        const yearlyAverages = years.map(year => {
                            const yearRecords = subjectRecords.filter(r => r.academicYear === year);
                            if (yearRecords.length === 0) return null;
                            
                            // 計算該學年該科目的平均分
                            const average = yearRecords.reduce((sum, r) => sum + r.averageScore, 0) / yearRecords.length;
                            return average;
                        });

                        return {
                            label: subject,
                            data: yearlyAverages,
                            borderColor: color,
                            backgroundColor: color,
                            tension: 0.1,
                            fill: false,
                            hidden: !allSubjectsCheckbox.checked
                        };
                    });

                    // 計算所有成績的最大值和最小值
                    const allScores = studentChart.data.datasets
                        .flatMap(dataset => dataset.data)
                        .filter(score => score !== null);
                    const minScore = Math.min(...allScores);
                    const maxScore = Math.max(...allScores);
                    
                    // 計算適當的 Y 軸範圍
                    const range = maxScore - minScore;
                    const padding = Math.max(5, range * 0.1);
                    
                    // 設定 Y 軸範圍
                    studentChart.options.scales.y.min = Math.max(0, Math.floor(minScore - padding));
                    studentChart.options.scales.y.max = Math.min(100, Math.ceil(maxScore + padding));

                    // 更新標題
                    studentChart.options.plugins.title.text = studentInfo.name + ' 的成績追蹤';

                    studentChart.update('none');
                }
            }

            // 初始化所有圖表
            initGradeDistribution();
            initYearlyTrend();
            initSubjectComparison();
            initCategoryAnalysis();
            initStudentTracking();
            // 其他圖表初始化函數將在後續添加...

            // 修改 calculateHistogramData 函數
            // function calculateHistogramData(records) {
            //     // 先計算每個學生的總平均分
            //     const studentAverages = new Map();
            //     records.forEach(record => {
            //         const studentId = record.id.toUpperCase(); // 確保ID一致
            //         if (!studentAverages.has(studentId)) {
            //             studentAverages.set(studentId, {
            //                 total: 0,
            //                 count: 0,
            //                 studentInfo: {
            //                     id: studentId,
            //                     name: record.studentName,
            //                     class: record.class,
            //                     studentNumber: record.studentNumber,
            //                     year: record.academicYear  // 保留學年資訊
            //                 }
            //             });
            //         }
            //         const student = studentAverages.get(studentId);
            //         // 如果是新的學年，更新學年資訊（保留最新的學年）
            //         student.studentInfo.year = record.academicYear;
            //         student.total += record.averageScore;
            //         student.count++;
            //     });

            //     // 創建分數區間（從0到100，每10分一個區間）
            //     const intervals = [
            //         { label: '0-10', min: 0, max: 10 },
            //         { label: '11-20', min: 11, max: 20 },
            //         { label: '21-30', min: 21, max: 30 },
            //         { label: '31-40', min: 31, max: 40 },
            //         { label: '41-50', min: 41, max: 50 },
            //         { label: '51-60', min: 51, max: 60 },
            //         { label: '61-70', min: 61, max: 70 },
            //         { label: '71-80', min: 71, max: 80 },
            //         { label: '81-90', min: 81, max: 90 },
            //         { label: '91-100', min: 91, max: 100 }
            //     ].map(interval => ({
            //         ...interval,
            //         count: 0,
            //         students: new Set()
            //     }));

            //     // 將每個學生的平均分分配到對應區間
            //     Array.from(studentAverages.entries()).forEach(([studentId, data]) => {
            //         const exactAverage = data.total / data.count; // 保持精確的平均值
            //         const roundedForInterval = Math.round(exactAverage); // 僅用於區間判斷
                    
            //         // 找到對應的區間
            //         const interval = intervals.find(int => 
            //             roundedForInterval >= int.min && 
            //             (roundedForInterval <= int.max || (roundedForInterval === 100 && int.max === 100))
            //         );

            //         if (interval) {
            //             interval.count++;
            //             // 存儲學生完整資訊，包含精確的平均值
            //             interval.students.add({
            //                 ...data.studentInfo,
            //                 average: exactAverage // 存儲精確值
            //             });
            //         } else {
            //             console.warn('無法為分數 ' + exactAverage + ' 找到對應區間');
            //         }
            //     });

            //     // 調試輸出
            //     console.log('分數區間統計（修改後）：');
            //     intervals.forEach(interval => {
            //         if (interval.students.size > 0) {
            //             console.log('區間 ' + interval.label + ':');
            //             console.log('人數: ' + interval.count);
            //             console.log('學生列表:');
            //             Array.from(interval.students).forEach(student => {
            //                 // 在顯示時才進行四捨五入
            //                 const displayAverage = Math.round(student.average * 10) / 10;
            //                 const yearlyScoresStr = student.yearlyScores
            //                     .map(score => score.year + ': ' + Math.round(score.average * 10) / 10)
            //                     .join(', ');
            //                 console.log('  ' + student.name + ': ' + displayAverage + ' (' + yearlyScoresStr + ')');
            //             });
            //         }
            //     });

            //     return intervals.filter(interval => interval.count > 0);
            // }

            // 修改 updateStudentList 函數，添加一個參數用於追踪是否為初始狀態
            function updateStudentList(interval) {
                const studentListContainer = document.getElementById('studentList');
                
                if (!interval) {
                    studentListContainer.innerHTML = '<p>點擊左側圖表的柱狀來查看該分數區間的學生</p>';
                    return;
                }
                
                // 獲取當前篩選條件
                const subject = document.getElementById('gradeDistSubject').value;
                const year = document.getElementById('gradeDistYear').value;
                
                // 過濾記錄
                let filteredRecords = data.averageScoreRecords;
                if (subject !== 'all') {
                    filteredRecords = filteredRecords.filter(r => r.subject === subject);
                }
                if (year !== 'all') {
                    filteredRecords = filteredRecords.filter(r => r.academicYear === year);
                }
                
                // 從過濾後的記錄計算直方圖數據
                const histogramData = calculateHistogramData(filteredRecords);
                const selectedInterval = histogramData.find(int => int.label === interval);
                
                if (!selectedInterval || !selectedInterval.students) {
                    studentListContainer.innerHTML = '<p>此區間沒有學生數據</p>';
                    return;
                }

                // 添加標題和下載按鈕
                const headerHTML = 
                    '<div class="student-list-header">' +
                        '<strong>分數區間 ' + interval + ' 的學生（共 ' + selectedInterval.students.size + ' 人）：</strong>' +
                        '<button onclick="downloadStudentListCSV()" class="download-csv-btn">下載 CSV</button>' +
                    '</div>';

                // 創建表格
                const tableHTML = 
                    '<table class="student-table">' +
                    '<thead>' +
                        '<tr>' +
                            '<th>學年</th>' +
                            '<th>班級</th>' +
                            '<th>學號</th>' +
                            '<th>姓名</th>' +
                            '<th>平均分數</th>' +
                        '</tr>' +
                    '</thead>' +
                    '<tbody>';

                // 將 Set 轉換為數組並排序
                const sortedStudents = Array.from(selectedInterval.students)
                    .sort((a, b) => {
                        // 先按學年排序
                        const yearCompare = a.year.localeCompare(b.year);
                        if (yearCompare !== 0) return yearCompare;
                        
                        // 再按班級排序
                        const classCompare = a.class.localeCompare(b.class);
                        if (classCompare !== 0) return classCompare;
                        
                        // 最後按學號排序
                        const numA = parseInt(a.studentNumber || '0');
                        const numB = parseInt(b.studentNumber || '0');
                        return numA - numB;
                    })
                    .map(student => {
                        // 從 students Map 中獲取學生姓名
                        const studentInfo = students.get(student.id);
                        return {
                            ...student,
                            name: studentInfo ? studentInfo.name : '未知'
                        };
                    });

                // 保存當前學生列表到全局變量，供下載使用
                window.currentStudentList = sortedStudents;

                let rowsHTML = '';
                sortedStudents.forEach(student => {
                    rowsHTML += 
                        '<tr>' +
                            '<td>' + student.year + '</td>' +
                            '<td>' + student.class + '</td>' +
                            '<td>' + (student.studentNumber || '') + '</td>' +
                            '<td>' + student.name + '</td>' +
                            '<td>' + student.average.toFixed(1) + '</td>' +
                        '</tr>';
                });

                studentListContainer.innerHTML = headerHTML + tableHTML + rowsHTML + '</tbody></table>';
            }

            // 修改 updateDistributionCharts 函數
            function updateDistributionCharts() {
                const subject = document.getElementById('gradeDistSubject').value;
                const year = document.getElementById('gradeDistYear').value;
                
                // 過濾記錄
                let filteredRecords = data.averageScoreRecords;
                if (subject !== 'all') {
                    filteredRecords = filteredRecords.filter(r => r.subject === subject);
                }
                if (year !== 'all') {
                    filteredRecords = filteredRecords.filter(r => r.academicYear === year);
                }

                // 更新直方圖數據
                const histogramData = calculateHistogramData(filteredRecords);
                histogram.data.labels = histogramData.map(interval => interval.label);
                histogram.data.datasets[0].data = histogramData.map(interval => interval.count);
                histogram.data.datasets[0].backgroundColor = new Array(histogramData.length)
                    .fill('rgba(54, 162, 235, 0.5)');
                histogram.update('none');

                // 更新下拉選單選項
                const scoreIntervalSelect = document.getElementById('scoreIntervalSelect');
                scoreIntervalSelect.innerHTML = '<option value="">選擇分數區間...</option>';
                
                // 只添加有數據的區間
                histogramData.forEach(interval => {
                    if (interval.count > 0) {
                        const option = document.createElement('option');
                        option.value = interval.label;
                        option.textContent = interval.label;
                        scoreIntervalSelect.appendChild(option);
                    }
                });

                // 重置選中區間和學生列表
                lastSelectedInterval = null;
                scoreIntervalSelect.value = '';
                updateStudentList(null);

                // 計算每個年級的數據
                const gradeData = data.gradeOrder.map(grade => {
                    // 先找出該年級的所有學生
                    const gradeStudents = new Set(
                        filteredRecords
                            .filter(r => r.gradeLevel === grade)
                            .map(r => r.id)
                    );
                    
                    // 計算每個學生在篩選條件下的平均分
                    const yearlyAverages = new Map();
                    Array.from(gradeStudents).forEach(studentId => {
                        const studentRecords = filteredRecords
                            .filter(r => r.id === studentId && r.gradeLevel === grade);
                        
                        // 按學年分組計算平均分
                        const years = new Set(studentRecords.map(r => r.academicYear));
                        years.forEach(year => {
                            const yearRecords = studentRecords.filter(r => r.academicYear === year);
                            const yearAverage = yearRecords.reduce((sum, r) => sum + r.averageScore, 0) / yearRecords.length;
                            
                            if (!yearlyAverages.has(studentId)) {
                                yearlyAverages.set(studentId, []);
                            }
                            yearlyAverages.get(studentId).push(yearAverage);
                        });
                    });
                    
                    // 計算每個學生所有學年平均分的平均值
                    const studentFinalAverages = Array.from(yearlyAverages.entries()).map(([_, yearScores]) => {
                        return yearScores.reduce((sum, score) => sum + score, 0) / yearScores.length;
                    });

                    // 如果沒有數據，返回 null
                    if (studentFinalAverages.length === 0) {
                        return null;
                    }

                    // 排序最終平均分用於計算四分位數
                    const sorted = studentFinalAverages.sort((a, b) => a - b);
                    
                    return {
                        grade,
                        data: {
                            min: sorted[0],
                            q1: calculateQuartile(sorted, 0.25),
                            median: calculateQuartile(sorted, 0.5),
                            q3: calculateQuartile(sorted, 0.75),
                            max: sorted[sorted.length - 1],
                            mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
                            count: sorted.length
                        }
                    };
                }).filter(item => item !== null); // 過濾掉沒有數據的年級

                // 更新箱形圖數據
                boxplot.data.labels = gradeData.map(item => item.grade);
                boxplot.data.datasets[0].data = gradeData.map(item => item.data);

                // 更新箱形圖標題
                let titleText = '各年級成績分布';
                if (subject !== 'all') {
                    titleText += ' - ' + subject;
                }
                if (year !== 'all') {
                    titleText += ' (' + year + ')';
                }
                boxplot.options.plugins.title.text = titleText;

                // 更新 x 軸標籤顯示
                boxplot.options.scales.x.ticks.callback = function(value) {
                    const grade = boxplot.data.labels[value];
                    const count = boxplot.data.datasets[0].data[value].count;
                    return grade + '\\n(' + count + '人)';  // 使用 \\n 作為換行符
                };

                boxplot.update('none');
            }

            // 修改圖表點擊事件處理
            histogram.options.onClick = (event, elements) => {
                if (elements.length > 0) {
                    const index = elements[0].index;
                    const interval = histogram.data.labels[index];
                    
                    // 更新全局變量
                    lastSelectedInterval = interval;
                    
                    // 高亮顯示選中的柱狀
                    const datasets = histogram.data.datasets;
                    datasets[0].backgroundColor = datasets[0].data.map((_, i) => 
                        i === index ? 'rgba(255, 99, 132, 0.5)' : 'rgba(54, 162, 235, 0.5)'
                    );
                    histogram.update('none');
                    
                    // 更新學生列表
                    updateStudentList(interval);
                }
            };

            // 修改年度和科目選擇的事件監聽器
            document.getElementById('gradeDistSubject').addEventListener('change', function() {
                // 保存當前選擇的區間
                const currentInterval = lastSelectedInterval;
                
                // 更新圖表基本數據
                updateDistributionCharts();
                
                // 如果之前有選擇區間，模擬點擊相同區間
                if (currentInterval) {
                    // 先嘗試找完全匹配的區間
                    let index = histogram.data.labels.findIndex(label => label === currentInterval);
                    
                    // 如果找不到完全匹配的區間，尋找最接近的區間
                    if (index === -1 && histogram.data.labels.length > 0) {
                        const [lastMin, lastMax] = currentInterval.split('-').map(Number);
                        const lastMidPoint = (lastMin + lastMax) / 2;
                        
                        let minDistance = Infinity;
                        
                        histogram.data.labels.forEach((label, i) => {
                            const [min, max] = label.split('-').map(Number);
                            const midPoint = (min + max) / 2;
                            const distance = Math.abs(midPoint - lastMidPoint);
                            
                            if (distance < minDistance) {
                                minDistance = distance;
                                index = i;
                            }
                        });
                    }
                    
                    if (index !== -1) {
                        const interval = histogram.data.labels[index];
                        lastSelectedInterval = interval;
                        
                        // 更新柱狀圖顏色
                        histogram.data.datasets[0].backgroundColor = histogram.data.labels.map((_, i) => 
                            i === index ? 'rgba(255, 99, 132, 0.5)' : 'rgba(54, 162, 235, 0.5)'
                        );
                        histogram.update('none');
                        
                        // 更新學生列表
                        updateStudentList(interval, true);
                    }
                }
            });

            // 為學年選擇添加相同的事件處理
            document.getElementById('gradeDistYear').addEventListener('change', function() {
                // 保存當前選擇的區間
                const currentInterval = lastSelectedInterval;
                
                // 更新圖表基本數據
                updateDistributionCharts();
                
                // 如果之前有選擇區間，模擬點擊相同區間
                if (currentInterval) {
                    // 先嘗試找完全匹配的區間
                    let index = histogram.data.labels.findIndex(label => label === currentInterval);
                    
                    // 如果找不到完全匹配的區間，尋找最接近的區間
                    if (index === -1 && histogram.data.labels.length > 0) {
                        const [lastMin, lastMax] = currentInterval.split('-').map(Number);
                        const lastMidPoint = (lastMin + lastMax) / 2;
                        
                        let minDistance = Infinity;
                        
                        histogram.data.labels.forEach((label, i) => {
                            const [min, max] = label.split('-').map(Number);
                            const midPoint = (min + max) / 2;
                            const distance = Math.abs(midPoint - lastMidPoint);
                            
                            if (distance < minDistance) {
                                minDistance = distance;
                                index = i;
                            }
                        });
                    }
                    
                    if (index !== -1) {
                        const interval = histogram.data.labels[index];
                        lastSelectedInterval = interval;
                        
                        // 更新柱狀圖顏色
                        histogram.data.datasets[0].backgroundColor = histogram.data.labels.map((_, i) => 
                            i === index ? 'rgba(255, 99, 132, 0.5)' : 'rgba(54, 162, 235, 0.5)'
                        );
                        histogram.update('none');
                        
                        // 更新學生列表
                        updateStudentList(interval, true);
                    }
                }
            });

            // 確保在頁面載入時立即更新圖表
            document.addEventListener('DOMContentLoaded', () => {
                updateDistributionCharts();
            });

            // 在 <script> 標籤中添加：
            function downloadStudentListCSV() {
                if (!window.currentStudentList || window.currentStudentList.length === 0) {
                    console.error('沒有可下載的學生數據');
                    return;
                }

                // 獲取當前的篩選條件
                const subject = document.getElementById('gradeDistSubject').value;
                const year = document.getElementById('gradeDistYear').value;
                
                // 準備 CSV 內容
                const headers = ['學年', '班級', '學號', '姓名', '平均分數'];
                const csvContent = [
                    headers.join(','),
                    ...window.currentStudentList.map(student => [
                        student.year,
                        student.class,
                        student.studentNumber,
                        student.name,
                        student.average.toFixed(1)
                    ].join(','))
                ].join('\\n');

                // 添加 BOM 以確保 Excel 正確顯示中文
                const BOM = '\\uFEFF';
                const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8' });
                
                // 創建下載連結
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                
                // 生成文件名
                let fileName = '學生成績列表';
                if (subject !== 'all') {
                    fileName += '_' + subject;
                }
                if (year !== 'all') {
                    fileName += '_' + year;
                }
                fileName += '_' + new Date().toISOString().slice(0, 10) + '.csv';
                
                link.download = fileName;
                
                // 觸發下載
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                // 釋放 URL 對象
                URL.revokeObjectURL(link.href);
            }

            // 初始化分數區間選擇器
            const scoreIntervalSelect = document.getElementById('scoreIntervalSelect');
            scoreIntervalSelect.addEventListener('change', function() {
                const selectedInterval = this.value;
                if (selectedInterval) {
                    // 更新圖表高亮
                    const index = histogram.data.labels.indexOf(selectedInterval);
                    if (index !== -1) {
                        lastSelectedInterval = selectedInterval;
                        histogram.data.datasets[0].backgroundColor = histogram.data.labels.map((_, i) => 
                            i === index ? 'rgba(255, 99, 132, 0.5)' : 'rgba(54, 162, 235, 0.5)'
                        );
                        histogram.update('none');
                    }
                    // 更新學生列表
                    updateStudentList(selectedInterval);
                } else {
                    // 重置圖表和學生列表
                    lastSelectedInterval = null;
                    histogram.data.datasets[0].backgroundColor = new Array(histogram.data.labels.length)
                        .fill('rgba(54, 162, 235, 0.5)');
                    histogram.update('none');
                    updateStudentList(null);
                }
            });

            // 修改直方圖點擊事件，同步更新下拉選單
            histogram.options.onClick = (event, elements) => {
                if (elements.length > 0) {
                    const index = elements[0].index;
                    const interval = histogram.data.labels[index];
                    
                    // 更新全局變量
                    lastSelectedInterval = interval;
                    
                    // 更新下拉選單
                    scoreIntervalSelect.value = interval;
                    
                    // 高亮顯示選中的柱狀
                    histogram.data.datasets[0].backgroundColor = histogram.data.labels.map((_, i) => 
                        i === index ? 'rgba(255, 99, 132, 0.5)' : 'rgba(54, 162, 235, 0.5)'
                    );
                    histogram.update('none');
                    
                    // 更新學生列表
                    updateStudentList(interval);
                }
            };

            // 修改更新圖表函數，同步更新下拉選單選項
            function updateDistributionCharts() {
                // ... 原有的更新邏輯 ...

                // 重置下拉選單
                scoreIntervalSelect.value = '';
                
                // 重置選中區間和學生列表
                lastSelectedInterval = null;
                updateStudentList(null);
            }

            // ... 其他代碼 ...
        </script>
    </body>
    </html>
    `;
    
    fs.writeFileSync('report.html', html, 'utf8');
}

/**
 * 主程序
 * 按順序執行所有操作
 */
async function main() {
    try {
        // 步驟 1: 載入班級和年級代號映射
        await loadClassCodeMap();
        await loadGradeCodeMap();
        // 步驟 2: 載入平均分資料
        await loadAverageScores();
        // 步驟 3: 載入學生資料
        await loadStudents();
        // 步驟 4: 載入科目資料
        await loadSubjects();
        // 步驟 5: 生成分析報告
        generateReport();
        console.log('報告已生成：report.html');
    } catch (error) {
        console.error('錯誤：', error);
    }
}

// 執行主程序（只需要執行一次）
main(); 