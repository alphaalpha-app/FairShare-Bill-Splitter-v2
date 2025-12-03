import React from 'react';
import { HashRouter, Routes, Route, NavLink } from 'react-router-dom';
import { Home, Settings, FileText, PlusCircle } from 'lucide-react';
import HomePage from './pages/Home';
import SettingsPage from './pages/Settings';
import BillForm from './pages/BillForm';
import BillDetail from './pages/BillDetail';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col pb-20">
      <main className="flex-grow container mx-auto p-4 max-w-2xl">
        {children}
      </main>
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-3 flex justify-around items-center z-50 safe-area-bottom">
        <NavLink 
          to="/" 
          className={({ isActive }) => `flex flex-col items-center gap-1 ${isActive ? 'text-blue-600' : 'text-gray-400'}`}
        >
          <Home size={24} />
          <span className="text-xs font-medium">Home</span>
        </NavLink>
        
        <NavLink 
          to="/bill/new" 
          className="flex flex-col items-center gap-1 text-blue-600 -mt-6"
        >
          <div className="bg-blue-600 text-white p-3 rounded-full shadow-lg">
            <PlusCircle size={28} />
          </div>
          <span className="text-xs font-medium">New Bill</span>
        </NavLink>

        <NavLink 
          to="/settings" 
          className={({ isActive }) => `flex flex-col items-center gap-1 ${isActive ? 'text-blue-600' : 'text-gray-400'}`}
        >
          <Settings size={24} />
          <span className="text-xs font-medium">Settings</span>
        </NavLink>
      </nav>
    </div>
  );
};

export default function App() {
  return (
    <HashRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/bill/new" element={<BillForm />} />
          <Route path="/bill/:id/edit" element={<BillForm />} />
          <Route path="/bill/:id" element={<BillDetail />} />
        </Routes>
      </Layout>
    </HashRouter>
  );
}
