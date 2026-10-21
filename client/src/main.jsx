import { createRoot } from 'react-dom/client';
import { createElement, useEffect, useState } from 'react';
import './styles.css';

function App() {
  const [status, setStatus] = useState('Checking API connection…');

  useEffect(() => {
    const controller = new AbortController();
    async function checkHealth() {
      try {
        const response = await fetch('/api/health', {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Health check failed');
        const data = await response.json();
        setStatus(data.status === 'ok' ? 'API connected' : 'API unavailable');
      } catch (error) {
        if (error.name !== 'AbortError')
          setStatus('API unavailable. Start the backend and reload.');
      }
    }
    checkHealth();
    return () => controller.abort();
  }, []);

  return (
    <main>
      <header>
        <a href="/" aria-label="SlotSure home">
          SlotSure<span>✳</span>
        </a>
        <span>Project foundation</span>
      </header>
      <section>
        <p className="eyebrow">YOUR TIME, WELL SPENT</p>
        <h1>
          Book your time.
          <br />
          <span>
            No clashes,
            <br />
            no confusion.
          </span>
        </h1>
        <p className="intro">
          A simpler way for independent consultants and their customers to make
          time for what matters.
        </p>
        <div className="status" role="status">
          {status}
        </div>
        <p className="note">
          Milestone 0 · Development environment ready.
          <br />
          Appointment booking will arrive in a later milestone.
        </p>
      </section>
      <footer>SlotSure / Built around your time.</footer>
    </main>
  );
}

createRoot(document.getElementById('root')).render(createElement(App));
