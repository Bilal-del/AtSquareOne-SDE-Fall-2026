import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import ApplicationTracker from './pages/ApplicationTracker';
import JobDetails from './pages/JobDetails';
import JobSearch from './pages/JobSearch';
import DocumentLibrary from './pages/DocumentLibrary';
import Login from './pages/Login';
import Register from './pages/Register';
import AdminJobs from './pages/AdminJobs';
import HealthCheck from './components/HealthCheck';
import SquareOneNavigation from './components/SquareOneNavigation';
import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute, PublicOnlyRoute, StaffRoute } from './auth/ProtectedRoute';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="app-shell">
          <SquareOneNavigation />
          <main className="app-main">
            <Routes>
              <Route path="/" element={<Navigate to="/jobs" replace />} />
              <Route path="/jobs" element={<JobSearch />} />
              <Route path="/jobs/:id" element={<JobDetails />} />
              <Route path="/health" element={<HealthCheck />} />
              <Route element={<PublicOnlyRoute />}>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
              </Route>
              <Route element={<ProtectedRoute />}>
                <Route path="/applications" element={<ApplicationTracker />} />
                <Route path="/documents" element={<DocumentLibrary />} />
              </Route>
              <Route element={<StaffRoute />}>
                <Route path="/admin/jobs" element={<AdminJobs />} />
              </Route>
              <Route path="*" element={<h2>Page Not Found</h2>} />
            </Routes>
          </main>
          <footer className="site-footer">
            <span>SquareOne · Internship demo</span>
            <span>Fictional database records · External source integrations are planned</span>
          </footer>
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
