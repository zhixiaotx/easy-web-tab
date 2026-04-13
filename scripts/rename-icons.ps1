# 重命名脚本 - 将中文文件名改为英文
$iconDir = "D:\IDEA\easyWebTab\public\icons"

# 中文到英文的映射 (唯一键)
$mappings = @{
    "中国天气网.svg" = "weather-china.svg"
    "丰田.svg" = "toyota.svg"
    "本田.svg" = "honda.svg"
    "比亚迪.svg" = "byd.svg"
    "日产.svg" = "nissan.svg"
    "福特.svg" = "ford.svg"
    "法拉利.svg" = "ferrari.svg"
    "兰博基尼.svg" = "lamborghini.svg"
    "奔驰.svg" = "mercedes.svg"
    "宝马.svg" = "bmw.svg"
    "奥迪.svg" = "audi.svg"
    "广汽乘用车.svg" = "gac-motor.svg"
    "京东.ico" = "jd.ico"
    "天猫.svg" = "tmall.svg"
    "淘宝.svg" = "taobao.svg"
    "咸鱼.svg" = "xianyu.svg"
    "美团.ico" = "meituan.ico"
    "美团.svg" = "meituan.svg"
    "小红书.ico" = "xiaohongshu.ico"
    "小红书.svg" = "xiaohongshu.svg"
    "抖音.svg" = "douyin.svg"
    "快手.svg" = "kuaishou.svg"
    "高德地图.ico" = "amap.ico"
    "携程.ico" = "ctrip.ico"
    "携程.svg" = "ctrip.svg"
    "12306.svg" = "12306.svg"
    "天气网.ico" = "weather-com-cn.ico"
    "哔哩哔哩.ico" = "bilibili.ico"
    "腾讯视频.svg" = "tencent-video.svg"
    "网易云音乐.ico" = "163-music.ico"
    "QQ音乐.svg" = "qq-music.svg"
    "今日头条.ico" = "toutiao.ico"
    "微信.svg" = "wechat.svg"
    "微信方.svg" = "wechat-square.svg"
    "豆瓣.ico" = "douban.ico"
    "豆瓣.svg" = "douban.svg"
    "飞书.ico" = "feishu.ico"
    "邮箱.svg" = "email.svg"
    "支付宝.ico" = "alipay.ico"
    "支付宝.svg" = "alipay.svg"
    "百度一下_你就知道.ico" = "baidu.ico"
    "百度云盘.svg" = "baidu-cloud.svg"
    "阿里云.ico" = "aliyun.ico"
    "阿里云.svg" = "aliyun.svg"
    "阿里云官方-中文LOGO.svg" = "aliyun-logo.svg"
    "阿里云盘.svg" = "aliyun-drive.svg"
    "开源中国.ico" = "oschina.ico"
    "码云_gitee_.ico" = "gitee.ico"
    "智联招聘.ico" = "zhaopin.ico"
    "链家.ico" = "lianjia.ico"
    "华为商城.ico" = "vmall.ico"
    "小米.svg" = "xiaomi.svg"
    "小米商城.ico" = "mi-mall.ico"
    "高伟达LOGO.svg" = "git-logo.svg"
    "高伟达邮箱.ico" = "git-mail.ico"
    "c语言中文网.ico" = "biancheng.ico"
    "xxl开源项目.ico" = "xxl-job.ico"
    "人民网.ico" = "people-com-cn.ico"
    "人民网.svg" = "people-com-cn.svg"
    "智谱.svg" = "zhipu.svg"
    "计划生育服务站.svg" = "family-planning.svg"
    "硅基流动.svg" = "siliconflow.svg"
    "魔搭GPT.svg" = "modelscope.svg"
    "360 (1).svg" = "360-1.svg"
    "alimail 阿里邮箱.svg" = "alimail.svg"
    "豆包 (1).svg" = "doubao-1.svg"
    "豆包.svg" = "doubao.svg"
    "淘宝闪购.ico" = "eleme.ico"
    "WPS账号.svg" = "wps-account.svg"
    "QQ邮箱.svg" = "qq-mail.svg"
    "迅雷.ico" = "xunlei.ico"
}

Write-Host "Starting rename..."
Write-Host "Total mappings: $($mappings.Count)"

foreach ($oldName in $mappings.Keys) {
    $newName = $mappings[$oldName]
    $oldPath = Join-Path $iconDir $oldName
    $newPath = Join-Path $iconDir $newName
    
    if (Test-Path $oldPath) {
        if (-not (Test-Path $newPath)) {
            Rename-Item -Path $oldPath -NewName $newName -Force
            Write-Host "Renamed: $oldName -> $newName"
        } else {
            Write-Host "SKIP (exists): $newName"
        }
    } else {
        Write-Host "NOT FOUND: $oldName"
    }
}

Write-Host "Done!"
