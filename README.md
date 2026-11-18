# 晚安打卡 · 早睡搭子（多人在线版）

柔和紫色月亮主题的多人早睡打卡 Web 应用。用户无需邮箱/密码，通过 Supabase Anonymous Auth 获得匿名身份；创建者生成 6 位邀请码，朋友输入昵称和邀请码即可加入。房间成员、每日打卡和奖励记录通过 Supabase 数据库与 Realtime 同步。

## 技术栈

- React 18 + Vite
- Supabase Auth（Anonymous Sign-In）
- Supabase Postgres + Row Level Security
- Supabase Realtime（Postgres Changes）
- Vercel（静态站点托管）

## 功能

- 匿名身份，无需邮箱、密码和注册表单
- 创建房间、6 位邀请码、加入房间
- 房主设置房间目标入睡时间
- 每位成员每天独立打卡；按房间目标时间 + 15 分钟宽限计算达标
- 房间成员今晚状态实时刷新
- 个人连续达标、历史打卡、近 7 天趋势
- 房间排行榜、30 天挑战进度
- 连续 30 天解锁抽奖（4% / 22% / 74% 奖项概率）
- 睡前仪式交互（呼吸提示、放下手机、准备睡觉）；白噪音 UI 状态开关
- 用户数据持久化在 Supabase；匿名身份保存在当前浏览器

## 重要限制与产品说明

1. **匿名账号与设备绑定**：匿名身份保存在当前浏览器的 Supabase session 中。清除浏览器数据、换浏览器或换设备后，无法凭昵称恢复原账号。昵称不是登录凭证。请不要将房间邀请码当作密码。
2. **房间列表**：本版本每个匿名身份同一时刻按 UI 取最近加入的一个房间；数据库允许用户加入多个房间，但当前界面尚未提供房间切换器。
3. **提醒**：网页关闭后浏览器不能保证准时触发提醒；请配合系统闹钟。网页内保存提醒时间仅用于保存偏好。
4. **实时**：房间成员/打卡/房间设置/抽奖记录通过 Realtime 更新；如果浏览器断线，会在重新连接/重新载入时重新拉取。
5. **奖励**：概率奖励仅用于朋友间的娱乐约定，不会自动支付或转账。
6. **挑战**：30 天抽奖按连续达标日计算；房主重新开启挑战会重置房间挑战起始日期。
7. **白噪音**：此初始版本提供交互入口状态，尚未加入音频素材播放。可后续接入授权音源。

## 一、创建 Supabase 项目

1. 打开 https://supabase.com/ ，登录并创建一个新项目。
2. 记下项目的 **Project URL** 和 **Publishable key**（旧项目可能显示 `anon` public key）。
3. 进入 **Authentication → Providers**，找到 Anonymous Sign-Ins 并启用。
4. 进入 **SQL Editor**，新建查询，将 `supabase/migrations/001_initial.sql` 全部复制进去并执行。
5. 进入 **Database → Replication** 或 Realtime 设置，确认 `rooms`、`room_members`、`checkins`、`reward_draws` 已加入 `supabase_realtime` publication（迁移脚本会尝试自动添加）。
6. 生产环境建议在 Supabase Auth 的 Bot and Abuse Protection 中配置 CAPTCHA/Turnstile，并检查匿名登录速率限制。匿名账号可能被滥用创建，建议为公开站点增加验证码或邀请门槛。

## 二、本地运行（Windows 10）

需要安装 Node.js LTS（建议 Node 20 或更高版本）和 Git。

在项目目录打开 PowerShell 或 Git Bash：

```bash
npm install
```

将 `.env.example` 复制为 `.env.local`，填入 Supabase 信息：

```env
VITE_SUPABASE_URL=https://你的项目ID.supabase.co
VITE_SUPABASE_ANON_KEY=你的Publishable或anon公钥
```

注意：只能放 Supabase Publishable/anon 公钥，**绝不能**把 `service_role` 或 Secret key 放入前端环境变量。

启动开发服务器：

```bash
npm run dev
```

终端会显示本地地址，通常为 `http://localhost:5173`。打开后测试创建房间与加入房间。

生产构建检查：

```bash
npm run build
npm run preview
```

## 三、部署到 Vercel 并生成公网链接

1. 将整个项目目录推送到自己的 GitHub 仓库。
2. 登录 https://vercel.com/ ，选择 **Add New → Project**，导入 GitHub 仓库。
3. Framework Preset 选择 Vite（通常会自动识别）；Build Command `npm run build`；Output Directory `dist`。
4. 在 Vercel 项目 **Settings → Environment Variables** 添加：
   - `VITE_SUPABASE_URL` = Supabase Project URL
   - `VITE_SUPABASE_ANON_KEY` = Supabase Publishable/anon key
5. 保存后执行 Deploy。部署成功后 Vercel 会给出 `https://项目名.vercel.app` 访问网址。
6. 每次推送到 GitHub 主分支，Vercel 会自动重新部署。

## 四、两个人如何测试

1. 在电脑浏览器打开部署网址，输入昵称，例如「小月亮」，创建房间。
2. 复制 6 位邀请码。
3. 在手机或另一个浏览器打开同一个网址，输入昵称，例如「星星」，加入房间。
4. 两个设备进入房间页，应该能看到两名成员。
5. 各自进入「今晚」提交入睡时间。
6. 另一台设备应在 Realtime 事件到达后更新成员打卡状态；若没更新，刷新页面检查数据库与 Realtime 配置。
7. 测试目标时间、连续达标、排行榜、挑战与抽奖。

## 五、目录结构

```text
goodnight-online/
├─ index.html
├─ package.json
├─ .env.example
├─ README.md
├─ src/
│  ├─ main.jsx
│  ├─ App.jsx
│  ├─ style.css
│  └─ supabase.js
└─ supabase/
   └─ migrations/
      └─ 001_initial.sql
```

## 六、数据库设计

### rooms（房间）
| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid | 主键 |
| room_code | char(6) | 唯一邀请码 |
| name | text | 房间名称 |
| owner_id | uuid | 房主 Supabase Auth UID |
| target_time | time | 房间目标入睡时间 |
| challenge_start_date | date | 当前挑战开始日期 |
| created_at | timestamptz | 创建时间 |

### room_members（房间成员）
| 字段 | 类型 | 说明 |
|---|---|---|
| room_id | uuid | 房间 ID |
| user_id | uuid | 匿名用户 UID |
| nickname | text | 房间内昵称 |
| role | text | owner / member |
| joined_at | timestamptz | 加入时间 |
| 主键 | (room_id,user_id) | 防止重复加入 |

### checkins（每日打卡）
| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid | 主键 |
| room_id | uuid | 房间 ID |
| user_id | uuid | 打卡用户 UID |
| checkin_date | date | 打卡日期 |
| sleep_time | time | 实际入睡时间 |
| is_on_time | boolean | 是否达标 |
| created_at / updated_at | timestamptz | 创建/更新时间 |
| 唯一约束 | (room_id,user_id,checkin_date) | 每人每房间每天一条 |

### reward_draws（抽奖记录）
| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid | 主键 |
| room_id | uuid | 房间 ID |
| user_id | uuid | 中奖用户 UID |
| nickname | text | 抽奖时昵称快照 |
| prize_tier | smallint | 奖项等级 1/2/3 |
| prize_name | text | 奖项名称 |
| prize_description | text | 奖项说明 |
| created_at | timestamptz | 抽奖时间 |

## 七、安全设计

- 客户端只使用 Publishable/anon key。
- 数据表启用 RLS；房间信息、成员、打卡和奖励只能由房间成员读取。
- 创建房间、加入房间、打卡、退出房间、挑战重启、抽奖使用数据库 RPC，在服务端校验 `auth.uid()`。
- 不能仅凭昵称或邀请码读取任意数据；加入房间后才有成员权限。
- 不要将 Supabase `service_role` / Secret key 提交到 GitHub 或前端。

## 八、目前尚未包含的增强项

- 房间切换器（数据库结构支持多房间，当前页面默认显示最近加入的房间）
- 真正可播放的白噪音音频素材
- Web Push / 定时提醒服务
- 房主转让、踢出成员、解散房间管理 UI
- CAPTCHA 的前端接入
- pgTAP 自动化 RLS 测试与端到端测试

建议正式公开给很多陌生用户前，补充验证码、频率限制、成员管理和数据库策略测试。
