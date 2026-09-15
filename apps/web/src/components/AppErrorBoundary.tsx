import { Component, type ReactNode } from 'react';
export default class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="state-panel m-8">
        <h1>The workspace could not render this view.</h1>
        <p>Reload to retry. Completed source snapshots and rehearsal evidence remain in the API.</p>
        <button className="btn-primary" onClick={() => window.location.reload()}>
          Reload workspace
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
