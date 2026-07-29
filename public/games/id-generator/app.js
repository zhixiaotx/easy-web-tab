/**
 * 号码生成器 - 核心逻辑
 * 支持：身份证、组织机构代码、统一社会信用代码、银行卡、手机号、邮箱、IP、UUID
 */

// ==================== 工具函数 ====================

/**
 * 随机获取数组中的一个元素
 */
function randomFrom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * 随机整数 [min, max]
 */
function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 随机字符串（字母数字混合）
 */
function randomString(length) {
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

/**
 * 随机数字字符串
 */
function randomDigits(length) {
    let result = '';
    for (let i = 0; i < length; i++) {
        result += Math.floor(Math.random() * 10);
    }
    return result;
}

// ==================== 字符集常量 ====================
// GB 32100-2015 统一社会信用代码字符集（排除 I、O、S、V、Z）
const CREDIT_CODE_CHARS = '0123456789ABCDEFGHJKLMNPQRTUWXY';
// GB/T 11714 组织机构代码字符集（排除 I、O、S、V、Z，包含 L）
const ORG_CODE_CHARS = '0123456789ABCDEFGHJKLMNPQRTUWXY';
// ISO 7064 Mod 31,31 校验码字符集
const ISO7064_MOD31_CHARS = '0123456789ABCDEFGHJKLMNPQRTUWXY';

// GB 32100-2015 字符→值映射表（排除 I、O、S、V、Z 后的正确映射）
const CHAR_VALUE_MAP = {
    '0':0,'1':1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,
    'A':10,'B':11,'C':12,'D':13,'E':14,'F':15,'G':16,'H':17,
    'J':18,'K':19,'L':20,'M':21,'N':22,
    'P':23,'Q':24,'R':25,'T':26,'U':27,
    'W':28,'X':29,'Y':30
};

// ==================== 身份证号生成 ====================

// 中国行政区划代码（部分常见省份）
const idCardAreas = [
    '110000', '110101', '110102', '110105', '110106', '110107', '110108', '110109', // 北京市
    '120000', '120101', '120102', '120103', '120104', '120105', '120106', '120107', // 天津市
    '310000', '310101', '310103', '310104', '310105', '310106', '310107', '310109', // 上海市
    '320000', '320100', '320102', '320103', '320104', '320105', '320106', '320111', // 江苏省
    '330000', '330100', '330102', '330103', '330104', '330105', '330106', '330108', // 浙江省
    '440000', '440100', '440103', '440104', '440105', '440106', '440107', '440111', // 广东省
    '500000', '500101', '500102', '500103', '500104', '500105', '500106', '500107', // 重庆市
    '510000', '510100', '510102', '510103', '510104', '510105', '510106', '510107', // 四川省
];

// 省份和城市数据（行政区划代码）
const idCardRegions = {
    '11': { name: '北京市', cities: { '00': '北京市', '01': '市辖区', '02': '县' } },
    '12': { name: '天津市', cities: { '00': '天津市', '01': '市辖区', '02': '县' } },
    '31': { name: '上海市', cities: { '00': '上海市', '01': '市辖区', '02': '县' } },
    '32': { name: '江苏省', cities: { '01': '南京市', '02': '无锡市', '03': '徐州市', '04': '常州市', '05': '苏州市', '06': '南通市', '07': '连云港市', '08': '淮安市', '09': '盐城市', '10': '扬州市', '11': '镇江市', '12': '泰州市', '13': '宿迁市' } },
    '33': { name: '浙江省', cities: { '01': '杭州市', '02': '宁波市', '03': '温州市', '04': '嘉兴市', '05': '湖州市', '06': '绍兴市', '07': '金华市', '08': '衢州市', '09': '舟山市', '10': '台州市', '11': '丽水市' } },
    '44': { name: '广东省', cities: { '01': '广州市', '02': '韶关市', '03': '深圳市', '04': '珠海市', '05': '汕头市', '06': '佛山市', '07': '江门市', '08': '湛江市', '09': '茂名市', '10': '肇庆市', '11': '惠州市', '12': '梅州市', '13': '汕尾市', '14': '河源市', '15': '阳江市', '16': '清远市', '17': '东莞市', '18': '中山市', '19': '潮州市', '20': '揭阳市', '21': '云浮市' } },
    '50': { name: '重庆市', cities: { '00': '重庆市', '01': '万州区', '02': '涪陵区', '03': '渝中区', '04': '大渡口区', '05': '江北区', '06': '沙坪坝区', '07': '九龙坡区', '08': '南岸区', '09': '北碚区', '10': '渝北区' } },
    '51': { name: '四川省', cities: { '01': '成都市', '02': '自贡市', '03': '攀枝花市', '04': '泸州市', '05': '德阳市', '06': '绵阳市', '07': '广元市', '08': '遂宁市', '09': '内江市', '10': '乐山市', '11': '南充市', '12': '眉山市', '13': '宜宾市', '14': '广安市', '15': '达州市', '16': '雅安市', '17': '巴中市', '18': '资阳市', '19': '阿坝州', '20': '甘孜州', '21': '凉山州' } },
    '13': { name: '河北省', cities: { '01': '石家庄市', '02': '唐山市', '03': '秦皇岛市', '04': '邯郸市', '05': '邢台市', '06': '保定市', '07': '张家口市', '08': '承德市', '09': '沧州市', '10': '廊坊市', '11': '衡水市' } },
    '14': { name: '山西省', cities: { '01': '太原市', '02': '大同市', '03': '阳泉市', '04': '长治市', '05': '晋城市', '06': '朔州市', '07': '晋中市', '08': '运城市', '09': '忻州市', '10': '临汾市', '11': '吕梁市' } },
    '15': { name: '内蒙古', cities: { '01': '呼和浩特市', '02': '包头市', '03': '乌海市', '04': '赤峰市', '05': '通辽市', '06': '鄂尔多斯市', '07': '呼伦贝尔市', '08': '巴彦淖尔市', '09': '乌兰察布市', '10': '兴安盟', '11': '锡林郭勒盟', '12': '阿拉善盟' } },
    '21': { name: '辽宁省', cities: { '01': '沈阳市', '02': '大连市', '03': '鞍山市', '04': '抚顺市', '05': '本溪市', '06': '丹东市', '07': '锦州市', '08': '营口市', '09': '阜新市', '10': '辽阳市', '11': '盘锦市', '12': '铁岭市', '13': '朝阳市', '14': '葫芦岛市' } },
    '22': { name: '吉林省', cities: { '01': '长春市', '02': '吉林市', '03': '四平市', '04': '辽源市', '05': '通化市', '06': '白山市', '07': '松原市', '08': '白城市', '09': '延边州' } },
    '23': { name: '黑龙江省', cities: { '01': '哈尔滨市', '02': '齐齐哈尔市', '03': '鸡西市', '04': '鹤岗市', '05': '双鸭山市', '06': '大庆市', '07': '伊春市', '08': '佳木斯市', '09': '七台河市', '10': '牡丹江市', '11': '黑河市', '12': '绥化市', '13': '大兴安岭' } },
    '34': { name: '安徽省', cities: { '01': '合肥市', '02': '芜湖市', '03': '蚌埠市', '04': '淮南市', '05': '马鞍山市', '06': '淮北市', '07': '铜陵市', '08': '安庆市', '09': '黄山市', '10': '滁州市', '11': '阜阳市', '12': '宿州市', '13': '六安市', '14': '亳州市', '15': '池州市', '16': '宣城市' } },
    '35': { name: '福建省', cities: { '01': '福州市', '02': '厦门市', '03': '莆田市', '04': '三明市', '05': '泉州市', '06': '漳州市', '07': '南平市', '08': '龙岩市', '09': '宁德市' } },
    '36': { name: '江西省', cities: { '01': '南昌市', '02': '景德镇市', '03': '萍乡市', '04': '九江市', '05': '新余市', '06': '鹰潭市', '07': '赣州市', '08': '吉安市', '09': '宜春市', '10': '抚州市', '11': '上饶市' } },
    '37': { name: '山东省', cities: { '01': '济南市', '02': '青岛市', '03': '淄博市', '04': '枣庄市', '05': '东营市', '06': '烟台市', '07': '潍坊市', '08': '济宁市', '09': '泰安市', '10': '威海市', '11': '日照市', '12': '莱芜市', '13': '临沂市', '14': '德州市', '15': '聊城市', '16': '滨州市', '17': '菏泽市' } },
    '41': { name: '河南省', cities: { '01': '郑州市', '02': '开封市', '03': '洛阳市', '04': '平顶山市', '05': '安阳市', '06': '鹤壁市', '07': '新乡市', '08': '焦作市', '09': '濮阳市', '10': '许昌市', '11': '漯河市', '12': '三门峡市', '13': '南阳市', '14': '商丘市', '15': '信阳市', '16': '周口市', '17': '驻马店市', '18': '济源市' } },
    '42': { name: '湖北省', cities: { '01': '武汉市', '02': '黄石市', '03': '十堰市', '04': '宜昌市', '05': '襄阳市', '06': '鄂州市', '07': '荆门市', '08': '孝感市', '09': '荆州市', '10': '黄冈市', '11': '咸宁市', '12': '随州市', '13': '恩施州', '14': '仙桃市', '15': '潜江市', '16': '天门市', '17': '神农架' } },
    '43': { name: '湖南省', cities: { '01': '长沙市', '02': '株洲市', '03': '湘潭市', '04': '衡阳市', '05': '邵阳市', '06': '岳阳市', '07': '常德市', '08': '张家界市', '09': '益阳市', '10': '郴州市', '11': '永州市', '12': '怀化市', '13': '娄底市', '14': '湘西州' } },
    '45': { name: '广西', cities: { '01': '南宁市', '02': '柳州市', '03': '桂林市', '04': '梧州市', '05': '北海市', '06': '防城港市', '07': '钦州市', '08': '贵港市', '09': '玉林市', '10': '百色市', '11': '贺州市', '12': '河池市', '13': '来宾市', '14': '崇左市' } },
    '46': { name: '海南省', cities: { '01': '海口市', '02': '三亚市', '03': '三沙市', '04': '儋州市', '05': '五指山市', '06': '琼海市', '07': '文昌市', '08': '万宁市', '09': '东方市', '10': '定安县', '11': '屯昌县', '12': '澄迈县', '13': '临高县', '14': '白沙县', '15': '昌江县', '16': '乐东县', '17': '陵水县', '18': '保亭县', '19': '琼中县' } },
    '52': { name: '贵州省', cities: { '01': '贵阳市', '02': '六盘水市', '03': '遵义市', '04': '安顺市', '05': '毕节市', '06': '铜仁市', '07': '黔西南州', '08': '黔东南州', '09': '黔南州' } },
    '53': { name: '云南省', cities: { '01': '昆明市', '02': '曲靖市', '03': '玉溪市', '04': '保山市', '05': '昭通市', '06': '丽江市', '07': '普洱市', '08': '临沧市', '09': '楚雄州', '10': '红河州', '11': '文山州', '12': '西双版纳州', '13': '大理州', '14': '德宏州', '15': '怒江州', '16': '迪庆州' } },
    '54': { name: '西藏', cities: { '01': '拉萨市', '02': '日喀则市', '03': '昌都市', '04': '林芝市', '05': '山南市', '06': '那曲市', '07': '阿里地区' } },
    '61': { name: '陕西省', cities: { '01': '西安市', '02': '铜川市', '03': '宝鸡市', '04': '咸阳市', '05': '渭南市', '06': '延安市', '07': '汉中市', '08': '榆林市', '09': '安康市', '10': '商洛市' } },
    '62': { name: '甘肃省', cities: { '01': '兰州市', '02': '嘉峪关市', '03': '金昌市', '04': '白银市', '05': '天水市', '06': '武威市', '07': '张掖市', '08': '平凉市', '09': '酒泉市', '10': '庆阳市', '11': '定西市', '12': '陇南市', '13': '临夏州', '14': '甘南州' } },
    '63': { name: '青海省', cities: { '01': '西宁市', '02': '海东市', '03': '海北州', '04': '黄南州', '05': '海南州', '06': '果洛州', '07': '玉树州', '08': '海西州' } },
    '64': { name: '宁夏', cities: { '01': '银川市', '02': '石嘴山市', '03': '吴忠市', '04': '固原市', '05': '中卫市' } },
    '65': { name: '新疆', cities: { '01': '乌鲁木齐市', '02': '克拉玛依市', '03': '吐鲁番市', '04': '哈密市', '05': '昌吉州', '06': '博尔塔拉州', '07': '巴音郭楞州', '08': '阿克苏地区', '09': '克孜勒苏州', '10': '喀什地区', '11': '和田地区', '12': '伊犁州', '13': '塔城地区', '14': '阿勒泰地区' } },
};

// 初始化省份选择框
function initProvinceSelect() {
    const provinceSelect = document.getElementById('idcard-province');
    if (!provinceSelect) return;
    
    // 按字母顺序排列省份代码
    const provinceCodes = Object.keys(idCardRegions).sort();
    
    provinceCodes.forEach(code => {
        const option = document.createElement('option');
        option.value = code;
        option.textContent = idCardRegions[code].name;
        provinceSelect.appendChild(option);
    });
}

// 省份变更时更新城市选择框
function onProvinceChange() {
    const provinceSelect = document.getElementById('idcard-province');
    const citySelect = document.getElementById('idcard-city');
    const provinceCode = provinceSelect.value;
    
    // 清空城市选择框
    citySelect.innerHTML = '<option value="">随机</option>';
    
    if (!provinceCode) {
        citySelect.disabled = true;
        return;
    }
    
    // 启用城市选择框
    citySelect.disabled = false;
    
    // 填充城市选项
    const cities = idCardRegions[provinceCode].cities;
    Object.keys(cities).forEach(code => {
        const option = document.createElement('option');
        option.value = code;
        option.textContent = cities[code];
        citySelect.appendChild(option);
    });
}

/**
 * 获取指定年月对应的天数
 */
function getDaysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
}

/**
 * 从 idCardAreas 中查找指定省份/城市对应的真实区县代码
 */
function getRealDistrict(provinceCode, cityCode) {
    const prefix = provinceCode + cityCode;
    const matching = idCardAreas.filter(code => code.startsWith(prefix) && code.length === 6);
    if (matching.length > 0) {
        return randomFrom(matching).substring(4, 6);
    }
    // 无匹配时随机生成2位数字（仍可满足格式校验）
    return randomDigits(2);
}

/**
 * 从 idCardAreas 中随机选取一个有效的 6 位行政区划代码
 */
function getRandomAreaCode() {
    const validAreas = idCardAreas.filter(code => code.length === 6 && !code.endsWith('0000'));
    if (validAreas.length > 0) {
        return randomFrom(validAreas);
    }
    // 保底：随机选取省份+城市+区县
    const provinceCodes = Object.keys(idCardRegions);
    const randomProvince = randomFrom(provinceCodes);
    const cities = idCardRegions[randomProvince].cities;
    const cityCodes = Object.keys(cities);
    const randomCity = randomFrom(cityCodes);
    const district = randomDigits(2);
    return randomProvince + randomCity + district;
}

// 根据选择生成身份证号
function getSelectedAreaCode() {
    const provinceSelect = document.getElementById('idcard-province');
    const citySelect = document.getElementById('idcard-city');
    
    // 处理元素不存在的情况
    if (!provinceSelect || !citySelect) {
        return getRandomAreaCode();
    }
    
    const provinceCode = provinceSelect.value;
    const cityCode = citySelect.value;
    
    if (!provinceCode) {
        return getRandomAreaCode();
    }
    
    if (!cityCode) {
        // 选择了省份但没有选择城市，随机选择城市
        const cities = idCardRegions[provinceCode].cities;
        const cityCodes = Object.keys(cities);
        const randomCity = randomFrom(cityCodes);
        const district = getRealDistrict(provinceCode, randomCity);
        return provinceCode + randomCity + district;
    }
    
    // 使用真实区县代码
    const district = getRealDistrict(provinceCode, cityCode);
    return provinceCode + cityCode + district;
}

/**
 * ISO 7064 Mod 11,2 校验码计算（GB 11643-1999标准）
 * 公式：S = Σ(ai * Wi)，校验码 = (11 - (S % 11)) % 11，结果为10时用X表示
 */
function iso7064Mod112(body17) {
    const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
    const checkCodes = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'X'];
    
    let sum = 0;
    for (let i = 0; i < 17; i++) {
        sum += parseInt(body17[i]) * weights[i];
    }
    
    // 正确公式：(11 - (sum % 11)) % 11，结果为10时索引10对应'X'
    const checkIndex = (11 - (sum % 11)) % 11;
    return checkCodes[checkIndex];
}

/**
 * 生成身份证号
 * @param {string} genderPreference - 性别偏好: '1'=男, '0'=女, ''或undefined=随机
 * @param {string} agePreference - 年龄偏好: '18-25','26-35','36-45','46-55','56-65','65+',''=随机
 */
function generateIdCard(genderPreference, agePreference) {
    const area = getSelectedAreaCode();
    const currentYear = new Date().getFullYear();
    
    // 根据年龄范围推导出生年份
    let yearMin, yearMax;
    if (agePreference === '18-25') {
        yearMin = currentYear - 25;
        yearMax = currentYear - 18;
    } else if (agePreference === '26-35') {
        yearMin = currentYear - 35;
        yearMax = currentYear - 26;
    } else if (agePreference === '36-45') {
        yearMin = currentYear - 45;
        yearMax = currentYear - 36;
    } else if (agePreference === '46-55') {
        yearMin = currentYear - 55;
        yearMax = currentYear - 46;
    } else if (agePreference === '56-65') {
        yearMin = currentYear - 65;
        yearMax = currentYear - 56;
    } else if (agePreference === '65+') {
        yearMin = currentYear - 80;
        yearMax = currentYear - 65;
    } else {
        // 随机：18-70岁
        yearMin = currentYear - 70;
        yearMax = currentYear - 18;
    }
    
    const year = randomInt(yearMin, yearMax);
    const month = randomInt(1, 12).toString().padStart(2, '0');
    const maxDay = getDaysInMonth(year, parseInt(month));
    const day = randomInt(1, maxDay).toString().padStart(2, '0');
    const birthday = `${year}${month}${day}`;
    
    // 顺序码 000-999，第3位（索引16）决定性别：奇数=男，偶数=女
    let sequence;
    if (genderPreference === '1') {
        // 男：确保顺序码第3位为奇数
        const prefix = randomDigits(2);
        const lastDigit = randomInt(1, 5) * 2 - 1; // 1,3,5,7,9
        sequence = prefix + lastDigit;
    } else if (genderPreference === '0') {
        // 女：确保顺序码第3位为偶数
        const prefix = randomDigits(2);
        const lastDigit = randomInt(0, 4) * 2; // 0,2,4,6,8
        sequence = prefix + lastDigit;
    } else {
        // 随机
        sequence = randomDigits(3);
    }
    
    // 前17位
    const body17 = area + birthday + sequence;
    
    // 计算校验码
    const checkCode = iso7064Mod112(body17);
    
    return area + birthday + sequence + checkCode;
}

/**
 * 验证身份证号
 */
function validateIdCard(idCard) {
    if (!idCard || idCard.length !== 18) {
        return { valid: false, message: '身份证号应为18位' };
    }
    
    const pattern = /^[1-9]\d{5}(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dX]$/;
    if (!pattern.test(idCard)) {
        return { valid: false, message: '格式不正确' };
    }
    
    const body17 = idCard.substring(0, 17);
    const checkCode = idCard.charAt(17).toUpperCase();
    const calculatedCode = iso7064Mod112(body17);
    
    if (checkCode !== calculatedCode) {
        return { valid: false, message: '校验码错误' };
    }
    
    return { valid: true, message: '验证通过' };
}

// ==================== 组织机构代码生成 ====================

/**
 * GB/T 11714 校验码计算
 * 校验码为 10 时用 X 表示
 */
function gb11714Check(code8) {
    const weights = [3, 7, 9, 10, 5, 8, 4, 2];
    let sum = 0;
    
    for (let i = 0; i < 8; i++) {
        const char = code8[i].toUpperCase();
        sum += (CHAR_VALUE_MAP[char] || 0) * weights[i];
    }
    
    const remainder = (11 - (sum % 11)) % 11;
    return remainder === 10 ? 'X' : remainder.toString();
}

/**
 * 生成组织机构代码
 */
function generateOrgCode() {
    let body = '';
    for (let i = 0; i < 8; i++) {
        body += randomFrom(ORG_CODE_CHARS.split(''));
    }
    
    const checkCode = gb11714Check(body);
    
    // 检查是否需要带分隔符
    const withHyphen = document.getElementById('orgcode-with-hyphen');
    if (withHyphen && withHyphen.checked) {
        return body + '-' + checkCode;
    }
    
    return body + checkCode;
}

/**
 * 验证组织机构代码（支持带/不带分隔符）
 */
function validateOrgCode(code) {
    if (!code) {
        return { valid: false, message: '组织机构代码不能为空' };
    }
    
    // 去除分隔符
    const cleanCode = code.replace('-', '');
    
    // 检查长度（去除分隔符后应为9位）
    if (cleanCode.length !== 9) {
        return { valid: false, message: '组织机构代码应为9位' };
    }
    
    const pattern = /^[0-9A-HJ-NP-RT-UW-Y]{8}[0-9A-HJ-NP-RT-UW-Y]$/;
    if (!pattern.test(cleanCode)) {
        return { valid: false, message: '格式不正确（只能包含数字和大写字母，不含I、O、S、V、Z）' };
    }
    
    const body8 = cleanCode.substring(0, 8);
    const checkCode = cleanCode.charAt(8).toUpperCase();
    const calculatedCode = gb11714Check(body8);
    
    if (checkCode !== calculatedCode) {
        return { valid: false, message: '校验码错误' };
    }
    
    return { valid: true, message: '验证通过' };
}

// ==================== 统一社会信用代码生成 ====================

// 登记管理部门代码
const regAdminCodes = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * ISO 7064 Mod 31,31 校验码计算
 */
function iso7064Mod3131(code17) {
    const weights = [1, 3, 9, 27, 19, 26, 16, 17, 20, 29, 25, 13, 8, 24, 10, 30, 28];
    
    let sum = 0;
    for (let i = 0; i < 17; i++) {
        const char = code17[i].toUpperCase();
        sum += (CHAR_VALUE_MAP[char] || 0) * weights[i];
    }
    
    const remainder = sum % 31;
    const checkIndex = (31 - remainder) % 31;
    return ISO7064_MOD31_CHARS[checkIndex];
}

/**
 * 生成统一社会信用代码
 */
function generateCreditCode() {
    const regAdmin = randomFrom(regAdminCodes);
    const orgType = randomFrom(CREDIT_CODE_CHARS.split(''));
    
    // 地区代码（6位，使用身份证地区代码）
    const area = getSelectedAreaCode().substring(0, 6);
    
    // 主体标识（9位，生成组织机构代码并去除分隔符）
    let orgCode = generateOrgCodeRaw();
    // 去除可能存在的分隔符
    orgCode = orgCode.replace('-', '');
    // 确保是9位
    if (orgCode.length > 9) orgCode = orgCode.substring(0, 9);
    const mainId = orgCode;
    
    // 组合前17位
    const body17 = regAdmin + orgType + area + mainId;
    
    // 计算校验码
    const checkCode = iso7064Mod3131(body17);
    
    return body17 + checkCode;
}

/**
 * 生成纯组织机构代码（不带分隔符，供内部使用）
 */
function generateOrgCodeRaw() {
    let body = '';
    for (let i = 0; i < 8; i++) {
        body += randomFrom(ORG_CODE_CHARS.split(''));
    }
    
    const checkCode = gb11714Check(body);
    return body + checkCode;
}

/**
 * 验证统一社会信用代码
 */
function validateCreditCode(code) {
    if (!code || code.length !== 18) {
        return { valid: false, message: '统一社会信用代码应为18位' };
    }
    
    // 统一社会信用代码格式：1位登记管理部门 + 1位机构类别 + 6位地区 + 9位主体标识 + 1位校验码
    // 登记管理部门(1位): 0-9
    // 机构类别(1位): 0-9 或 A-Z(排除I,O,S,V)
    // 地区代码(6位): 数字
    // 主体标识(9位): 数字或字母
    // 校验码(1位): 0-9或X
    
    const pattern = /^[0-9][0-9A-HJ-NP-RT-UW-Y][0-9]{6}[0-9A-HJ-NP-RT-UW-Y]{9}[0-9A-HJ-NP-RT-UW-Y]$/i;
    if (!pattern.test(code)) {
        return { valid: false, message: '格式不正确（只能包含数字和大写字母，不含I、O、S、V、Z）' };
    }
    
    const body17 = code.substring(0, 17).toUpperCase();
    const checkCode = code.charAt(17).toUpperCase();
    const calculatedCode = iso7064Mod3131(body17);
    
    if (checkCode !== calculatedCode) {
        return { valid: false, message: '校验码错误' };
    }
    
    return { valid: true, message: '验证通过' };
}

// ==================== 银行卡号生成 ====================

// 常见银行卡发卡行标识（部分）
const bankCardPrefixes = [
    '622202', // 工商银行
    '622848', // 农业银行
    '622998', // 招商银行
    '622309', // 交通银行
    '621700', // 建设银行
    '622260', // 民生银行
    '622588', // 招商银行一卡通
    '621098', // 邮政储蓄
    '621483', // 招商银行
    '621771', // 民生银行
];

/**
 * Luhn算法校验码计算
 */
function luhnCheck(cardNumWithoutCheck) {
    let sum = 0;
    let isEven = false;
    
    for (let i = cardNumWithoutCheck.length - 1; i >= 0; i--) {
        let digit = parseInt(cardNumWithoutCheck[i]);
        
        if (isEven) {
            digit *= 2;
            if (digit > 9) {
                digit -= 9;
            }
        }
        
        sum += digit;
        isEven = !isEven;
    }
    
    return (10 - (sum % 10)) % 10;
}

/**
 * 生成银行卡号
 */
function generateBankCard() {
    const prefix = randomFrom(bankCardPrefixes);
    const length = randomInt(16, 19);
    const accountLength = length - prefix.length - 1;
    const account = randomDigits(accountLength);
    const cardNumWithoutCheck = prefix + account;
    const checkCode = luhnCheck(cardNumWithoutCheck);
    
    return cardNumWithoutCheck + checkCode;
}

/**
 * 验证银行卡号
 */
function validateBankCard(cardNum) {
    if (!cardNum || cardNum.length < 13 || cardNum.length > 19) {
        return { valid: false, message: '银行卡号应为13-19位' };
    }
    
    if (!/^\d+$/.test(cardNum)) {
        return { valid: false, message: '只能包含数字' };
    }
    
    const calculatedCheck = luhnCheck(cardNum.substring(0, cardNum.length - 1));
    const actualCheck = parseInt(cardNum.charAt(cardNum.length - 1));
    
    if (calculatedCheck !== actualCheck) {
        return { valid: false, message: '校验码错误' };
    }
    
    return { valid: true, message: '验证通过' };
}

// ==================== 手机号码生成 ====================

// 常见手机号段（移动、联通、电信）
const phonePrefixes = [
    // 移动
    '134', '135', '136', '137', '138', '139',
    '147', '150', '151', '152', '157', '158', '159',
    '172', '178', '188', '195',
    // 联通
    '130', '131', '132', '145', '155', '156', '166', '175', '176', '185', '186',
    // 电信
    '133', '149', '153', '173', '177', '180', '181', '189', '191', '193', '199',
];

/**
 * 生成手机号码
 */
function generatePhone() {
    const prefix = randomFrom(phonePrefixes);
    const suffix = randomDigits(8);
    return prefix + suffix;
}

/**
 * 验证手机号码
 */
function validatePhone(phone) {
    if (!phone || phone.length !== 11) {
        return { valid: false, message: '手机号应为11位' };
    }
    
    const pattern = /^1[3-9]\d{9}$/;
    if (!pattern.test(phone)) {
        return { valid: false, message: '格式不正确' };
    }
    
    return { valid: true, message: '验证通过' };
}

// ==================== 邮箱生成 ====================

const emailDomains = [
    'qq.com', '163.com', '126.com', 'gmail.com', 'outlook.com',
    'hotmail.com', 'sina.com', 'sohu.com', 'yahoo.com', 'foxmail.com',
    'aliyun.com', '139.com', '189.cn', 'wo.cn', 'eastmail.com'
];

/**
 * 生成邮箱
 * @param {string} domainPreference - 指定邮箱域，为空时随机
 */
function generateEmail(domainPreference) {
    let domain;
    if (domainPreference && emailDomains.includes(domainPreference)) {
        domain = domainPreference;
    } else {
        domain = randomFrom(emailDomains);
    }
    
    // QQ邮箱需要是纯数字的QQ号（5-11位）
    if (domain === 'qq.com' || domain === 'foxmail.com') {
        const qqLength = randomInt(5, 11);
        const qqNumber = randomDigits(qqLength);
        return `${qqNumber}@${domain}`;
    }
    
    // 其他邮箱使用字母数字混合
    const prefixLength = randomInt(6, 12);
    const prefix = randomString(prefixLength);
    return `${prefix}@${domain}`;
}

/**
 * 验证邮箱
 */
function validateEmail(email) {
    if (!email) {
        return { valid: false, message: '邮箱不能为空' };
    }
    
    const pattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!pattern.test(email)) {
        return { valid: false, message: '格式不正确' };
    }
    
    return { valid: true, message: '验证通过' };
}

// ==================== IP地址生成 ====================

/**
 * 生成IP地址（支持指定前缀）
 * @param {string} prefix - 可选的IP前缀，如 "10.5" 或 "10.5.106"
 */
function generateIP(prefix) {
    // 如果没有前缀，则随机选择私网地址段
    if (!prefix || prefix.trim() === '') {
        const range = randomInt(1, 3);
        let ip;
        
        switch (range) {
            case 1: // 10.0.0.0 - 10.255.255.255
                ip = `10.${randomInt(0, 255)}.${randomInt(0, 255)}.${randomInt(1, 254)}`;
                break;
            case 2: // 172.16.0.0 - 172.31.255.255
                ip = `172.${randomInt(16, 31)}.${randomInt(0, 255)}.${randomInt(1, 254)}`;
                break;
            case 3: // 192.168.0.0 - 192.168.255.255
                ip = `192.168.${randomInt(0, 255)}.${randomInt(1, 254)}`;
                break;
        }
        
        return ip;
    }
    
    // 解析前缀
    const parts = prefix.trim().split('.').filter(p => p !== '');
    
    if (parts.length === 0) {
        return generateIP('');
    }
    
    // 验证前缀格式（只能包含数字，且0-255）
    for (const part of parts) {
        if (!/^\d+$/.test(part) || parseInt(part) < 0 || parseInt(part) > 255) {
            // 前缀格式无效，回退到随机生成
            return generateIP('');
        }
    }
    
    // 根据前缀长度生成IP
    const prefixLen = parts.length;
    let ip = parts.join('.');
    
    switch (prefixLen) {
        case 1:
            // 如 "10" -> 10.x.x.x
            ip += `.${randomInt(0, 255)}.${randomInt(0, 255)}.${randomInt(1, 254)}`;
            break;
        case 2:
            // 如 "10.5" -> 10.5.x.x
            ip += `.${randomInt(0, 255)}.${randomInt(1, 254)}`;
            break;
        case 3:
            // 如 "10.5.106" -> 10.5.106.x
            ip += `.${randomInt(1, 254)}`;
            break;
        default:
            // 超过3段，回退到随机生成
            return generateIP('');
    }
    
    return ip;
}

/**
 * 验证IP地址
 */
function validateIP(ip) {
    if (!ip) {
        return { valid: false, message: 'IP地址不能为空' };
    }
    
    const pattern = /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
    if (!pattern.test(ip)) {
        return { valid: false, message: '格式不正确' };
    }
    
    const parts = ip.split('.').map(Number);
    for (const part of parts) {
        if (part < 0 || part > 255) {
            return { valid: false, message: '数值超出范围0-255' };
        }
    }
    
    return { valid: true, message: '验证通过' };
}

// ==================== UUID生成 ====================

/**
 * 生成UUID v4
 */
function generateUUID() {
    const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
    // 不带-的32位格式
    const uuidNoDash = uuid.replace(/-/g, '');
    return { uuid: uuid, uuidNoDash: uuidNoDash };
}

/**
 * 验证UUID
 */
function validateUUID(uuid) {
    if (!uuid) {
        return { valid: false, message: 'UUID不能为空' };
    }
    
    const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!pattern.test(uuid)) {
        return { valid: false, message: '格式不正确' };
    }
    
    return { valid: true, message: '验证通过' };
}

// ==================== 批量生成 ====================

/**
 * 批量生成号码
 */
function batchGenerate(type, count) {
    const results = [];
    
    for (let i = 0; i < count; i++) {
        let value;
        switch (type) {
            case 'idcard': value = generateIdCard(); break;
            case 'orgcode': value = generateOrgCode(); break;
            case 'creditcode': value = generateCreditCode(); break;
            case 'bankcard': value = generateBankCard(); break;
            case 'phone': value = generatePhone(); break;
            case 'email': value = generateEmail(); break;
            case 'ip': value = generateIP(); break;
            case 'uuid': value = generateUUID(); break;
        }
        results.push(value);
    }
    
    return results;
}

// ==================== UI交互函数 ====================

// 存储当前生成的批量结果
let currentBatchResults = [];

// Tab切换
document.addEventListener('DOMContentLoaded', function() {
    // 初始化省份选择框
    initProvinceSelect();
    
    // 初始化时间戳默认为当前时间
    const tsDatetime = document.getElementById('ts-datetime');
    if (tsDatetime) {
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        tsDatetime.value = now.toISOString().slice(0, 16);
    }
    
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanels = document.querySelectorAll('.tab-panel');
    
    tabBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const tabId = this.dataset.tab;
            
            // 更新按钮状态
            tabBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            // 更新面板显示
            tabPanels.forEach(panel => {
                panel.classList.remove('active');
                if (panel.id === `panel-${tabId}`) {
                    panel.classList.add('active');
                }
            });
            
            // 隐藏批量结果区
            document.getElementById('batchResultSection').style.display = 'none';
        });
    });
    
    // 更新生成数量显示
    const generateCountInput = document.getElementById('generateCount');
    const infoCount = document.getElementById('infoCount');
    generateCountInput.addEventListener('input', function() {
        let val = parseInt(this.value) || 1;
        val = Math.max(1, Math.min(1000, val));
        this.value = val;
        infoCount.textContent = val;
    });
});

// 获取当前激活的Tab类型
function getCurrentTabType() {
    const activeBtn = document.querySelector('.tab-btn.active');
    return activeBtn ? activeBtn.dataset.tab : 'idcard';
}

// 生成并显示结果
function displayResult(value) {
    const type = getCurrentTabType();
    const resultDisplay = document.getElementById(`result-${type}`);
    
    if (resultDisplay) {
        resultDisplay.innerHTML = value;
        
        // 隐藏批量结果区
        document.getElementById('batchResultSection').style.display = 'none';
    }
}

// 生成按钮处理 - 调用核心生成函数
function handleGenerateIdCard() {
    const count = parseInt(document.getElementById('generateCount').value) || 1;
    const genderSelect = document.getElementById('idcard-gender');
    const gender = genderSelect ? genderSelect.value : '';
    const ageSelect = document.getElementById('idcard-age');
    const age = ageSelect ? ageSelect.value : '';
    
    if (count === 1) {
        const value = generateIdCard(gender, age);
        displayResult(value);
    } else {
        currentBatchResults = [];
        for (let i = 0; i < count; i++) {
            currentBatchResults.push(generateIdCard(gender, age));
        }
        showBatchResults(currentBatchResults);
    }
}

function handleGenerateOrgCode() {
    const count = parseInt(document.getElementById('generateCount').value) || 1;
    
    if (count === 1) {
        const value = generateOrgCode();
        displayResult(value);
    } else {
        currentBatchResults = batchGenerate('orgcode', count);
        showBatchResults(currentBatchResults);
    }
}

function handleGenerateCreditCode() {
    const count = parseInt(document.getElementById('generateCount').value) || 1;
    
    if (count === 1) {
        const value = generateCreditCode();
        displayResult(value);
    } else {
        currentBatchResults = batchGenerate('creditcode', count);
        showBatchResults(currentBatchResults);
    }
}

function handleGenerateBankCard() {
    const count = parseInt(document.getElementById('generateCount').value) || 1;
    
    if (count === 1) {
        const value = generateBankCard();
        displayResult(value);
    } else {
        currentBatchResults = batchGenerate('bankcard', count);
        showBatchResults(currentBatchResults);
    }
}

function handleGeneratePhone() {
    const count = parseInt(document.getElementById('generateCount').value) || 1;
    
    if (count === 1) {
        const value = generatePhone();
        displayResult(value);
    } else {
        currentBatchResults = batchGenerate('phone', count);
        showBatchResults(currentBatchResults);
    }
}

function handleGenerateEmail() {
    const count = parseInt(document.getElementById('generateCount').value) || 1;
    const emailTypeSelect = document.getElementById('email-type');
    const domain = emailTypeSelect ? emailTypeSelect.value : '';
    
    if (count === 1) {
        const value = generateEmail(domain);
        displayResult(value);
    } else {
        currentBatchResults = [];
        for (let i = 0; i < count; i++) {
            currentBatchResults.push(generateEmail(domain));
        }
        showBatchResults(currentBatchResults);
    }
}

function handleGenerateIP() {
    const count = parseInt(document.getElementById('generateCount').value) || 1;
    const prefixInput = document.getElementById('ip-prefix');
    const prefix = prefixInput ? prefixInput.value.trim() : '';
    
    if (count === 1) {
        const value = generateIP(prefix);
        displayResult(value);
    } else {
        currentBatchResults = [];
        for (let i = 0; i < count; i++) {
            currentBatchResults.push(generateIP(prefix));
        }
        showBatchResults(currentBatchResults);
    }
}

function handleGenerateUUID() {
    const count = parseInt(document.getElementById('generateCount').value) || 1;
    const type = getCurrentTabType();
    
    if (count === 1) {
        const result = generateUUID();
        // UUID特殊显示：两行，分别带-和不带-
        const uuidEscaped = result.uuid.replace(/'/g, "\\'");
        const uuidNoDashEscaped = result.uuidNoDash.replace(/'/g, "\\'");
        const html = `<div class="uuid-result">
            <div class="uuid-line"><span class="label">带-：</span><span class="value">${result.uuid}</span><button class="btn-copy" onclick="copyToClipboard('${uuidEscaped}')">复制</button></div>
            <div class="uuid-line"><span class="label">32位：</span><span class="value">${result.uuidNoDash}</span><button class="btn-copy" onclick="copyToClipboard('${uuidNoDashEscaped}')">复制</button></div>
        </div>`;
        const resultDisplay = document.getElementById(`result-${type}`);
        if (resultDisplay) {
            resultDisplay.innerHTML = html;
            document.getElementById('batchResultSection').style.display = 'none';
        }
    } else {
        currentBatchResults = batchGenerate('uuid', count);
        showBatchResultsUUID(currentBatchResults);
    }
}

function showBatchResultsUUID(results) {
    const batchSection = document.getElementById('batchResultSection');
    const batchList = document.getElementById('batchList');
    
    batchList.innerHTML = results.map((item, index) => {
        const uuidEscaped = item.uuid.replace(/'/g, "\\'");
        const uuidNoDashEscaped = item.uuidNoDash.replace(/'/g, "\\'");
        return `<div class="batch-item">
            <div class="batch-index">${index + 1}</div>
            <div class="batch-value">
                <div class="uuid-line"><span class="label">带-：</span><span class="value">${item.uuid}</span><button class="btn-copy" onclick="copyToClipboard('${uuidEscaped}')">复制</button></div>
                <div class="uuid-line"><span class="label">32位：</span><span class="value">${item.uuidNoDash}</span><button class="btn-copy" onclick="copyToClipboard('${uuidNoDashEscaped}')">复制</button></div>
            </div>
        </div>`;
    }).join('');
    
    batchSection.style.display = 'block';
}

// 显示批量结果
function showBatchResults(results) {
    const batchSection = document.getElementById('batchResultSection');
    const batchList = document.getElementById('batchList');
    
    batchList.innerHTML = results.map((value, index) => `
        <div class="batch-item">
            <input type="checkbox" id="batch-item-${index}" checked>
            <span class="number">${value}</span>
            <button class="btn btn-small" onclick="copySingle('${value}')">复制</button>
        </div>
    `).join('');
    
    batchSection.style.display = 'block';
    
    // 隐藏单条结果区
    const type = getCurrentTabType();
    document.getElementById(`result-${type}`).innerHTML = '<span class="placeholder">批量生成中...</span>';
}

// 复制功能
function copyResult(type) {
    const resultDisplay = document.getElementById(`result-${type}`);
    
    if (!resultDisplay) return;
    
    let value;
    
    // Cron 类型特殊处理：只复制表达式
    if (type === 'cron') {
        const exprEl = resultDisplay.querySelector('.cron-expression');
        value = exprEl ? exprEl.textContent.trim() : '';
    } else {
        value = resultDisplay.textContent.trim();
    }
    
    if (value && value !== '点击生成按钮获取号码' && value !== '点击生成按钮获取Cron表达式') {
        copyToClipboard(value);
    }
}

function copySingle(value) {
    copyToClipboard(value);
}

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

function copySelected() {
    const checkboxes = document.querySelectorAll('.batch-item input[type="checkbox"]:checked');
    const values = Array.from(checkboxes).map(cb => {
        const item = cb.closest('.batch-item');
        return item ? item.querySelector('.number').textContent : '';
    }).filter(v => v);
    
    if (values.length > 0) {
        copyToClipboard(values.join('\n'));
    } else {
        showToast('请选择要复制的内容', 'error');
    }
}

// 导出功能
function exportTxt() {
    if (currentBatchResults.length === 0) {
        showToast('没有可导出的内容', 'error');
        return;
    }
    
    const content = currentBatchResults.join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${getCurrentTabType()}_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('导出成功', 'success');
}

// 全选/反选
function selectAll() {
    const checkboxes = document.querySelectorAll('.batch-item input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = true);
}

function selectInverse() {
    const checkboxes = document.querySelectorAll('.batch-item input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = !cb.checked);
}

// 验证功能
function validateInput(type) {
    const validationArea = document.getElementById(`validation-${type}`);
    validationArea.style.display = validationArea.style.display === 'none' ? 'block' : 'none';
}

function doValidate(type) {
    const input = document.getElementById(`validate-${type}-input`);
    const resultDiv = document.getElementById(`validate-result-${type}`);
    const value = input.value.trim();
    
    let result;
    switch (type) {
        case 'idcard': result = validateIdCard(value); break;
        case 'orgcode': result = validateOrgCode(value); break;
        case 'creditcode': result = validateCreditCode(value); break;
        case 'bankcard': result = validateBankCard(value); break;
        case 'phone': result = validatePhone(value); break;
        case 'email': result = validateEmail(value); break;
        case 'ip': result = validateIP(value); break;
        case 'uuid': result = validateUUID(value); break;
        case 'timestamp': result = convertTimestamp(value); break;
        case 'cron': result = validateCron(value); break;
    }
    
    if (result) {
        // Cron 类型特殊处理：显示更详细的信息
        if (type === 'cron' && result.valid && result.expression) {
            let html = `<div class="cron-validation-result">`;
            html += `<div class="validation-message valid">${result.message}</div>`;
            html += `<div class="cron-expression-display">${result.expression}</div>`;
            html += `<div class="cron-description-display">${result.description || ''}</div>`;
            if (result.nextRuns && result.nextRuns.length > 0) {
                html += `<div class="next-runs-preview"><h4>未来执行时间：</h4><ul>`;
                result.nextRuns.slice(0, 5).forEach((run, i) => {
                    html += `<li>${i + 1}. ${run}</li>`;
                });
                html += `</ul></div>`;
            }
            html += `</div>`;
            resultDiv.innerHTML = html;
            resultDiv.className = `validation-result valid`;
        } else {
            resultDiv.className = `validation-result ${result.valid ? 'valid' : 'invalid'}`;
            resultDiv.textContent = result.message;
        }
    }
}

// 更新验证输入框字符数
function updateCharCount(type) {
    const input = document.getElementById(`validate-${type}-input`);
    const countSpan = document.getElementById(`char-count-${type}`);
    if (input && countSpan) {
        countSpan.textContent = input.value.length + '字符';
    }
}

// Toast提示
function showToast(message, type) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.style.display = 'block';
    
    setTimeout(function() {
        toast.style.display = 'none';
    }, 2000);
}

// ==================== 时间戳生成 ====================

/**
 * 生成Unix时间戳（秒）
 */
function generateTimestamp() {
    const datetimeInput = document.getElementById('ts-datetime');
    if (datetimeInput && datetimeInput.value) {
        const date = new Date(datetimeInput.value);
        return Math.floor(date.getTime() / 1000);
    }
    // 默认返回当前时间戳
    return Math.floor(Date.now() / 1000);
}

/**
 * 转换时间戳或日期时间
 */
function convertTimestamp(value) {
    const trimmed = value.trim();
    
    // 尝试解析为时间戳（纯数字）
    if (/^\d+$/.test(trimmed)) {
        const ts = parseInt(trimmed);
        // 判断是秒还是毫秒
        const ms = ts > 9999999999 ? ts : ts * 1000;
        const date = new Date(ms);
        if (!isNaN(date.getTime())) {
            return { 
                valid: true, 
                message: date.toLocaleString('zh-CN') + ' (UTC ' + date.toUTCString() + ')' 
            };
        }
    }
    
    // 尝试解析为日期时间字符串
    const date = new Date(trimmed);
    if (!isNaN(date.getTime())) {
        const ts = Math.floor(date.getTime() / 1000);
        return { 
            valid: true, 
            message: 'Unix时间戳: ' + ts + ' (秒)' 
        };
    }
    
    return { valid: false, message: '无法解析，请输入有效的时间戳（数字）或日期时间字符串' };
}

/**
 * 处理时间戳生成按钮点击
 */
function handleGenerateTimestamp() {
    const value = generateTimestamp();
    displayResult(value);
}

// ==================== Cron 表达式生成 ====================

/**
 * 获取 Cron 字段值（处理下拉选择和自定义输入）
 */
function getCronFieldValue(field) {
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
 * 处理 Cron 字段变化（显示/隐藏自定义输入框）
 */
function onCronFieldChange(field) {
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
}

/**
 * 生成 Cron 表达式
 */
function generateCron() {
    const minute = getCronFieldValue('minute');
    const hour = getCronFieldValue('hour');
    const day = getCronFieldValue('day');
    const month = getCronFieldValue('month');
    const weekday = getCronFieldValue('weekday');
    
    return `${minute} ${hour} ${day} ${month} ${weekday}`;
}

/**
 * 验证 Cron 表达式
 */
function validateCron(expression) {
    if (!expression || !expression.trim()) {
        return { valid: false, message: 'Cron表达式不能为空' };
    }
    
    const trimmed = expression.trim();
    
    // 语法检查：5个字段
    const parts = trimmed.split(/\s+/);
    if (parts.length !== 5) {
        return { valid: false, message: 'Cron表达式应有5个字段（分钟 小时 日期 月份 星期）' };
    }
    
    // 使用 cron-parser 验证
    try {
        if (typeof cronParser !== 'undefined') {
            const interval = cronParser.parseExpression(trimmed);
            const next = interval.next();
            
            // 验证通过，生成描述
            const description = getCronDescription(trimmed);
            
            return {
                valid: true,
                message: '验证通过',
                expression: trimmed,
                description: description,
                nextRuns: getNextRuns(trimmed, 10)
            };
        } else {
            // 如果 cron-parser 未加载，进行基本验证
            return basicCronValidation(trimmed);
        }
    } catch (error) {
        return { valid: false, message: 'Cron表达式无效: ' + error.message };
    }
}

/**
 * 基本 Cron 验证（当 cron-parser 不可用时）
 */
function basicCronValidation(expression) {
    const parts = expression.split(/\s+/);
    if (parts.length !== 5) {
        return { valid: false, message: '应有5个字段' };
    }
    
    const patterns = [
        /^(\*|(\*\/[1-9]\d*)|(\d+(-\d+)?(,\d+(-\d+)?)*))$/, // 分钟: 0-59
        /^(\*|(\*\/[1-9]\d*)|(\d+(-\d+)?(,\d+(-\d+)?)*))$/, // 小时: 0-23
        /^(\*|(\*\/[1-9]\d*)|(\d+(-\d+)?(,\d+(-\d+)?)*))$/, // 日期: 1-31
        /^(\*|(\*\/[1-9]\d*)|(\d+(-\d+)?(,\d+(-\d+)?)*))$/, // 月份: 1-12
        /^(\*|(\*\/[1-9]\d*)|(\d+(-\d+)?(,\d+(-\d+)?)*))$/  // 星期: 0-6
    ];
    
    const fieldNames = ['分钟', '小时', '日期', '月份', '星期'];
    
    for (let i = 0; i < 5; i++) {
        if (!patterns[i].test(parts[i])) {
            return { valid: false, message: `${fieldNames[i]}字段格式不正确` };
        }
    }
    
    return {
        valid: true,
        message: '基本验证通过（详细解析需要加载cron-parser）',
        expression: expression,
        description: getCronDescription(expression)
    };
}

/**
 * 将 Cron 表达式转换为人类可读描述
 */
function getCronDescription(expression) {
    const parts = expression.split(/\s+/);
    if (parts.length !== 5) return '无效的Cron表达式';
    
    const [minute, hour, day, month, weekday] = parts;
    
    const descriptions = [];
    
    // 月份描述
    if (month === '*') {
        descriptions.push('每月');
    } else if (month.includes(',')) {
        const monthNames = ['', '1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
        const months = month.split(',').map(m => monthNames[parseInt(m)] || m + '月');
        descriptions.push(`在${months.join('、')}`);
    } else if (month.includes('-')) {
        const [start, end] = month.split('-');
        const monthNames = ['', '1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
        descriptions.push(`在${monthNames[parseInt(start)]}至${monthNames[parseInt(end)]}`);
    } else if (month.startsWith('*/')) {
        descriptions.push(`每${month.slice(2)}个月`);
    } else {
        const monthNames = ['', '1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
        descriptions.push(`在${monthNames[parseInt(month)]}`);
    }
    
    // 日期描述
    if (day === '*') {
        descriptions.push('每天');
    } else if (day.includes(',')) {
        descriptions.push(`在第${day.split(',').join('日和第')}日`);
    } else if (day.includes('-')) {
        const [start, end] = day.split('-');
        descriptions.push(`在第${start}至${end}日`);
    } else if (day.startsWith('*/')) {
        descriptions.push(`每${day.slice(2)}天`);
    } else {
        descriptions.push(`在第${day}日`);
    }
    
    // 星期描述
    if (weekday !== '*') {
        const weekNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        if (weekday === '1-5') {
            descriptions.push('工作日');
        } else if (weekday === '0,6') {
            descriptions.push('周末');
        } else if (weekday.includes(',')) {
            const days = weekday.split(',').map(d => weekNames[parseInt(d)] || d);
            descriptions.push(days.join('和'));
        } else if (weekday.includes('-')) {
            const [start, end] = weekday.split('-');
            descriptions.push(`${weekNames[parseInt(start)]}至${weekNames[parseInt(end)]}`);
        } else {
            descriptions.push(weekNames[parseInt(weekday)]);
        }
    }
    
    // 时间描述
    let timeDesc = '';
    if (hour === '*' && minute === '*') {
        timeDesc = '每分钟';
    } else if (hour === '*') {
        timeDesc = `在${minute}分`;
    } else if (minute === '*') {
        timeDesc = `${hour}点的每分钟`;
    } else if (minute.startsWith('*/')) {
        timeDesc = `每${minute.slice(2)}分钟`;
    } else if (hour.startsWith('*/')) {
        timeDesc = `每${hour.slice(2)}小时`;
    } else {
        timeDesc = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
    }
    
    // 组合最终描述
    let result = '';
    if (timeDesc.includes(':')) {
        result = `在${timeDesc}`;
    } else {
        result = timeDesc;
    }
    
    // 插入时间描述到合适位置
    if (descriptions.length > 0) {
        result = descriptions.join('的') + '的' + timeDesc;
    }
    
    return result || expression;
}

/**
 * 获取 Cron 表达式的未来执行时间
 */
function getNextRuns(expression, count) {
    const results = [];
    
    try {
        if (typeof cronParser !== 'undefined') {
            const interval = cronParser.parseExpression(expression);
            
            for (let i = 0; i < count; i++) {
                const next = interval.next();
                results.push(formatDateTime(next));
            }
        } else {
            // 如果 cron-parser 未加载，返回提示
            results.push('（需要加载 cron-parser 库）');
        }
    } catch (error) {
        results.push('计算失败: ' + error.message);
    }
    
    return results;
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
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * 处理 Cron 生成按钮点击
 */
function handleGenerateCron() {
    const expression = generateCron();
    
    // 构建结果 HTML
    let resultHtml = `<div class="cron-result-info">
        <div class="cron-expression">${expression}</div>
        <div class="cron-description">${getCronDescription(expression)}</div>
        <div class="next-runs">
            <h4>未来10次执行时间：</h4>
            <ul>`;
    
    const nextRuns = getNextRuns(expression, 10);
    nextRuns.forEach((run, index) => {
        resultHtml += `<li>${index + 1}. ${run}</li>`;
    });
    
    resultHtml += `</ul>
        </div>
    </div>`;
    
    const type = 'cron';
    const resultDisplay = document.getElementById(`result-${type}`);
    if (resultDisplay) {
        resultDisplay.innerHTML = resultHtml;
        document.getElementById('batchResultSection').style.display = 'none';
    }
}

// ==================== 自检测试 ====================
// 生成100个各类型号码并验证自洽性，在控制台输出结果
(function selfTest() {
    const testCases = [
        { name: '身份证号', gen: () => generateIdCard(), validate: validateIdCard },
        { name: '组织机构代码', gen: () => generateOrgCode(), validate: (v) => validateOrgCode(v) },
        { name: '统一社会信用代码', gen: () => generateCreditCode(), validate: validateCreditCode },
        { name: '银行卡号', gen: () => generateBankCard(), validate: validateBankCard },
        { name: '手机号码', gen: () => generatePhone(), validate: validatePhone },
        { name: '邮箱', gen: () => generateEmail(), validate: validateEmail },
        { name: 'IP地址', gen: () => generateIP(), validate: validateIP },
        { name: 'UUID', gen: () => generateUUID().uuid, validate: validateUUID },
    ];
    
    const SAMPLE_COUNT = 100;
    let allPassed = true;
    
    testCases.forEach(tc => {
        let passed = 0;
        let failed = 0;
        for (let i = 0; i < SAMPLE_COUNT; i++) {
            try {
                const value = tc.gen();
                const result = tc.validate(value);
                if (result.valid) {
                    passed++;
                } else {
                    failed++;
                    if (failed <= 3) {
                        console.error(`[${tc.name}] FAIL: ${value} → ${result.message}`);
                    }
                }
            } catch (e) {
                failed++;
                if (failed <= 3) {
                    console.error(`[${tc.name}] ERROR: ${e.message}`);
                }
            }
        }
        const status = failed === 0 ? '✅ PASS' : '❌ FAIL';
        console.log(`${status} [${tc.name}] ${passed}/${SAMPLE_COUNT} 通过, ${failed} 失败`);
        if (failed > 0) allPassed = false;
    });
    
    console.log(allPassed ? '\n✅ 所有类型全部通过自检！' : '\n❌ 存在未通过的类型！');
})();
