import { primaryKey } from '../lib/keyboard';

export function KeyboardHelp(): React.JSX.Element {
  const groups = [
    {
      title: '工作区与窗口',
      rows: [
        [`${primaryKey}+R / F5`, '首页刷新列表；直播页重新连接当前房间'],
        [`${primaryKey}+L`, '定位房间号 / 链接输入框'],
        [`${primaryKey}+N`, '新建副屏窗口'],
        ['Esc', '关闭弹层或退出沉浸模式'],
        ['? / F1', '打开设置中的快捷键说明'],
      ],
    },
    {
      title: '直播播放',
      rows: [
        [`${primaryKey}+W / X`, '关闭当前直播间（仅直播页，不关闭窗口）'],
        ['Space / K', '暂停 / 继续播放'],
        ['R', '重新连接当前房间'],
        ['F', '进入 / 退出沉浸模式'],
      ],
    },
    {
      title: '声音控制',
      rows: [
        ['M', '静音 / 取消静音'],
        ['↑ / ↓', '音量增加 / 降低 5%'],
        ['S', '独听当前房间 / 取消独听'],
      ],
    },
    {
      title: '弹幕控制',
      rows: [
        ['D', '显示 / 隐藏所有弹幕'],
        ['P', '暂停 / 继续所有弹幕'],
      ],
    },
  ];
  return (
    <>
      <p>
        直播操作作用于鼠标最近移入或键盘聚焦的房间，默认第一路。输入文字和打开弹层时不触发播放快捷键。
      </p>
      {groups.map((group) => (
        <section key={group.title}>
          <h3>{group.title}</h3>
          <dl className="keyboard-help">
            {group.rows.map(([key, description]) => (
              <div key={key}>
                <dt>
                  <kbd>{key}</kbd>
                </dt>
                <dd>{description}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </>
  );
}
