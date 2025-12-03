import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { ChevronRight, Droplet, Flame, Zap } from 'lucide-react';
import { db } from '../services/db';
import { Bill, BillType } from '../types';
import { BILL_TYPE_ICONS } from '../constants';

export default function Home() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBills();
  }, []);

  const loadBills = async () => {
    try {
      const data = await db.getBills();
      setBills(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const getIcon = (type: BillType) => {
    switch (type) {
      case BillType.ELECTRICITY: return <Zap className="text-yellow-500" />;
      case BillType.GAS: return <Flame className="text-orange-500" />;
      case BillType.WATER: return <Droplet className="text-blue-500" />;
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Loading bills...</div>;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-800">My Bills</h1>
        <p className="text-gray-500 text-sm">Track and split household utilities</p>
      </header>

      {bills.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="bg-blue-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <Zap className="text-blue-500" size={32} />
          </div>
          <h2 className="text-lg font-semibold text-gray-700">No bills yet</h2>
          <p className="text-gray-500 text-sm px-8 mt-2 mb-6">Create your first utility bill to start tracking expenses.</p>
          <Link to="/bill/new" className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 text-white rounded-lg font-medium shadow-md hover:bg-blue-700 transition-colors">
            Add New Bill
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {bills.map(bill => (
            <Link key={bill.id} to={`/bill/${bill.id}`} className="block group">
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between transition-transform active:scale-[0.99]">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center group-hover:bg-blue-50 transition-colors">
                    {getIcon(bill.type)}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800">{bill.name}</h3>
                    <p className="text-xs text-gray-500">
                      {bill.periods.length} period(s) • {bill.includedTenantIds.length} tenants
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {format(new Date(bill.createdAt), 'MMM d, yyyy')}
                    </p>
                  </div>
                </div>
                <ChevronRight className="text-gray-300 group-hover:text-blue-500" size={20} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
