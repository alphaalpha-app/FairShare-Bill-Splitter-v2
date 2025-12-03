import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { format, parseISO, isWithinInterval } from 'date-fns';
import { Share2, Edit2, Calendar as CalIcon, DollarSign, Download, Users, Check } from 'lucide-react';
import html2canvas from 'html2canvas';

import { db } from '../services/db';
import { Bill, Tenant, CalculationResult, BillManualOverride } from '../types';
import { calculateBill } from '../services/calcLogic';
import CalendarSelector from '../components/CalendarSelector';
import { clsx } from 'clsx';

type Tab = 'summary' | 'calendar' | 'breakdown';

export default function BillDetail() {
  const { id } = useParams();
  const [bill, setBill] = useState<Bill | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  // Removed BillStays state, using tenants[].defaultStayDates instead
  const [overrides, setOverrides] = useState<BillManualOverride | undefined>();
  const [results, setResults] = useState<CalculationResult[]>([]);
  
  const [activeTab, setActiveTab] = useState<Tab>('summary');
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [editingResult, setEditingResult] = useState<string | null>(null); // tenantId being edited
  const [editValues, setEditValues] = useState<any>({});

  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (id) loadData(id);
  }, [id]);

  useEffect(() => {
    if (bill && tenants.length > 0) {
      // Calculate using the Tenant objects which now hold the source of truth for dates
      const res = calculateBill(bill, tenants, overrides);
      setResults(res);
    }
  }, [bill, tenants, overrides]);

  const loadData = async (billId: string) => {
    const b = await db.getBill(billId);
    const t = await db.getTenants();
    const o = await db.getOverrides(billId);
    
    if (b) {
      setBill(b);
      // We load all tenants but we'll focus on those included
      // We must keep the full Tenant objects because they contain the date arrays
      const included = t.filter(tenant => b.includedTenantIds.includes(tenant.id));
      setTenants(included);
      setOverrides(o);
      if (b.includedTenantIds.length > 0) setSelectedTenantId(b.includedTenantIds[0]);
    }
  };

  const handleDatesChange = async (newDates: string[]) => {
    if (!selectedTenantId) return;
    
    // Find the tenant object
    const tenant = tenants.find(t => t.id === selectedTenantId);
    if (!tenant) return;

    // Update the Tenant directly (Global Sync)
    const updatedTenant: Tenant = { ...tenant, defaultStayDates: newDates };
    
    await db.saveTenant(updatedTenant);
    
    // Update local state to trigger recalc
    setTenants(prev => prev.map(t => t.id === selectedTenantId ? updatedTenant : t));
  };

  const copyDatesFrom = async (sourceTenantId: string) => {
    if (!bill || !selectedTenantId) return;
    const sourceTenant = tenants.find(t => t.id === sourceTenantId);
    if (!sourceTenant) return;

    // We only copy dates that are RELEVANT to this bill to avoid overwriting unrelated history?
    // User requested "copy days", usually implies exact copy for the visible range.
    // However, since we are now Global, we need to be careful. 
    // BUT the requirement was simplified: "default stay setting applies to bill, bill applies to setting".
    // So if I copy A to B in this bill context, B gets A's dates. 
    // To be safe and intuitive: we should merge A's dates *within this bill's period* into B's dates, 
    // or just replace B's dates within this period with A's.
    
    // Let's implement: Replace B's dates within bill period with A's dates within bill period.
    // 1. Get A's dates in range
    const rangeDates = sourceTenant.defaultStayDates.filter(d => 
      bill.periods.some(p => d >= p.startDate && d <= p.endDate)
    );

    // 2. Get B's dates (target)
    const targetTenant = tenants.find(t => t.id === selectedTenantId);
    if (!targetTenant) return;

    // 3. Remove B's existing dates in range
    const targetDatesOutsideRange = targetTenant.defaultStayDates.filter(d => 
      !bill.periods.some(p => d >= p.startDate && d <= p.endDate)
    );

    // 4. Combine
    const newDates = [...targetDatesOutsideRange, ...rangeDates].sort();
    
    handleDatesChange(newDates);
  };

  const handleExportImage = async () => {
    if (summaryRef.current) {
      const canvas = await html2canvas(summaryRef.current, { backgroundColor: '#ffffff', scale: 2 });
      const link = document.createElement('a');
      link.download = `Bill_Summary_${bill?.name.replace(/\s+/g, '_')}.png`;
      link.href = canvas.toDataURL();
      link.click();
    }
  };

  const startEditing = (res: CalculationResult) => {
    setEditingResult(res.tenantId);
    setEditValues({
      total: res.total.toFixed(2),
      supply: res.supplyShare.toFixed(2),
      sewerage: res.sewerageShare.toFixed(2),
      usage: res.totalUsageCost.toFixed(2)
    });
  };

  const saveEditing = async () => {
    if (!bill || !editingResult) return;

    const newOverrides = {
      billId: bill.id,
      overrides: {
        ...(overrides?.overrides || {}),
        [editingResult]: {
          total: parseFloat(editValues.total),
          supply: parseFloat(editValues.supply),
          sewerage: parseFloat(editValues.sewerage),
          usage: parseFloat(editValues.usage),
        }
      }
    };
    
    setOverrides(newOverrides);
    await db.saveOverrides(newOverrides);
    setEditingResult(null);
  };

  const clearOverride = async (tId: string) => {
    if (!bill) return;
    const current = overrides?.overrides || {};
    const { [tId]: removed, ...rest } = current;
    const newOverrides = { billId: bill.id, overrides: rest };
    setOverrides(newOverrides);
    await db.saveOverrides(newOverrides);
  };

  if (!bill) return <div className="p-8 text-center">Loading...</div>;

  const selectedTenant = tenants.find(t => t.id === selectedTenantId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{bill.name}</h1>
          <div className="flex gap-2 text-sm text-gray-500 mt-1">
             <span className="bg-gray-100 px-2 py-0.5 rounded text-gray-700">{bill.type}</span>
             <span>•</span>
             <span>{bill.periods.length} period(s)</span>
          </div>
        </div>
        <Link to={`/bill/${bill.id}/edit`} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200">
          <Edit2 size={18} className="text-gray-600" />
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex bg-white rounded-xl shadow-sm border border-gray-100 p-1">
        <button 
          onClick={() => setActiveTab('summary')}
          className={clsx("flex-1 py-2 text-sm font-medium rounded-lg flex items-center justify-center gap-2", activeTab === 'summary' ? "bg-blue-50 text-blue-600" : "text-gray-500")}
        >
          <DollarSign size={16} /> Summary
        </button>
        <button 
          onClick={() => setActiveTab('calendar')}
          className={clsx("flex-1 py-2 text-sm font-medium rounded-lg flex items-center justify-center gap-2", activeTab === 'calendar' ? "bg-blue-50 text-blue-600" : "text-gray-500")}
        >
          <CalIcon size={16} /> Stays
        </button>
        <button 
          onClick={() => setActiveTab('breakdown')}
          className={clsx("flex-1 py-2 text-sm font-medium rounded-lg flex items-center justify-center gap-2", activeTab === 'breakdown' ? "bg-blue-50 text-blue-600" : "text-gray-500")}
        >
          <Users size={16} /> Details
        </button>
      </div>

      {/* Summary Tab */}
      {activeTab === 'summary' && (
        <div className="space-y-4">
          <div ref={summaryRef} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h2 className="text-lg font-bold mb-4 border-b pb-2">Bill Summary</h2>
            <div className="space-y-3">
              {results.map(res => {
                const t = tenants.find(te => te.id === res.tenantId);
                return (
                  <div key={res.tenantId} className="flex justify-between items-center py-2">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: t?.color }}>
                        {t?.name.substring(0, 1)}
                      </div>
                      <span className="font-medium text-gray-800">{t?.name}</span>
                      {res.isOverridden && <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1 rounded">Manual</span>}
                    </div>
                    <span className="font-bold text-lg">${res.total.toFixed(2)}</span>
                  </div>
                );
              })}
              <div className="border-t pt-3 mt-3 flex justify-between items-center text-gray-500">
                <span>Total Bill</span>
                <span className="font-bold text-gray-900">
                  ${results.reduce((acc, curr) => acc + curr.total, 0).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
          <button 
            onClick={handleExportImage}
            className="w-full flex items-center justify-center gap-2 bg-gray-800 text-white py-3 rounded-xl font-medium shadow hover:bg-gray-900"
          >
            <Share2 size={18} /> Export Image
          </button>
        </div>
      )}

      {/* Calendar Tab */}
      {activeTab === 'calendar' && (
        <div className="space-y-4">
          {/* Tenant Selector */}
          <div className="flex overflow-x-auto gap-2 pb-2 no-scrollbar">
            {tenants.map(t => (
              <button
                key={t.id}
                onClick={() => setSelectedTenantId(t.id)}
                className={clsx(
                  "flex-shrink-0 px-4 py-2 rounded-full border text-sm font-medium transition-colors",
                  selectedTenantId === t.id 
                    ? "border-blue-500 bg-blue-50 text-blue-700" 
                    : "border-gray-200 text-gray-600 bg-white"
                )}
              >
                {t.name}
              </button>
            ))}
          </div>

          {selectedTenantId && selectedTenant && (
            <div className="animate-fade-in space-y-4">
              <CalendarSelector 
                periods={bill.periods}
                selectedDates={selectedTenant.defaultStayDates} // Read directly from Tenant
                onSelectionChange={handleDatesChange}
                color={selectedTenant.color}
              />
              
              {/* Quick Actions */}
              <div className="flex gap-2 overflow-x-auto pb-2">
                {tenants.filter(t => t.id !== selectedTenantId).map(t => (
                  <button
                    key={t.id}
                    onClick={() => copyDatesFrom(t.id)}
                    className="whitespace-nowrap px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50"
                  >
                    Copy from {t.name}
                  </button>
                ))}
              </div>
              <div className="text-xs text-gray-400 text-center">
                 Changes are synced automatically to tenant history.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Breakdown / Edit Tab */}
      {activeTab === 'breakdown' && (
        <div className="space-y-4">
          {results.map(res => {
            const t = tenants.find(te => te.id === res.tenantId);
            const isEditing = editingResult === res.tenantId;

            return (
              <div key={res.tenantId} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full text-white text-xs flex items-center justify-center font-bold" style={{ backgroundColor: t?.color }}>
                      {t?.name.substring(0, 1)}
                    </div>
                    <span className="font-bold text-gray-700">{t?.name}</span>
                  </div>
                  {!isEditing && (
                    <div className="flex gap-2">
                      {res.isOverridden && (
                        <button onClick={() => clearOverride(res.tenantId)} className="text-xs text-red-500 underline">Reset</button>
                      )}
                      <button onClick={() => startEditing(res)} className="text-gray-400 hover:text-blue-500">
                        <Edit2 size={16} />
                      </button>
                    </div>
                  )}
                </div>

                {isEditing ? (
                  <div className="p-4 grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-gray-500">Usage ($)</label>
                      <input 
                        type="number" className="w-full border rounded p-1"
                        value={editValues.usage}
                        onChange={e => setEditValues({...editValues, usage: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Supply ($)</label>
                      <input 
                        type="number" className="w-full border rounded p-1"
                        value={editValues.supply}
                        onChange={e => setEditValues({...editValues, supply: e.target.value})}
                      />
                    </div>
                    {bill.sewerageCost > 0 && (
                      <div>
                        <label className="text-xs text-gray-500">Sewerage ($)</label>
                        <input 
                          type="number" className="w-full border rounded p-1"
                          value={editValues.sewerage}
                          onChange={e => setEditValues({...editValues, sewerage: e.target.value})}
                        />
                      </div>
                    )}
                    <div>
                      <label className="text-xs text-gray-500 font-bold">Total ($)</label>
                      <input 
                        type="number" className="w-full border rounded p-1 font-bold bg-blue-50"
                        value={editValues.total}
                        onChange={e => setEditValues({...editValues, total: e.target.value})}
                      />
                    </div>
                    <div className="col-span-2 flex justify-end gap-2 mt-2">
                      <button onClick={() => setEditingResult(null)} className="px-3 py-1 text-sm bg-gray-100 rounded">Cancel</button>
                      <button onClick={saveEditing} className="px-3 py-1 text-sm bg-blue-600 text-white rounded flex items-center gap-1">
                        <Check size={14} /> Save Override
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 text-sm space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Usage Cost:</span>
                      <span>${res.totalUsageCost.toFixed(2)}</span>
                    </div>
                    {res.periodBreakdown.map((pb, idx) => (
                      <div key={idx} className="flex justify-between text-xs text-gray-400 pl-4">
                        <span>Period {idx + 1} ({pb.stayDays} days):</span>
                        <span>${pb.usageCost.toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between">
                      <span className="text-gray-500">Supply Share:</span>
                      <span>${res.supplyShare.toFixed(2)}</span>
                    </div>
                    {bill.sewerageCost > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Sewerage Share:</span>
                        <span>${res.sewerageShare.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="border-t pt-2 mt-2 flex justify-between font-bold">
                      <span>Total:</span>
                      <span className="text-blue-600">${res.total.toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}