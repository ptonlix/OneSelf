# 效果 GIF 分镜 / Demo GIF storyboard

给 README 首屏和社交帖用的一条成片，目标 **30–60 秒**。这条片子只讲两件事：两个不同的 AI 客户端读同一份个人上下文，然后所属人批准一条新授权并把它作废。

This is a shot list to film from. It is not a claim that any named AI product is a verified client. On screen, label the windows **客户端 A / Client A** and **客户端 B / Client B**. Pick any two programs you already use that can call HTTP or MCP. Do not add a "supported" or "official" lower third.

不要复用 `docs/assets/cli-install.gif`。那条只演示安装器。效果片的建议路径是 `docs/assets/oneself-demo.gif`。

## 拍之前 / Before you record

用一份虚构资料，不要用真人的导出包、证件或健康页。可以直接用 README 里的示例页（张三、`fact_01`、现居上海）。管理端不能写页。开录之前，用一把已经批准的凭据把这一页写进去；写入过程不要进成片。

准备三份彼此独立的授权，都只能读这个示例目录：

1. 客户端 A 已经能读。
2. 客户端 B 已经能读。
3. 镜头 4 再批准一条新的设备码。镜头 5 只作废这一条。客户端 A 应仍能读，用来表现「作废的是这一条，不是整站」。

优先拍 **OAuth 设备码**，不要拍 API Key。密钥原文只在批准页出现一次，GIF 里不该出现 `osk_`。也不要出现所属人口令、OAuth 刷新令牌、对象存储密钥、`DATABASE_URL` 或用户码以外的长串令牌。用户码是短时的；能裁掉就裁掉。

界面上会用到的原文：

| 画面 | 管理端上的字 |
| --- | --- |
| 批准 | 侧栏「批准设备码」。成功后是「设备码已批准」「已批准这台设备。没有创建 API Key。」 |
| 作废 | 概览里的「已批准设备」。按钮是「作废」，确认是「确认作废」。 |
| 备选（不建议进成片） | API Key 批准页会显示密钥原文。若改拍这条，必须挡住原文。概览卡片上的说明是「原文不保存，只能作废」。 |

画幅 1280×720，16:9。隐藏书签栏和其他标签页。不要录音。字幕烧进画面，中文一行、英文一行，放在底部安全区。第一帧用标题卡，这样 GIF 不自动播放时看到的仍是标题。

## 镜头 / Shot list

整条约 **58 秒**。超时就剪掉镜头 6，把结束卡接到 0:44，整条约 50 秒。

| # | 时间 | 画面 | 字幕（ZH） | Caption (EN) | 怎么拍 |
| --- | --- | --- | --- | --- | --- |
| 1 | 0:00–0:04 | 标题卡。只有 OneSelf 和一句「一份上下文」。不要放客户端商标。 | 一份上下文，给每个 AI | One context. Every AI. | 静止 4 秒。 |
| 2 | 0:04–0:12 | 客户端 A 问一条只有示例页里才有的事实，回答落到「现居上海」或你写入的那句。左下角标「客户端 A」。 | 客户端 A 读到这条 | Client A reads it | 问题和回答都要看得清。不要露出配置文件或密钥。 |
| 3 | 0:12–0:20 | 切到客户端 B，问同一句，得到同一句回答。左下角标「客户端 B」。 | 客户端 B 读到的是同一份 | Client B reads the same | 两个窗口不要叠在一起抢字。 |
| 4 | 0:20–0:32 | 一条新的设备码授权。先闪一下客户端里的用户码（可打码），再切到 `/admin/device`，页面标题是「批准设备码」，点批准，停在「设备码已批准」。 | 新的授权，要你点批准 | A new grant needs your approval | 不要拍成客户端自己批的。批准按钮在管理端。 |
| 5 | 0:32–0:44 | 概览 →「已批准设备」→「作废」→「确认作废」。切回刚才那条新授权的客户端，下一次读取失败。 | 作废之后，这一条立刻失效 | Revoke this one. It stops. | 失败画面只留错误码或一句「读不到」。不要展开带令牌的请求头。 |
| 6 | 0:44–0:52 | 切回客户端 A，再问一次，仍然答得出来。 | 另一条授权还在 | The other grant still works | 这是在表现「单独作废」。超时可剪。 |
| 7 | 0:52–0:58 | 结束卡。 | 你的资料，你做主 | Your material, your call. | 停 6 秒，方便循环。 |

公开主页不放进这条 60 秒里。那是另一条片子：Agent 上传、预览、所属人在「批准站点上线」里同意之后，线上页面才换。同意前不要说站点已经换了。

## 导出 / Export

建议文件 `docs/assets/oneself-demo.gif`，尽量压到 8 MB 以内，否则 README 会很重。

用 ffmpeg 时，先缩到 1280 宽、每秒 12 帧，再生成调色板。下面只处理你自己录好的文件，不要把含密钥的原始录屏提交进仓库：

```bash
ffmpeg -i recording.mp4 -vf "fps=12,scale=1280:-1:flags=lanczos,palettegen" -y palette.png
ffmpeg -i recording.mp4 -i palette.png -lavfi "fps=12,scale=1280:-1:flags=lanczos [x]; [x][1:v] paletteuse" -y docs/assets/oneself-demo.gif
```

社交帖可以裁同一条成片的 1:1 中段。标题卡留在开头，封面就不会落在半句话上。

## 录完后改 README / After it is recorded

两份 README 里，删掉 `TODO(demo-gif)` 注释和「待拍摄」引用块，换成下面这一张图。中文 README 用中文 alt，英文 README 用英文 alt。

`README.md`：

```html
<img src="docs/assets/oneself-demo.gif" alt="两个客户端读同一份个人上下文，然后批准并作废一条授权" width="100%" />
```

`README_EN.md`：

```html
<img src="docs/assets/oneself-demo.gif" alt="Two clients read one personal context, then a grant is approved and revoked" width="100%" />
```

图片前后不要再写「待拍摄」。快速开始里的安装 GIF（`docs/assets/cli-install.gif`）留在原处。

GitHub 社交预览图是另一张静帧，不是这张 GIF。仓库设置里的 Social preview 需要 1280×640。现有 `docs/images/hero.png` 是 2560×800，不能原样当预览图，需要另裁或另导出。
