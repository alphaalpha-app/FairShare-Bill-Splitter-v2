import React, { useEffect, useState, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Trash2, Download, Upload, Save, X, Bot, Pencil, Check } from 'lucide-react';
import { db } from '../services/db';
import { Tenant, AILog } from '../types';
import { COLORS } from '../constants';
import CalendarSelector from '../components/CalendarSelector';
import { format, parseISO, isValid } from 'date-fns';

export default function SettingsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [aiLogs, setAiLogs] = useState<AILog[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newTenantName, setNewTenantName] = useState('');
  
  // For editing tenant name
  const [editingTenantId, setEditingTenantId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  
  // For Calendar editing in Settings
  const [selectedTenantForDates, setSelectedTenantForDates] = useState<Tenant | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setTenants(await db.getTenants());
    setAiLogs(await db.getAILogs());
  };

  const handleAddTenant = async () => {
    if (!newTenantName.trim()) return;
    const color = COLORS[tenants.length % COLORS.length];
    const newTenant: Tenant = {
      id: uuidv4(),
      name: newTenantName.trim(),
      color,
      defaultStayDates: []
    };
    await db.saveTenant(newTenant);
    setNewTenantName('');
    setIsAdding(false);
    loadData();
  };

  const handleDeleteTenant = async (id: string) => {
    if (confirm('Are you sure? This will remove them from future calculations.')) {
      await db.deleteTenant(id);
      loadData();
    }
  };

  const startEditingTenant = (tenant: Tenant) => {
    setEditingTenantId(tenant.id);
    setEditingName(tenant.name);
  };

  const saveTenantName = async () => {
    if (!editingTenantId || !editingName.trim()) return;
    
    const tenant = tenants.find(t => t.id === editingTenantId);
    if (tenant) {
      const updated = { ...tenant, name: editingName.trim() };
      await db.saveTenant(updated);
      setTenants(tenants.map(t => t.id === updated.id ? updated : t));
    }
    setEditingTenantId(null);
    setEditingName('');
  };

  const handleExport = async () => {
    const json = await db.exportData();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fairshare_backup_${format(new Date(), 'yyyyMMdd')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      await db.importData(text);
      alert('Data restored successfully!');
      loadData();
    } catch (err) {
      alert('Failed to import data. Invalid file.');
    }
  };

  // --- Default Dates Logic ---
  const handleSaveDefaultDates = async (dates: string[]) => {
    if (selectedTenantForDates) {
      const updated = { ...selectedTenantForDates, defaultStayDates: dates };
      await db.saveTenant(updated);
      setTenants(tenants.map(t => t.id === updated.id ? updated : t));
      setSelectedTenantForDates(updated); // keep selected to show update
    }
  };

  return (
    <div className="space-y-8 pb-10">
      {/* Header */}
      <header>
        <h1 className="text-2xl font-bold text-gray-800">Settings</h1>
      </header>

      {/* Tenants Section */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-700">Tenants</h2>
          <button 
            onClick={() => setIsAdding(true)}
            className="text-sm bg-blue-100 text-blue-600 px-3 py-1 rounded-full font-medium hover:bg-blue-200"
          >
            + Add Tenant
          </button>
        </div>
        
        {isAdding && (
          <div className="flex gap-2 mb-4 animate-fade-in">
            <input 
              autoFocus
              type="text" 
              value={newTenantName} 
              onChange={e => setNewTenantName(e.target.value)}
              placeholder="Name"
              className="flex-grow border rounded-lg px-3 py-2 text-sm"
            />
            <button onClick={handleAddTenant} className="bg-blue-600 text-white p-2 rounded-lg">
              <Save size={18} />
            </button>
            <button onClick={() => setIsAdding(false)} className="bg-gray-200 text-gray-600 p-2 rounded-lg">
              <X size={18} />
            </button>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {tenants.map(tenant => (
            <div key={tenant.id} className="border-b last:border-0 border-gray-50 p-4 flex items-center justify-between">
              <div className="flex items-center gap-3 flex-grow">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0" style={{ backgroundColor: tenant.color }}>
                  {tenant.name.substring(0, 2).toUpperCase()}
                </div>
                
                {editingTenantId === tenant.id ? (
                  <div className="flex items-center gap-2 flex-grow">
                    <input 
                      type="text" 
                      value={editingName} 
                      onChange={e => setEditingName(e.target.value)}
                      className="border rounded px-2 py-1 text-sm w-full"
                      autoFocus
                    />
                    <button onClick={saveTenantName} className="text-green-600 p-1 hover:bg-green-50 rounded">
                      <Check size={16} />
                    </button>
                    <button onClick={() => setEditingTenantId(null)} className="text-gray-400 p-1 hover:bg-gray-100 rounded">
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 group">
                    <span className="font-medium text-gray-700">{tenant.name}</span>
                    <button 
                      onClick={() => startEditingTenant(tenant)} 
                      className="text-gray-300 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Pencil size={12} />
                    </button>
                  </div>
                )}
              </div>
              
              <div className="flex items-center gap-2 pl-2">
                <button 
                  onClick={() => setSelectedTenantForDates(tenant)}
                  className="text-xs text-blue-500 bg-blue-50 px-2 py-1 rounded hover:bg-blue-100 whitespace-nowrap"
                >
                  Edit Defaults
                </button>
                <button onClick={() => handleDeleteTenant(tenant.id)} className="text-gray-400 hover:text-red-500 p-1">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
          {tenants.length === 0 && !isAdding && (
            <div className="p-4 text-center text-gray-400 text-sm">No tenants added yet.</div>
          )}
        </div>
      </section>

      {/* AI History Section */}
      <section>
        <h2 className="text-lg font-semibold text-gray-700 mb-4 flex items-center gap-2">
          <Bot size={20} className="text-purple-600"/> AI Scan History
        </h2>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden max-h-48 overflow-y-auto">
          {aiLogs.length === 0 ? (
            <div className="p-4 text-center text-gray-400 text-xs">No scan history available.</div>
          ) : (
            <table className="w-full text-xs text-left">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="p-2">Date</th>
                  <th className="p-2">Type</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {aiLogs.map(log => (
                  <tr key={log.id} className="border-t border-gray-50">
                    <td className="p-2 text-gray-600">{format(new Date(log.timestamp), 'dd/MM/yy HH:mm')}</td>
                    <td className="p-2 font-medium">{log.billType}</td>
                    <td className="p-2">
                      <span className={`px-1.5 py-0.5 rounded ${log.status === 'SUCCESS' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                        {log.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Default Stay Calendar Modal/Section */}
      {selectedTenantForDates && (
        <section className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div 
            className="bg-white rounded-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()} /* Prevent interaction with background */
          >
            <div className="p-4 border-b flex justify-between items-center sticky top-0 bg-white z-10">
              <h3 className="font-bold">Default Stays: {selectedTenantForDates.name}</h3>
              <button onClick={() => { setSelectedTenantForDates(null); }}>
                <X size={24} />
              </button>
            </div>
            
            <div className="p-4 flex-grow space-y-4">
              <p className="text-sm text-gray-500">
                Select usual stay days. These are pre-filled on new bills.
              </p>

              {/* Calendar with Wide Range for Past/Future and Range Selection Enabled */}
              <CalendarSelector
                color={selectedTenantForDates.color}
                selectedDates={selectedTenantForDates.defaultStayDates || []}
                onSelectionChange={handleSaveDefaultDates}
                enableRangeSelection={true}
                periods={[{ 
                  id: 'default', 
                  startDate: '2020-01-01', // Allow from 2020
                  endDate: '2030-12-31',   // Allow to 2030
                  usageCost: 0 
                }]}
              />
              <p className="text-xs text-center text-gray-400">
                Tap "Select Range" to add multiple days at once.
                <br />
                Scroll to navigate months (2020-2030).
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Data Management */}
      <section>
        <h2 className="text-lg font-semibold text-gray-700 mb-4">Data Backup</h2>
        <div className="grid grid-cols-2 gap-4">
          <button 
            onClick={handleExport}
            className="flex flex-col items-center justify-center p-4 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <Download className="mb-2 text-blue-500" />
            <span className="text-sm font-medium">Export Data</span>
          </button>
          
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center p-4 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <Upload className="mb-2 text-green-500" />
            <span className="text-sm font-medium">Import Data</span>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept=".json" 
              onChange={handleImport} 
            />
          </button>
        </div>
      </section>
    </div>
  );
}