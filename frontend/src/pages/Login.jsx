import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { loginSuccess } from '../redux/authSlice';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { API_BASE_URL } from '../config';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${API_BASE_URL}/api/auth/login`, { email, password });
      dispatch(loginSuccess(res.data));
      navigate(res.data.user.role === 'admin' ? '/admin-dashboard' : '/user-dashboard');
    } catch (err) {
      alert(err.response?.data?.message || 'Login failed');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="bg-gray-800 p-8 rounded-xl shadow-lg w-full max-w-md border border-gray-700">
        <h2 className="text-3xl font-bold text-white text-center mb-6">Driver Tracking</h2>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-gray-300">Email</label>
            <input 
              type="email" 
              className="w-full mt-1 p-3 rounded bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500" 
              value={email} onChange={(e) => setEmail(e.target.value)} required 
            />
          </div>
          <div>
            <label className="text-gray-300">Password</label>
            <input 
              type="password" 
              className="w-full mt-1 p-3 rounded bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500" 
              value={password} onChange={(e) => setPassword(e.target.value)} required 
            />
          </div>
          <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded transition-all">
            Login
          </button>
        </form>
        <div className="mt-4 text-center">
          <p className="text-gray-400">Don't have an account? <Link to="/signup" className="text-blue-500 hover:underline">Sign up</Link></p>
        </div>
      </div>
    </div>
  );
};

export default Login;
