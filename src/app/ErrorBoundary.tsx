import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

/** Evita la pantalla en blanco si una herramienta falla: muestra el error y deja volver al inicio. */
export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Error en la interfaz:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="vacio" role="alert" data-testid="error-interfaz">
        <AlertTriangle size={36} />
        <h2>Algo ha fallado en esta herramienta</h2>
        <p>{this.state.error.message}</p>
        <a className="btn primario" href="#/" onClick={() => this.setState({ error: null })}>
          Volver al inicio
        </a>
      </div>
    );
  }
}
