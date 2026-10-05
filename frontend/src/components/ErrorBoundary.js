/**
 * Global React error boundary — production white-screen prevention.
 *
 * Catches render-time crashes in routes/pages (e.g. a lazy chunk that failed
 * to load after a redeploy, or a component that threw) and shows a safe,
 * localized recovery message instead of a blank page. It does NOT replace
 * fixing root causes: real errors are still logged to the console in full.
 */
import React from 'react';
import { useI18n } from '@/i18n';

class Boundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Full diagnostics for developers; no user data or secrets here.
    console.error('[NafaMitra] render error:', error, info?.componentStack || '');
  }

  render() {
    if (this.state.error) return this.props.fallback();
    return this.props.children;
  }
}

export default function ErrorBoundary({ children }) {
  const { t } = useI18n();
  return (
    <Boundary
      fallback={() => (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
          <div
            role="alert"
            className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center"
          >
            <div className="text-4xl mb-3" aria-hidden="true">⚠️</div>
            <h1 className="text-lg font-bold text-gray-900 mb-2">
              {t('common.errorTitle')}
            </h1>
            <p className="text-sm text-gray-600 mb-5">{t('common.errorMsg')}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-5 py-2.5"
            >
              {t('common.retry')}
            </button>
          </div>
        </div>
      )}
    >
      {children}
    </Boundary>
  );
}
