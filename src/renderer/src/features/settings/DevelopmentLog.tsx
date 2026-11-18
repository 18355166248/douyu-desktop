import type { BuildInfo } from '@shared/buildInfo';

declare const __DESKTOP_BUILD_INFO__: BuildInfo;

export function DevelopmentLog(): React.JSX.Element {
  const { version, buildId, builtAt, revision, localChanges, notes, commits } =
    __DESKTOP_BUILD_INFO__;
  const builtTime = new Date(builtAt).toLocaleString('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  });

  return (
    <>
      <h3>开发日志</h3>
      <div className="settings-card development-log">
        <h4>当前运行版本</h4>
        <dl className="development-log-meta">
          <dt>应用版本</dt>
          <dd>
            {version}
            {import.meta.env.DEV ? '（开发模式）' : ''}
          </dd>
          <dt>构建号</dt>
          <dd>
            <code>{buildId}</code>
          </dd>
          <dt>构建时间</dt>
          <dd>
            <time dateTime={builtAt}>{builtTime}</time>
          </dd>
          {revision ? (
            <>
              <dt>Git 提交</dt>
              <dd>
                <code>{revision}</code>
              </dd>
            </>
          ) : null}
        </dl>
        {notes.length > 0 ? (
          <>
            <h4>近期改动</h4>
            <ul>
              {notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </>
        ) : null}
        {commits.length > 0 ? (
          <details>
            <summary>近期 Git 提交（{commits.length}）</summary>
            <ul>
              {commits.map(({ hash, subject }) => (
                <li key={hash}>
                  <code>{hash}</code> {subject}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        {localChanges.length > 0 ? (
          <details>
            <summary>构建时未提交的文件（{localChanges.length}）</summary>
            <ul>
              {localChanges.map((file) => (
                <li key={file}>{file}</li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </>
  );
}
