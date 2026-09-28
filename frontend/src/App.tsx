import { useState } from 'react';
import './App.css';
import HealthCheck from './components/HealthCheck';

function App() {
  return (
    <div className="App">
      <h1>Job Tracker Application</h1>
      <HealthCheck />
    </div>
  );
}

export default App;
