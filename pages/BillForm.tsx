import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { Plus, Trash2, Calendar, DollarSign, Users, ArrowLeft, Sparkles, Loader2, Camera } from 'lucide-react';
import { db } from '../services/db';
import { Bill, BillType, Period, Tenant } from '../types';
import { BILL_TYPE_LABELS } from '../constants';
import { format, isValid, parseISO } from 'date-fns';
import { analyzeBillImage } from '../services/ai';

export default function BillForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  
  const [name, setName] = useState('');
  const [type, setType] = useState<BillType>(BillType.ELECTRICITY);
  const [supplyCost, setSupplyCost] = useState('');
  const [sewerageCost, setSewerageCost] = useState('');
  const [includedTenantIds, setIncludedTenantIds] = useState<string[]>([]);
  
  const [periods, setPeriods] = useState<Period[]>([
    { id: uuidv4(), startDate: format(new Date(), 'yyyy-MM-dd'), endDate: format(new Date(), 'yyyy-MM-dd'), usageCost: 0 }
  ]);

  const [isScanning, setIsScanning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const init = async () => {
      const allTenants = await db.getTenants();
      setTenants(allTenants);
      // Default select all tenants
      setIncludedTenantIds(allTenants.map(t => t.id));

      if (id) {
        const bill = await db.getBill(id);
        if (bill) {
          setName(bill.name);
          setType(bill.type);
          setSupplyCost(bill.supplyCost.toString());
          setSewerageCost(bill.sewerageCost.toString());
          setIncludedTenantIds(bill.includedTenantIds);
          setPeriods(bill.periods);
        }
      }
    };
    init();
  }, [id]);

  const handlePeriodChange = (idx: number, field: keyof Period, value: string | number) => {
    const newPeriods = [...periods];
    newPeriods[idx] = { ...newPeriods[idx], [field]: value };
    setPeriods(newPeriods);
  };

  const addPeriod = () => {
    setPeriods([...periods, { id: uuidv4(), startDate: '', endDate: '', usageCost: 0 }]);
  };

  const removePeriod = (idx: number) => {
    if (periods.length > 1) {
      setPeriods(periods.filter((_, i) => i !== idx));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (periods.some(p => !p.startDate || !p.endDate)) {
      alert("Please fill in all dates.");
      return;
    }

    const newBill: Bill = {
      id: id || uuidv4(),
      name: name || `${BILL_TYPE_LABELS[type]} Bill`,
      type,
      periods,
      supplyCost: parseFloat(supplyCost) || 0,
      sewerageCost: parseFloat(sewerageCost) || 0,
      includedTenantIds,
      createdAt: id ? (await db.getBill(id))?.createdAt || Date.now() : Date.now()
    };

    await db.saveBill(newBill);

    // If new bill, init stays based on defaults
    if (!id) {
      const stays = { billId: newBill.id, tenantStays: {} as Record<string, string[]> };
      await db.saveBillStays(stays);
    }

    navigate(`/bill/${newBill.id}`);
  };

  const toggleTenant = (tId: string) => {
    if (includedTenantIds.includes(tId)) {
      setIncludedTenantIds(includedTenantIds.filter(id => id !== tId));
    } else {
      setIncludedTenantIds([...includedTenantIds, tId]);
    }
  };

  // --- AI Scanning Logic ---
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    try {
      // Convert to Base64
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        try {
          const data = await analyzeBillImage(base64);
          
          // Apply extracted data
          if (data.type) setType(data.type);
          if (data.suggestedName) setName(data.suggestedName);
          if (data.supplyCost !== undefined) setSupplyCost(data.supplyCost.toString());
          if (data.sewerageCost !== undefined) setSewerageCost(data.sewerageCost.toString());
          
          if (data.periods && data.periods.length > 0) {
            const mappedPeriods = data.periods.map(p => ({
              id: uuidv4(),
              startDate: isValid(parseISO(p.startDate)) ? p.startDate : format(new Date(), 'yyyy-MM-dd'),
              endDate: isValid(parseISO(p.endDate)) ? p.endDate : format(new Date(), 'yyyy-MM-dd'),
              usageCost: p.usageCost
            }));
            setPeriods(mappedPeriods);
          }
          
          alert('Bill scanned successfully! Please review the details.');
        } catch (err) {
          console.error(err);
          alert('Failed to analyze bill. Please try again or enter details manually.');
        } finally {
          setIsScanning(false);
          // Reset input
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      setIsScanning(false);
    }
  };

  return (
    <div className="pb-10">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <button onClick={() => navigate(-1)} className="mr-4 p-2 rounded-full hover:bg-gray-100">
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-2xl font-bold">{id ? 'Edit Bill' : 'New Bill'}</h1>
        </div>
        
        {!id && (
          <button 
            type="button"
            disabled={isScanning}
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2 rounded-full shadow-md hover:opacity-90 transition-all disabled:opacity-50 text-sm font-medium"
          >
            {isScanning ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            <span>{isScanning ? 'Scanning...' : 'Scan Bill'}</span>
          </button>
        )}
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept="image/*"
          onChange={handleFileSelect}
        />
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* Basic Info */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bill Name (Optional)</label>
            <input 
              type="text" 
              value={name} 
              onChange={e => setName(e.target.value)} 
              placeholder="e.g. June Electricity"
              className="w-full border rounded-lg p-3"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <div className="flex bg-gray-100 p-1 rounded-lg">
              {(Object.keys(BILL_TYPE_LABELS) as BillType[]).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${type === t ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  {BILL_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Periods */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Calendar size={18} /> Usage Periods
            </h3>
            <button type="button" onClick={addPeriod} className="text-xs text-blue-600 font-medium flex items-center gap-1">
              <Plus size={14} /> Add Period
            </button>
          </div>
          
          <div className="space-y-4">
            {periods.map((period, idx) => (
              <div key={period.id} className="bg-gray-50 p-3 rounded-lg relative animate-fade-in">
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Start Date</label>
                    <input 
                      type="date" 
                      required
                      value={period.startDate}
                      onChange={e => handlePeriodChange(idx, 'startDate', e.target.value)}
                      className="w-full border rounded p-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">End Date</label>
                    <input 
                      type="date" 
                      required
                      value={period.endDate}
                      onChange={e => handlePeriodChange(idx, 'endDate', e.target.value)}
                      className="w-full border rounded p-2 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Usage Cost ($)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    required
                    value={period.usageCost}
                    onChange={e => handlePeriodChange(idx, 'usageCost', parseFloat(e.target.value))}
                    className="w-full border rounded p-2 text-sm"
                  />
                </div>
                {periods.length > 1 && (
                  <button type="button" onClick={() => removePeriod(idx)} className="absolute -top-2 -right-2 bg-red-100 text-red-500 p-1 rounded-full shadow-sm">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Fixed Costs */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <h3 className="font-semibold flex items-center gap-2 mb-4">
            <DollarSign size={18} /> Fixed Costs
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Supply Charge ($)</label>
              <input 
                type="number" 
                step="0.01"
                value={supplyCost}
                onChange={e => setSupplyCost(e.target.value)}
                className="w-full border rounded-lg p-2"
              />
            </div>
            {/* Show Sewerage input if Water OR if scan detected sewerage cost */}
            {(type === BillType.WATER || parseFloat(sewerageCost) > 0) && (
              <div className="animate-fade-in">
                <label className="block text-sm font-medium text-gray-700 mb-1">Sewerage Charge ($)</label>
                <input 
                  type="number" 
                  step="0.01"
                  value={sewerageCost}
                  onChange={e => setSewerageCost(e.target.value)}
                  className="w-full border rounded-lg p-2"
                />
              </div>
            )}
          </div>
        </div>

        {/* Tenants */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <h3 className="font-semibold flex items-center gap-2 mb-4">
            <Users size={18} /> Participants
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {tenants.map(t => {
              const isSelected = includedTenantIds.includes(t.id);
              return (
                <button
                  type="button"
                  key={t.id}
                  onClick={() => toggleTenant(t.id)}
                  className={`flex items-center gap-2 p-2 rounded-lg border transition-all ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 opacity-60'}`}
                >
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs text-white" style={{ backgroundColor: t.color }}>
                    {t.name.substring(0, 1)}
                  </div>
                  <span className={`text-sm ${isSelected ? 'font-medium text-blue-800' : 'text-gray-600'}`}>{t.name}</span>
                </button>
              );
            })}
          </div>
          {tenants.length === 0 && <div className="text-sm text-red-500">Please add tenants in Settings first!</div>}
        </div>

        <button type="submit" className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-lg shadow-lg hover:bg-blue-700 active:scale-[0.98] transition-all">
          Save Bill
        </button>
      </form>
    </div>
  );
}
