/**
 * 舒尔特方格 - 核心逻辑
 */

// 游戏状态
const state = {
    gridSize: 5,
    mode: 'number',
    isPlaying: false,
    currentNumber: 1,
    totalNumbers: 25,
    errors: 0,
    startTime: 0,
    timerInterval: null,
    history: [],
    letters: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
};

// DOM 元素
const elements = {
    gridSize: document.getElementById('gridSize'),
    gameMode: document.getElementById('gameMode'),
    timer: document.getElementById('timer'),
    currentNum: document.getElementById('currentNum'),
    errors: document.getElementById('errors'),
    gridContainer: document.getElementById('gridContainer'),
    startBtn: document.getElementById('startBtn'),
    resetBtn: document.getElementById('resetBtn'),
    resultsSection: document.getElementById('resultsSection'),
    resultTime: document.getElementById('resultTime'),
    resultErrors: document.getElementById('resultErrors'),
    resultRating: document.getElementById('resultRating'),
    resultBadge: document.getElementById('resultBadge'),
    historyList: document.getElementById('historyList'),
    clearHistory: document.getElementById('clearHistory'),
    infoBar: document.getElementById('infoBar')
};

// 初始化
function init() {
    loadHistory();
    setupEventListeners();
    renderGrid();
    updateHistoryDisplay();
}

// 事件监听
function setupEventListeners() {
    elements.gridSize.addEventListener('change', (e) => {
        state.gridSize = parseInt(e.target.value);
        state.totalNumbers = state.gridSize * state.gridSize;
        renderGrid();
        resetGame();
    });

    elements.gameMode.addEventListener('change', (e) => {
        state.mode = e.target.value;
        renderGrid();
        resetGame();
    });

    elements.startBtn.addEventListener('click', startGame);
    elements.resetBtn.addEventListener('click', resetGame);
    elements.clearHistory.addEventListener('click', clearHistory);
}

// 生成随机方格
function generateGrid(size, mode) {
    const total = size * size;
    let items;

    if (mode === 'letter') {
        // 字母模式
        items = state.letters.substring(0, total).split('');
    } else if (mode === 'reverse') {
        // 反向模式 - 从大到小
        items = Array.from({ length: total }, (_, i) => total - i);
    } else {
        // 数字模式（默认）
        items = Array.from({ length: total }, (_, i) => i + 1);
    }

    // Fisher-Yates 洗牌
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
    }

    // 转换为二维数组
    const grid = [];
    for (let i = 0; i < size; i++) {
        grid.push(items.slice(i * size, (i + 1) * size));
    }

    return grid;
}

// 渲染方格
function renderGrid() {
    const grid = generateGrid(state.gridSize, state.mode);
    elements.gridContainer.style.gridTemplateColumns = `repeat(${state.gridSize}, 1fr)`;
    elements.gridContainer.innerHTML = '';

    grid.forEach((row, rowIndex) => {
        row.forEach((value, colIndex) => {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            cell.textContent = value;
            cell.dataset.row = rowIndex;
            cell.dataset.col = colIndex;
            cell.dataset.value = value;
            cell.addEventListener('click', handleCellClick);
            elements.gridContainer.appendChild(cell);
        });
    });
}

// 处理点击
function handleCellClick(e) {
    if (!state.isPlaying) return;

    const cell = e.target;
    const value = parseInt(cell.dataset.value) || cell.dataset.value;
    const expected = state.mode === 'reverse' 
        ? (state.totalNumbers - state.currentNumber + 1)
        : state.currentNumber;

    // 判断点击是否正确
    let isCorrect = false;
    if (state.mode === 'letter') {
        const currentLetter = state.letters[state.currentNumber - 1];
        isCorrect = value === currentLetter;
    } else {
        isCorrect = value === expected;
    }

    if (isCorrect) {
        // 正确点击
        cell.classList.add('correct', 'pop');
        setTimeout(() => cell.classList.remove('pop'), 300);
        
        // 更新当前数字
        state.currentNumber++;
        updateCurrentDisplay();
        
        // 检查是否完成
        if (state.currentNumber > state.totalNumbers) {
            endGame();
        }
    } else {
        // 错误点击
        state.errors++;
        cell.classList.add('wrong');
        setTimeout(() => cell.classList.remove('wrong'), 300);
        updateErrorsDisplay();
    }
}

// 高亮当前需要点击的数字
function highlightCurrent() {
    const cells = document.querySelectorAll('.grid-cell');
    cells.forEach(cell => {
        cell.classList.remove('current');
        const value = parseInt(cell.dataset.value) || cell.dataset.value;
        
        let targetValue;
        if (state.mode === 'letter') {
            targetValue = state.letters[state.currentNumber - 1];
        } else if (state.mode === 'reverse') {
            targetValue = state.totalNumbers - state.currentNumber + 1;
        } else {
            targetValue = state.currentNumber;
        }
        
        if (value === targetValue) {
            cell.classList.add('current');
        }
    });
}

// 开始游戏
function startGame() {
    // 如果游戏正在进行中，不执行
    if (state.isPlaying) return;
    
    // 每次开始都重置方格，避免作弊
    renderGrid();
    
    state.isPlaying = true;
    state.currentNumber = 1;
    state.errors = 0;
    state.startTime = Date.now();
    
    // 隐藏infoBar（后台计时，不显示）
    elements.infoBar.style.display = 'none';
    
    // 不隐藏resultsSection，保留上次成绩
    
    // 更新按钮状态
    elements.startBtn.textContent = '进行中...';
    elements.startBtn.disabled = true;
    
    // 重置显示
    updateCurrentDisplay();
    updateErrorsDisplay();
    
    // 启动计时器
    state.timerInterval = setInterval(updateTimer, 10);
}

// 结束游戏
function endGame() {
    state.isPlaying = false;
    clearInterval(state.timerInterval);
    
    const elapsed = Date.now() - state.startTime;
    const timeStr = formatTime(elapsed);
    
    // 显示结果
    showResults(timeStr, state.errors, elapsed);
    
    // 保存历史记录
    saveHistory(timeStr, state.errors, elapsed);
    
    // 更新按钮
    elements.startBtn.textContent = '开始训练';
    elements.startBtn.disabled = false;
}

// 重置游戏
function resetGame() {
    state.isPlaying = false;
    state.currentNumber = 1;
    state.errors = 0;
    clearInterval(state.timerInterval);
    
    // 隐藏infoBar
    elements.infoBar.style.display = 'none';
    
    // 重置显示
    elements.timer.textContent = '00:00.000';
    elements.currentNum.textContent = '0';
    elements.errors.textContent = '0';
    elements.startBtn.textContent = '开始训练';
    elements.startBtn.disabled = false;
    // 不隐藏resultsSection，保留成绩
    
    // 重新渲染方格
    renderGrid();
}

// 显示结果
function showResults(time, errors, elapsedMs) {
    elements.resultTime.textContent = time;
    elements.resultErrors.textContent = errors;
    
    // 计算评级
    const rating = getRating(elapsedMs, errors);
    elements.resultRating.textContent = rating.label;
    elements.resultRating.style.color = rating.color;
    
    // 显示徽章
    if (rating.badge) {
        elements.resultBadge.textContent = rating.badge;
        elements.resultBadge.className = `badge ${rating.badgeClass}`;
        elements.resultBadge.style.display = 'inline-block';
    } else {
        elements.resultBadge.style.display = 'none';
    }
    
    elements.resultsSection.style.display = 'block';
    elements.resultsSection.scrollIntoView({ behavior: 'smooth' });
}

// 获取评级
function getRating(elapsedMs, errors) {
    const seconds = elapsedMs / 1000;
    const baseScore = seconds + errors * 2;
    
    // 5×5方格评级标准
    const standards = {
        '5': { excellent: 12, good: 20, average: 30 },
        '4': { excellent: 8, good: 15, average: 22 },
        '3': { excellent: 5, good: 10, average: 15 },
        '6': { excellent: 20, good: 35, average: 50 },
        '7': { excellent: 30, good: 50, average: 70 },
        '10': { excellent: 60, good: 90, average: 120 }
    };
    
    const std = standards[state.gridSize.toString()] || standards['5'];
    
    if (seconds <= std.excellent && errors === 0) {
        return { 
            label: '卓越', 
            color: '#fbbf24',
            badge: '🏆 金牌',
            badgeClass: 'gold'
        };
    } else if (seconds <= std.excellent) {
        return { 
            label: '优秀', 
            color: '#10b981',
            badge: '🥇 金牌',
            badgeClass: 'gold'
        };
    } else if (seconds <= std.good) {
        return { 
            label: '良好', 
            color: '#6366f1',
            badge: '🥈 银牌',
            badgeClass: 'silver'
        };
    } else if (seconds <= std.average) {
        return { 
            label: '中等', 
            color: '#8b5cf6' 
        };
    } else {
        return { 
            label: '加油', 
            color: '#94a3b8' 
        };
    }
}

// 计时器更新
function updateTimer() {
    const elapsed = Date.now() - state.startTime;
    elements.timer.textContent = formatTime(elapsed);
}

// 格式化时间
function formatTime(ms) {
    const totalSeconds = ms / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const milliseconds = Math.floor(ms % 1000);
    
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
}

// 更新当前数字显示
function updateCurrentDisplay() {
    if (state.mode === 'letter') {
        elements.currentNum.textContent = state.currentNumber > state.totalNumbers 
            ? '完成' 
            : state.letters[state.currentNumber - 1];
    } else {
        elements.currentNum.textContent = state.currentNumber > state.totalNumbers 
            ? '完成' 
            : state.currentNumber;
    }
}

// 更新错误显示
function updateErrorsDisplay() {
    elements.errors.textContent = state.errors;
}

// 历史记录 - 保存
function saveHistory(time, errors, elapsedMs) {
    const record = {
        time,
        errors,
        elapsed: elapsedMs,
        size: state.gridSize,
        mode: state.mode,
        date: new Date().toISOString()
    };
    
    state.history.unshift(record);
    
    // 最多保存50条
    if (state.history.length > 50) {
        state.history = state.history.slice(0, 50);
    }
    
    localStorage.setItem('schulte-history', JSON.stringify(state.history));
    updateHistoryDisplay();
}

// 历史记录 - 加载
function loadHistory() {
    const saved = localStorage.getItem('schulte-history');
    if (saved) {
        try {
            state.history = JSON.parse(saved);
        } catch (e) {
            state.history = [];
        }
    }
}

// 历史记录 - 显示
function updateHistoryDisplay() {
    if (state.history.length === 0) {
        elements.historyList.innerHTML = '<div class="history-empty">暂无训练记录</div>';
        return;
    }
    
    elements.historyList.innerHTML = state.history.map((record, index) => `
        <div class="history-item">
            <div class="history-info">
                <span class="history-size">${record.size}×${record.size}</span>
                <span class="history-time">${record.time}</span>
            </div>
            <span class="history-errors">${record.errors}次错误</span>
        </div>
    `).join('');
}

// 历史记录 - 清空
function clearHistory() {
    if (confirm('确定要清空所有历史记录吗？')) {
        state.history = [];
        localStorage.removeItem('schulte-history');
        updateHistoryDisplay();
    }
}

// 启动
document.addEventListener('DOMContentLoaded', init);