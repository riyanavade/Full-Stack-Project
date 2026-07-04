import React, { useState, useEffect, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate, Link } from 'react-router-dom';
import {
  updateDriverLocation,
  startBooking,
  driverAssigned,
  setBookingId,
  setPickup,
  setDropoff,
  setUserLocation,
  setEstimates,
  setError,
  setPaymentPaid,
  resetRide,
  completeRide,
} from '../redux/rideSlice';
import { logout } from '../redux/authSlice';
import { io } from 'socket.io-client';
import axios from 'axios';
import MapComponent from '../components/MapComponent';
import LocationPicker from '../components/LocationPicker';
import DriverTracker from '../components/DriverTracker';
import PaymentButton from '../components/PaymentButton';
import { API_BASE_URL, SOCKET_URL } from '../config';

const UserDashboard = () => {
  const user = useSelector((state) => state.auth.user);
  const ride = useSelector((state) => state.ride);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [socket, setSocket] = useState(null);

  const isDriver = user?.role === 'driver';
  const [pendingRides, setPendingRides] = useState([]);
  const [acceptNotification, setAcceptNotification] = useState(null);
  const [acceptingRideId, setAcceptingRideId] = useState(null);
  const [acceptError, setAcceptError] = useState('');

  // Socket.IO connection
  useEffect(() => {
    const newSocket = io(SOCKET_URL);
    setSocket(newSocket);

    newSocket.on('locationUpdate', (data) => {
      dispatch(updateDriverLocation(data));
    });

    newSocket.on('rideRequest', (booking) => {
      // Deduplicate by booking _id so refreshes don't add duplicate cards
      setPendingRides((prev) => {
        const alreadyExists = prev.some((r) => r._id === booking._id);
        return alreadyExists ? prev : [...prev, booking];
      });
    });

    newSocket.on('rideAccepted', (data) => {
      dispatch(driverAssigned({ bookingId: data.bookingId }));
      setAcceptNotification("Driver accepted your request! They are arriving soon.");
      setTimeout(() => {
        setAcceptNotification(null);
      }, 6000);
    });

    newSocket.on('rideCompleted', (data) => {
      dispatch(completeRide());
      setAcceptNotification("You have arrived at your destination! Ride completed.");
      setTimeout(() => {
        setAcceptNotification(null);
      }, 6000);
    });

    return () => newSocket.close();
  }, [dispatch]);

  // Get user's current location on mount
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          dispatch(
            setUserLocation({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            })
          );
        },
        () => {
          // Silently fail – user can still manually pick locations
        },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
      );
    }
  }, [dispatch]);

  // Calculate distance between two points (Haversine)
  const calculateDistance = useCallback((p1, p2) => {
    if (!p1 || !p2) return null;
    const R = 6371;
    const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
    const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((p1.lat * Math.PI) / 180) *
        Math.cos((p2.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }, []);

  // Update estimates when pickup/dropoff change
  useEffect(() => {
    if (ride.pickup && ride.dropoff) {
      const dist = calculateDistance(ride.pickup, ride.dropoff);
      if (dist !== null) {
        dispatch(
          setEstimates({
            estimatedDistance: dist,
            estimatedDuration: Math.ceil((dist / 30) * 60), // ~30 km/h avg, in minutes
          })
        );
      }
    }
  }, [ride.pickup, ride.dropoff, calculateDistance, dispatch]);

  const handlePickupChange = (location) => {
    dispatch(setPickup(location));
  };

  const handleDropoffChange = (location) => {
    dispatch(setDropoff(location));
  };

  const handleBookRide = async () => {
    if (!ride.pickup || !ride.dropoff) return;

    const fare = ride.estimatedDistance
      ? Math.round(ride.estimatedDistance * 12)
      : 0;

    dispatch(startBooking());
    dispatch(setError(null));

    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API_BASE_URL}/api/rides/book`,
        {
          pickupLocation: ride.pickup,
          dropoffLocation: ride.dropoff,
          fare,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      dispatch(setBookingId(response.data.bookingId));

      if (socket) {
        socket.emit('joinRide', { bookingId: response.data.bookingId });
      }
    } catch (err) {
      dispatch(
        setError(
          err.response?.data?.message || 'Failed to book ride. Please try again.'
        )
      );
    }
  };

  const handleCancelRide = () => {
    dispatch(resetRide());
  };

  const handleAcceptRide = async (bookingId, idx) => {
    setAcceptingRideId(bookingId);
    setAcceptError('');

    try {
      const token = localStorage.getItem('token');
      const response = await axios.put(
        `${API_BASE_URL}/api/rides/accept/${bookingId}`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      dispatch(driverAssigned({ bookingId }));

      if (socket) {
        socket.emit('joinRide', { bookingId });
      }

      setPendingRides((prev) => prev.filter((rideRequest, i) => (
        i !== idx && rideRequest._id !== response.data.booking?._id
      )));
    } catch (err) {
      console.error('Error accepting ride:', err);
      setAcceptError(err.response?.data?.message || 'Unable to accept ride. Please try again.');
    } finally {
      setAcceptingRideId(null);
    }
  };

  const handleCompleteRide = async () => {
    if (!ride.bookingId) return;
    try {
      const token = localStorage.getItem('token');
      await axios.put(
        `${API_BASE_URL}/api/rides/complete/${ride.bookingId}`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      dispatch(completeRide());
    } catch (err) {
      console.error('Error completing ride:', err);
    }
  };

  const handlePaymentSuccess = () => {
    dispatch(setPaymentPaid());
  };

  const handleLogout = () => {
    dispatch(logout());
    navigate('/login');
  };

  const estimatedFare = ride.estimatedDistance
    ? Math.round(ride.estimatedDistance * 12)
    : null;

  const driverDistance = ride.driverLocation && ride.pickup
    ? calculateDistance(ride.driverLocation, ride.pickup)
    : null;

  const driverEta = driverDistance !== null
    ? Math.max(1, Math.ceil((driverDistance / 30) * 60))
    : null;

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Nav Bar */}
      <nav className="bg-gray-800 px-6 py-4 shadow-md flex justify-between items-center border-b border-gray-700">
        <div className="flex items-center gap-6">
          <h1 className="text-xl font-bold text-blue-500">TrackMyRide</h1>
          <div className="hidden sm:flex items-center gap-4 text-sm">
            <Link
              to="/dashboard"
              className="text-gray-300 hover:text-white transition-colors"
            >
              Dashboard
            </Link>
            <Link
              to="/payment-history"
              className="text-gray-300 hover:text-white transition-colors"
            >
              Payment History
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="bg-blue-600/20 text-blue-400 px-3 py-1 rounded-full text-sm font-semibold capitalize">
            {user?.role || 'Passenger'}
          </span>
          <span className="text-gray-300 text-sm">
            Welcome, {user?.name || 'User'}
          </span>
          <button
            onClick={handleLogout}
            className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded-lg text-sm font-medium transition-all"
          >
            Logout
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <div className="flex-1 flex p-6 gap-6">
        {/* Sidebar */}
        <div className="w-96 shrink-0 flex flex-col gap-4">
          {isDriver ? (
            /* ===== DRIVER VIEW ===== */
            <>
              <div className="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700">
                <h2 className="text-2xl font-semibold mb-4">Driver Mode</h2>
                <DriverTracker socket={socket} bookingId={ride.bookingId} userId={user?.id} />
              </div>
              
              {ride.bookingId && (
                <div className="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700">
                  <h3 className="text-lg font-bold text-green-400 mb-3">
                    Active Ride
                  </h3>
                  <div className="bg-gray-700/50 p-4 rounded-lg border border-gray-600 space-y-2">
                    <p className="text-sm text-gray-300 font-semibold">Status: On the way to pickup</p>
                    <div className="flex justify-between items-center mt-4">
                      <button
                        onClick={handleCompleteRide}
                        className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded-lg w-full transition-all"
                      >
                        Complete Ride
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700 flex-1 overflow-y-auto">
                <h3 className="text-lg font-semibold mb-3 text-gray-200">
                  Pending Ride Requests
                </h3>
                {acceptError && (
                  <p className="mb-3 rounded-lg border border-red-500/40 bg-red-900/30 px-3 py-2 text-sm text-red-200">
                    {acceptError}
                  </p>
                )}
                {pendingRides.length === 0 ? (
                  <p className="text-sm text-gray-400">
                    No pending requests at the moment. Go online to start receiving ride requests.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {pendingRides.map((req, idx) => (
                      <div key={req._id || idx} className="bg-gray-700/50 p-4 rounded-lg border border-gray-600">
                        <div className="flex justify-between items-start mb-2">
                          <p className="text-sm text-gray-300 font-bold">🔔 New Ride Request</p>
                          <button
                            onClick={() => setPendingRides((prev) => prev.filter((_, i) => i !== idx))}
                            className="text-gray-500 hover:text-gray-300 text-xs ml-2"
                          >✕ Dismiss</button>
                        </div>
                        <p className="text-xs text-gray-400 mb-1"><span className="text-gray-500">From: </span>{req.pickupLocation?.address || 'Unknown'}</p>
                        <p className="text-xs text-gray-400 mb-2"><span className="text-gray-500">To: </span>{req.dropoffLocation?.address || 'Unknown'}</p>
                        <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-600/50">
                          <span className="text-green-400 font-bold text-lg">₹{req.fare}</span>
                          <button
                            onClick={() => handleAcceptRide(req._id, idx)}
                            disabled={acceptingRideId === req._id}
                            className="bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm font-semibold py-1.5 px-4 rounded-lg"
                          >
                            {acceptingRideId === req._id ? 'Accepting...' : 'Accept'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* ===== PASSENGER VIEW ===== */
            <>
              <div className="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700">
                <h2 className="text-2xl font-semibold mb-4">Book a Ride</h2>

                <LocationPicker
                  onPickupChange={handlePickupChange}
                  onDropoffChange={handleDropoffChange}
                  pickup={ride.pickup}
                  dropoff={ride.dropoff}
                />

                {/* Fare Estimate */}
                {ride.estimatedDistance && (
                  <div className="mt-4 p-4 bg-gray-700/50 rounded-lg border border-gray-600/50">
                    <div className="flex justify-between text-sm text-gray-300 mb-1">
                      <span>Distance</span>
                      <span className="text-white font-medium">
                        {ride.estimatedDistance.toFixed(1)} km
                      </span>
                    </div>
                    <div className="flex justify-between text-sm text-gray-300 mb-1">
                      <span>Est. Duration</span>
                      <span className="text-white font-medium">
                        ~{ride.estimatedDuration} min
                      </span>
                    </div>
                    <div className="flex justify-between text-sm text-gray-300 pt-2 border-t border-gray-600/50">
                      <span className="font-medium">Estimated Fare</span>
                      <span className="text-green-400 font-bold text-lg">
                        ₹{estimatedFare}
                      </span>
                    </div>
                  </div>
                )}

                {/* Error */}
                {ride.error && (
                  <p className="mt-3 text-sm text-red-400">{ride.error}</p>
                )}

                {/* Request / Cancel buttons */}
                {ride.status === 'idle' ? (
                  <button
                    onClick={handleBookRide}
                    disabled={!ride.pickup || !ride.dropoff}
                    className="mt-4 w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed py-3 rounded-lg font-bold transition-all shadow-lg shadow-blue-500/30 disabled:shadow-none"
                  >
                    Request Ride
                  </button>
                ) : (
                  <button
                    onClick={handleCancelRide}
                    className="mt-4 w-full bg-red-600 hover:bg-red-700 py-3 rounded-lg font-bold transition-all shadow-lg shadow-red-500/30"
                  >
                    Cancel Ride
                  </button>
                )}
              </div>

              {/* Ride Status Card */}
              {ride.status !== 'idle' && (
                <div className="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700">
                  {ride.status === 'finding_driver' && (
                    <div className="flex items-center gap-3">
                      <svg
                        className="animate-spin h-5 w-5 text-blue-400"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      <span className="text-gray-200">
                        Searching for nearby drivers...
                      </span>
                    </div>
                  )}

                  {ride.status === 'driver_assigned' && (
                    <div>
                      <h3 className="text-lg font-bold text-green-400 mb-2">
                        Driver is on the way!
                      </h3>
                      {driverEta !== null ? (
                        <div className="bg-blue-900/30 border border-blue-500/30 p-3 rounded-lg mb-3">
                          <p className="text-sm font-semibold text-blue-300">
                            Arriving within {driverEta} {driverEta === 1 ? 'minute' : 'minutes'}.
                          </p>
                        </div>
                      ) : (
                        <div className="bg-gray-700/30 p-3 rounded-lg mb-3">
                          <p className="text-sm text-gray-400 italic">
                            Calculating driver arrival time...
                          </p>
                        </div>
                      )}
                      {ride.driverLocation && (
                        <div className="text-sm text-gray-300 space-y-1">
                          <p>Lat: {ride.driverLocation.lat.toFixed(4)}</p>
                          <p>Lng: {ride.driverLocation.lng.toFixed(4)}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {ride.status === 'in_progress' && (
                    <div>
                      <h3 className="text-lg font-bold text-blue-400 mb-2">
                        Ride in progress
                      </h3>
                      {ride.driverLocation && (
                        <div className="text-sm text-gray-300 space-y-1">
                          <p>Lat: {ride.driverLocation.lat.toFixed(4)}</p>
                          <p>Lng: {ride.driverLocation.lng.toFixed(4)}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {ride.status === 'completed' && (
                    <div className="space-y-4">
                      <h3 className="text-lg font-bold text-green-400">
                        Ride completed!
                      </h3>
                      {ride.paymentStatus === 'paid' ? (
                        <div className="rounded-lg bg-green-800/80 p-4 border border-green-500 text-green-100">
                          Payment completed successfully.
                        </div>
                      ) : (
                        <PaymentButton
                          rideId={ride.bookingId}
                          fare={estimatedFare}
                          onSuccess={handlePaymentSuccess}
                        />
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Map Area */}
        <div className="flex-1 bg-gray-800 rounded-xl overflow-hidden border border-gray-700 relative">
          <MapComponent
            pickup={ride.pickup}
            dropoff={ride.dropoff}
            driverLocation={ride.driverLocation}
            userLocation={ride.userLocation}
          />
        </div>
      </div>

      {/* Floating Notification */}
      {acceptNotification && (
        <div className="fixed top-4 right-4 z-50 bg-green-600/90 backdrop-blur-md text-white px-6 py-4 rounded-xl shadow-2xl border border-green-500/50 flex items-center gap-3 animate-bounce">
          <div className="bg-green-500 p-2 rounded-full text-lg">🔔</div>
          <div>
            <h4 className="font-bold text-white">Ride Status</h4>
            <p className="text-sm text-green-100">{acceptNotification}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserDashboard;
