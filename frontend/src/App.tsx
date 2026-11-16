import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import ApplicationTracker from './pages/ApplicationTracker';
import JobDetails from './pages/JobDetails';
import JobSearch from './pages/JobSearch';
import HealthCheck from './components/HealthCheck';
import SquareOneNavigation from './components/SquareOneNavigation';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <SquareOneNavigation />
        <main className="app-main">
          <Routes>
            <Route path="/" element={<Navigate to="/jobs" replace />} />
            <Route path="/jobs" element={<JobSearch />} />
            <Route path="/jobs/:id" element={<JobDetails />} />
            <Route path="/applications" element={<ApplicationTracker />} />
            <Route path="/health" element={<HealthCheck />} />
            <Route path="*" element={<h2>Page Not Found</h2>} />
          </Routes>
        </main>
        <footer className="site-footer">
          <span>SquareOne · Internship demo</span>
          <span>Fictional database records · External source integrations are planned</span>
        </footer>
      </div>
    </BrowserRouter>
  );
}

export default App;
