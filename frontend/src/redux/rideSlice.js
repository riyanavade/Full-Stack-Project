import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  bookingId: null,
  pickup: null, // { lat, lng, address }
  dropoff: null, // { lat, lng, address }
  userLocation: null, // { lat, lng }
  driverLocation: null, // { lat, lng }
  status: 'idle', // idle, finding_driver, driver_assigned, in_progress, completed
  paymentStatus: 'unpaid',
  estimatedDistance: null,
  estimatedDuration: null,
  error: null,
};

const rideSlice = createSlice({
  name: 'ride',
  initialState,
  reducers: {
    // Existing reducers
    startBooking: (state) => {
      state.status = 'finding_driver';
    },
    driverAssigned: (state, action) => {
      state.status = 'driver_assigned';
      state.bookingId = action.payload.bookingId;
    },
    updateDriverLocation: (state, action) => {
      state.driverLocation = action.payload; // { lat, lng }
    },
    completeRide: (state) => {
      state.status = 'completed';
      state.driverLocation = null;
      state.paymentStatus = 'unpaid';
    },
    setPaymentPaid: (state) => {
      state.paymentStatus = 'paid';
    },

    // New reducers
    setBookingId: (state, action) => {
      state.bookingId = action.payload;
    },
    setPickup: (state, action) => {
      state.pickup = action.payload;
    },
    setDropoff: (state, action) => {
      state.dropoff = action.payload;
    },
    setUserLocation: (state, action) => {
      state.userLocation = action.payload;
    },
    setEstimates: (state, action) => {
      state.estimatedDistance = action.payload.estimatedDistance;
      state.estimatedDuration = action.payload.estimatedDuration;
    },
    setError: (state, action) => {
      state.error = action.payload;
    },
    resetRide: () => initialState,
  },
});

export const {
  startBooking,
  driverAssigned,
  updateDriverLocation,
  completeRide,
  setBookingId,
  setPickup,
  setDropoff,
  setUserLocation,
  setEstimates,
  setError,
  setPaymentPaid,
  resetRide,
} = rideSlice.actions;

export default rideSlice.reducer;
