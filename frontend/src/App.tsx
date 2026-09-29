import React, { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { HomePage } from './pages/HomePage';
import { TrainSearchPage } from './pages/TrainSearchPage';
import { TrainStatusPage } from './pages/TrainStatusPage';
import { TrainDetailsPage } from './pages/TrainDetailsPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { AboutPage } from './pages/AboutPage';
import { LoginPage } from './pages/LoginPage';
import { DataCenterPage } from './pages/DataCenterPage';
import { DemoControlPage } from './pages/DemoControlPage';

const ScrollToTop: React.FC = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [pathname]);
  return null;
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ScrollToTop />
        <div id="top" className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
          <Navbar />
          <main className="flex-grow">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/data" element={<DataCenterPage />} />
              <Route path="/demo-control" element={<DemoControlPage />} />
              <Route path="/search" element={<TrainSearchPage />} />
              <Route path="/status" element={<TrainStatusPage />} />
              <Route path="/status/:trainNumber" element={<TrainStatusPage />} />
              <Route path="/details" element={<TrainDetailsPage />} />
              <Route path="/details/:trainNumber" element={<TrainDetailsPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
          <Footer />
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
