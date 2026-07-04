import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useSelector } from 'react-redux';
import { API_BASE_URL } from '../config';

const AdminDashboard = () => {
  const user = useSelector((state) => state.auth.user);
  const [stats, setStats] = useState({
      totalUsers: 0,
      activeDrivers: 0,
      totalBookings: 0,
      revenue: '$0',
      recentRides: []
  });

  useEffect(() => {
    // Fetch mock data from our new admin route
    const fetchStats = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/api/admin/stats`);
        setStats(res.data);
      } catch (err) {
        console.error("Failed to fetch admin stats", err);
      }
    };
    fetchStats();
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      <nav className="bg-gray-800 p-4 shadow-md flex justify-between items-center border-b border-gray-700">
        <h1 className="text-2xl font-bold text-purple-500">Admin Portal</h1>
        <div className="flex items-center gap-4">
          <span className="bg-purple-600/20 text-purple-400 px-3 py-1 rounded-full text-sm font-semibold">Administrator</span>
          <span>Welcome, {user?.name || 'Admin'}</span>
        </div>
      </nav>

      <div className="flex-1 flex p-6 gap-6">
        
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col gap-6">
          
          {/* Stats Row */}
          <div className="grid grid-cols-4 gap-6">
            <div className="bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700">
              <h3 className="text-gray-400 text-sm font-semibold uppercase tracking-wider mb-2">Total Users</h3>
              <p className="text-3xl font-bold text-white">{stats.totalUsers}</p>
            </div>
            <div className="bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700">
              <h3 className="text-gray-400 text-sm font-semibold uppercase tracking-wider mb-2">Active Drivers</h3>
              <p className="text-3xl font-bold text-green-400">{stats.activeDrivers}</p>
            </div>
            <div className="bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700">
              <h3 className="text-gray-400 text-sm font-semibold uppercase tracking-wider mb-2">Total Bookings</h3>
              <p className="text-3xl font-bold text-blue-400">{stats.totalBookings}</p>
            </div>
            <div className="bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700">
              <h3 className="text-gray-400 text-sm font-semibold uppercase tracking-wider mb-2">Revenue</h3>
              <p className="text-3xl font-bold text-purple-400">{stats.revenue}</p>
            </div>
          </div>

          {/* Recent Rides Table */}
          <div className="bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700 flex-1">
            <h2 className="text-xl font-bold mb-4 border-b border-gray-700 pb-2">Recent Rides</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-gray-400 border-b border-gray-700">
                    <th className="py-3 px-4 font-semibold uppercase text-xs tracking-wider">ID</th>
                    <th className="py-3 px-4 font-semibold uppercase text-xs tracking-wider">Passenger</th>
                    <th className="py-3 px-4 font-semibold uppercase text-xs tracking-wider">Status</th>
                    <th className="py-3 px-4 font-semibold uppercase text-xs tracking-wider">Fare</th>
                    <th className="py-3 px-4 font-semibold uppercase text-xs tracking-wider">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentRides.map((ride) => (
                    <tr key={ride.id} className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors">
                      <td className="py-3 px-4 text-gray-300">#{ride.id}</td>
                      <td className="py-3 px-4 text-white font-medium">{ride.passenger}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                          ride.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                          ride.status === 'in-progress' ? 'bg-blue-500/20 text-blue-400' :
                          'bg-yellow-500/20 text-yellow-400'
                        }`}>
                          {ride.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-300">{ride.fare}</td>
                      <td className="py-3 px-4 text-gray-400">{ride.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {stats.recentRides.length === 0 && (
                <div className="text-center text-gray-500 py-8">No recent rides found.</div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
