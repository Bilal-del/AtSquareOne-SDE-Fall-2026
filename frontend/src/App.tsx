
import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom';
import JobSearch from './pages/JobSearch';
import JobDetails from './pages/JobDetails';
import ApplicationTracker from './pages/ApplicationTracker';
import HealthCheck from './components/HealthCheck';
import './App.css';

function App() {
    return (
        <BrowserRouter>
            <div className="App">
                <header>
                    <h1>SquareOne Job Platform</h1>

                    <nav>
                        <Link to="/jobs">Job Search</Link>
                        {' | '}
                        <Link to="/applications">Application Tracker</Link>
                    </nav>
                </header>

                <main>
                    <Routes>
                        <Route path="/" element={<Navigate to="/jobs" replace />} />
                        <Route path="/jobs" element={<JobSearch />} />
                        <Route path="/jobs/:id" element={<JobDetails />} />
                        <Route path = "/applications" element={<ApplicationTracker />} />
                        <Route path="/health" element={<HealthCheck />} />
                        <Route path="*" element={<h2>Page Not Found</h2>} />
                    </Routes>
                </main>
            </div>
        </BrowserRouter>
    );
}

export default App;
