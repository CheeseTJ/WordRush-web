import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

/** 全局渲染异常兜底：任何子树抛错不再整页白屏，显示错误详情 + 刷新入口 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }): void {
    // 错误详情进控制台，便于远程定位
    console.error('[WordRush] 渲染异常:', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          padding: 24,
          background: 'linear-gradient(160deg, #FFF6EA, #F3EAD8)',
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <div style={{ fontSize: 54, lineHeight: 1 }}>🤒</div>
          <h2 style={{ margin: '12px 0 6px', color: '#3C3C3A', fontSize: 19 }}>页面出了点小状况</h2>
          <p
            style={{
              fontSize: 12.5,
              color: '#8F8A7B',
              fontWeight: 700,
              wordBreak: 'break-all',
              background: '#F6F1E7',
              borderRadius: 12,
              padding: '8px 12px',
            }}
          >
            {this.state.error.message || String(this.state.error)}
          </p>
          <button
            type="button"
            onClick={() => location.reload()}
            style={{
              marginTop: 16,
              border: 0,
              borderRadius: 99,
              padding: '12px 30px',
              fontWeight: 900,
              fontSize: 14.5,
              color: '#fff',
              background: '#58CC02',
              boxShadow: '0 4px 0 #47A302',
            }}
          >
            刷新重试
          </button>
        </div>
      </div>
    )
  }
}
