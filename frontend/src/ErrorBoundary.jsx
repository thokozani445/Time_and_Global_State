import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught:", error, info);
    this.setState({ info });
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 20, fontFamily: "Inter, Arial, sans-serif" }}>
          <h2>Application error</h2>
          <div style={{ whiteSpace: "pre-wrap", background: "#fff5f5", padding: 12, borderRadius: 6 }}>
            <strong>{String(this.state.error)}</strong>
            <div style={{ marginTop: 8, fontSize: 13, color: "#6b7280" }}>
              See browser console for stack trace. You can copy & paste it to me and I’ll fix the bug.
            </div>
          </div>
          {this.state.info && (
            <details style={{ marginTop: 12 }}>
              <summary>Component stack</summary>
              <pre style={{ whiteSpace: "pre-wrap" }}>{this.state.info.componentStack}</pre>
            </details>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
