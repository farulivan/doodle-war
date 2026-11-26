import { Component, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Last-resort screen so a crash shows a friendly page instead of a blank one. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error): void {
    console.error('Doodle War crashed:', error);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="screen interactive">
        <div className="sheet overlay-card ruled">
          <h2>Oops, the page tore!</h2>
          <p>Something went wrong. Reloading usually fixes it.</p>
          <div className="menu">
            <button className="btn primary" onClick={() => location.reload()}>
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
