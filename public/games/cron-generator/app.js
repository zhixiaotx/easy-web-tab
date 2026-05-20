/**
 * Cron 表达式生成器 - 核心逻辑
 */

// ==================== 字段处理 ====================

/**
 * 获取字段值（处理下拉选择和自定义输入）
 */
function getFieldValue(field) {
    const select = document.getElementById(`cron-${field}`);
    const customInput = document.getElementById(`cron-${field}-custom`);
    
    if (!select) return '*';
    
    const value = select.value;
    
    if (value === 'custom' && customInput) {
        const customValue = customInput.value.trim();
        return customValue || '*';
    }
    
    return value;
}

/**
 * 处理字段变化（显示/隐藏自定义输入框）
 */
function onFieldChange(field) {
    const select = document.getElementById(`cron-${field}`);
    const customInput = document.getElementById(`cron-${field}-custom`);
    
    if (!select || !customInput) return;
    
    if (select.value === 'custom') {
        customInput.classList.add('visible');
        customInput.focus();
    } else {
        customInput.classList.remove('visible');
        customInput.value = '';
    }
    
    // 实时更新预览
    updatePreview();
}

// ==================== Cron 表达式生成 ====================

/**
 * 生成 Cron 表达式
 */
function generateCron() {
    const minute = getFieldValue('minute');
    const hour = getFieldValue('hour');
    const day = getFieldValue('day');
    const month = getFieldValue('month');
    const weekday = getFieldValue('weekday');
    
    return `${minute} ${hour} ${day} ${month} ${weekday}`;
}

/**
 * 更新表达式预览
 */
function updatePreview() {
    const expression = generateCron();
    const previewElement = document.getElementById('expression-preview');
    if (previewElement) {
        previewElement.textContent = expression;
    }
}

// ==================== Cron 验证 ====================

/**
 * 验证 Cron 表达式
 */
function validateCronExpression(expression) {
    if (!expression || !expression.trim()) {
        return { valid: false, message: 'Cron表达式不能为空' };
    }
    
    const trimmed = expression.trim();
    
    // 检查字段数量
    const parts = trimmed.split(/\s+/);
    if (parts.length !== 5) {
        return { valid: false, message: `Cron表达式应有5个字段，当前有${parts.length}个字段` };
    }
    
    // 验证每个字段的合法性
    const [minute, hour, day, month, weekday] = parts;
    
    // 验证分钟 (0-59)
    if (!isValidCronField(minute, 0, 59)) {
        return { valid: false, message: `分钟字段无效: ${minute} (有效范围: 0-59)` };
    }
    
    // 验证小时 (0-23)
    if (!isValidCronField(hour, 0, 23)) {
        return { valid: false, message: `小时字段无效: ${hour} (有效范围: 0-23)` };
    }
    
    // 验证日期 (1-31)
    if (!isValidCronField(day, 1, 31) && day !== 'L') {
        return { valid: false, message: `日期字段无效: ${day} (有效范围: 1-31 或 L)` };
    }
    
    // 验证月份 (1-12)
    if (!isValidCronField(month, 1, 12)) {
        return { valid: false, message: `月份字段无效: ${month} (有效范围: 1-12)` };
    }
    
    // 验证星期 (0-6)
    if (!isValidCronField(weekday, 0, 6) && !/^[0-6],L#$/.test(weekday)) {
        return { valid: false, message: `星期字段无效: ${weekday} (有效范围: 0-6)` };
    }
    
    // 验证通过
    return {
        valid: true,
        message: '验证通过',
        expression: trimmed,
        description: getCronDescription(trimmed),
        nextRuns: getNextExecutions(trimmed, 10)
    };
}

/**
 * 验证单个 Cron 字段
 */
function isValidCronField(value, min, max) {
    // * 表示任意值
    if (value === '*') return true;
    
    // */n 表示步长
    if (value.startsWith('*/')) {
        const step = parseInt(value.slice(2));
        return !isNaN(step) && step > 0 && step <= max;
    }
    
    // n-m 表示范围
    if (value.includes('-') && !value.includes(',')) {
        const [start, end] = value.split('-').map(Number);
        return !isNaN(start) && !isNaN(end) && start >= min && end <= max && start <= end;
    }
    
    // n,m,... 表示列表
    if (value.includes(',')) {
        const parts = value.split(',').map(Number);
        return parts.every(v => !isNaN(v) && v >= min && v <= max);
    }
    
    // 单个数字
    const num = parseInt(value);
    return !isNaN(num) && num >= min && num <= max;
}

// ==================== 人类可读描述 ====================

/**
 * 将 Cron 表达式转换为人类可读的中文描述
 */
function getCronDescription(expression) {
    const parts = expression.split(/\s+/);
    if (parts.length !== 5) return '无效的Cron表达式';
    
    const [minute, hour, day, month, weekday] = parts;
    
    const partsDesc = [];
    
    // 时间部分描述
    const timeDesc = getTimeDescription(minute, hour);
    if (timeDesc) {
        partsDesc.push(timeDesc);
    }
    
    // 日期部分描述
    const dateDesc = getDateDescription(day);
    if (dateDesc) {
        partsDesc.push(dateDesc);
    }
    
    // 月份部分描述
    const monthDesc = getMonthDescription(month);
    if (monthDesc) {
        partsDesc.push(monthDesc);
    }
    
    // 星期部分描述
    const weekdayDesc = getWeekdayDescription(weekday);
    if (weekdayDesc) {
        partsDesc.push(weekdayDesc);
    }
    
    if (partsDesc.length === 0) {
        return '每分钟执行';
    }
    
    return partsDesc.join('，');
}

/**
 * 获取时间描述
 */
function getTimeDescription(minute, hour) {
    // 每分钟
    if (minute === '*' && hour === '*') {
        return '每分钟';
    }
    
    // 每小时
    if (hour === '*' && minute !== '*') {
        if (minute.startsWith('*/')) {
            return `每${minute.slice(2)}分钟`;
        }
        return `每小时的第${minute}分钟`;
    }
    
    // 每隔N小时
    if (hour.startsWith('*/')) {
        const step = hour.slice(2);
        if (minute === '*') {
            return `每${step}小时的每分钟`;
        }
        return `每${step}小时的第${minute}分钟`;
    }
    
    // 具体时间
    if (!minute.startsWith('*/') && !hour.startsWith('*/')) {
        const hourNum = parseInt(hour);
        const minNum = parseInt(minute);
        
        if (!isNaN(hourNum) && !isNaN(minNum)) {
            const hourStr = hourNum.toString().padStart(2, '0');
            const minStr = minNum.toString().padStart(2, '0');
            return `在 ${hourStr}:${minStr}`;
        }
    }
    
    return '';
}

/**
 * 获取日期描述
 */
function getDateDescription(day) {
    if (day === '*') return '';
    
    if (day === 'L') {
        return '每月最后一天';
    }
    
    if (day.includes(',')) {
        const days = day.split(',').map(d => `${d}日`);
        return `在${days.join('、')}`;
    }
    
    if (day.includes('-')) {
        const [start, end] = day.split('-');
        return `在第${start}至${end}日`;
    }
    
    if (day.startsWith('*/')) {
        return `每隔${day.slice(2)}天`;
    }
    
    return `在第${day}日`;
}

/**
 * 获取月份描述
 */
function getMonthDescription(month) {
    if (month === '*') return '';
    
    const monthNames = ['', '1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
    
    if (month.includes(',')) {
        const months = month.split(',').map(m => monthNames[parseInt(m)] || `${m}月`);
        return `${months.join('、')}`;
    }
    
    if (month.includes('-')) {
        const [start, end] = month.split('-');
        return `${monthNames[parseInt(start)]}至${monthNames[parseInt(end)]}`;
    }
    
    if (month.startsWith('*/')) {
        return `每${month.slice(2)}个月`;
    }
    
    return `在${monthNames[parseInt(month)]}`;
}

/**
 * 获取星期描述
 */
function getWeekdayDescription(weekday) {
    if (weekday === '*') return '';
    
    const weekNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    
    if (weekday === '1-5') {
        return '工作日';
    }
    
    if (weekday === '0,6') {
        return '周末';
    }
    
    if (weekday.includes(',')) {
        const days = weekday.split(',').map(d => weekNames[parseInt(d)] || d);
        return days.join('和');
    }
    
    if (weekday.includes('-')) {
        const [start, end] = weekday.split('-');
        return `${weekNames[parseInt(start)]}至${weekNames[parseInt(end)]}`;
    }
    
    return `在${weekNames[parseInt(weekday)]}`;
}

// ==================== 未来执行时间计算 ====================

/**
 * 获取 Cron 表达式的未来执行时间
 */
function getNextExecutions(expression, count) {
    const results = [];
    const now = new Date();
    let current = new Date(now);
    
    // 解析 Cron 表达式
    const parts = expression.split(/\s+/);
    if (parts.length !== 5) {
        return ['无效的Cron表达式'];
    }
    
    const [minute, hour, day, month, weekday] = parts;
    
    // 计算未来N次执行时间
    for (let i = 0; i < count * 100; i++) {
        // 增加1分钟
        current = new Date(current.getTime() + 60000);
        
        // 检查是否匹配
        if (matchesCron(current, minute, hour, day, month, weekday)) {
            results.push(formatDateTime(current));
            if (results.length >= count) break;
        }
    }
    
    if (results.length === 0) {
        return ['无法计算未来执行时间'];
    }
    
    return results;
}

/**
 * 检查给定时间是否匹配 Cron 表达式
 */
function matchesCron(date, minute, hour, day, month, weekday) {
    const min = date.getMinutes();
    const hr = date.getHours();
    const d = date.getDate();
    const mon = date.getMonth() + 1;
    const wd = date.getDay();
    
    return (
        matchesField(min, minute, 0, 59) &&
        matchesField(hr, hour, 0, 23) &&
        matchesField(d, day, 1, 31) &&
        matchesField(mon, month, 1, 12) &&
        matchesField(wd, weekday, 0, 6)
    );
}

/**
 * 检查字段是否匹配
 */
function matchesField(value, pattern, min, max) {
    // * 表示任意值
    if (pattern === '*') return true;
    
    // */n 表示步长
    if (pattern.startsWith('*/')) {
        const step = parseInt(pattern.slice(2));
        return value % step === 0;
    }
    
    // n-m 表示范围
    if (pattern.includes('-') && !pattern.includes(',')) {
        const [start, end] = pattern.split('-').map(Number);
        return value >= start && value <= end;
    }
    if (pattern.includes('-')) {
        // 处理复杂的范围，如 1-5,10-15
        const parts = pattern.split(',');
        return parts.some(p => {
            if (p.includes('-')) {
                const [start, end] = p.split('-').map(Number);
                return value >= start && value <= end;
            }
            return value === parseInt(p);
        });
    }
    
    // n,m,... 表示列表
    if (pattern.includes(',')) {
        const values = pattern.split(',').map(Number);
        return values.includes(value);
    }
    
    // 单个数字
    return value === parseInt(pattern);
}

/**
 * 格式化日期时间
 */
function formatDateTime(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const weekDay = weekDays[date.getDay()];
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} (${weekDay})`;
}

// ==================== UI 交互 ====================

/**
 * 生成并显示详情
 */
function generateAndDisplay() {
    const expression = generateCron();
    
    // 构建结果 HTML
    const description = getCronDescription(expression);
    const nextRuns = getNextExecutions(expression, 10);
    
    let html = `
        <div class="result-section">
            <h3>生成的 Cron 表达式</h3>
            <div class="expression">${expression}</div>
        </div>
        <div class="result-section">
            <h3>执行描述</h3>
            <div class="description">${description}</div>
        </div>
        <div class="result-section">
            <h3>未来 10 次执行时间</h3>
            <div class="next-runs">
                ${nextRuns.map((run, i) => `<div class="run-item">${i + 1}. ${run}</div>`).join('')}
            </div>
        </div>
    `;
    
    const resultPanel = document.getElementById('result-panel');
    const resultContent = document.getElementById('result-content');
    
    resultContent.innerHTML = html;
    resultPanel.classList.add('show');
    
    // 滚动到结果区域
    resultPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * 验证表达式
 */
function validateExpression() {
    const input = document.getElementById('validate-input');
    const resultDiv = document.getElementById('validation-result');
    const expression = input.value.trim();
    
    if (!expression) {
        showToast('请输入Cron表达式', 'error');
        return;
    }
    
    const result = validateCronExpression(expression);
    
    resultDiv.style.display = 'block';
    
    if (result.valid) {
        resultDiv.className = 'validation-result valid';
        
        let html = `
            <div class="validation-message">✓ ${result.message}</div>
            <div class="validation-detail">
                <div class="detail-expression">${result.expression}</div>
                <div class="detail-description">${result.description}</div>
                <div class="detail-runs">
                    <h4>未来执行时间：</h4>
                    <ul>
                        ${result.nextRuns.slice(0, 5).map((run, i) => `<li>${i + 1}. ${run}</li>`).join('')}
                    </ul>
                </div>
            </div>
        `;
        
        resultDiv.innerHTML = html;
    } else {
        resultDiv.className = 'validation-result invalid';
        resultDiv.innerHTML = `<div class="validation-message">✗ ${result.message}</div>`;
    }
}

/**
 * 复制表达式
 */
function copyExpression() {
    const expression = generateCron();
    copyToClipboard(expression);
}

/**
 * 复制到剪贴板
 */
function copyToClipboard(text) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function() {
            showToast('复制成功', 'success');
        }, function() {
            showToast('复制失败', 'error');
        });
    } else {
        // 兼容旧浏览器
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('复制成功', 'success');
    }
}

/**
 * Toast 提示
 */
function showToast(message, type) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.style.display = 'block';
    
    setTimeout(function() {
        toast.style.display = 'none';
    }, 2000);
}

// 初始化 - 更新预览
document.addEventListener('DOMContentLoaded', function() {
    updatePreview();
    
    // 为所有自定义输入框添加实时更新
    const customInputs = document.querySelectorAll('.custom-input');
    customInputs.forEach(input => {
        input.addEventListener('input', updatePreview);
    });
});