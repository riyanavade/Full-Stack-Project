import React, { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { createOrder, verifyPayment, resetPaymentState } from '../redux/paymentSlice';

const PaymentButton = ({ rideId, fare, onSuccess }) => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const user = useSelector((state) => state.auth.user);
    const { loading, currentOrder, error, success } = useSelector((state) => state.payment);
    const [scriptLoaded, setScriptLoaded] = useState(Boolean(window.Razorpay));
    const [scriptError, setScriptError] = useState(null);

    // Load Razorpay Script dynamically
    useEffect(() => {
        if (window.Razorpay) {
            setScriptLoaded(true);
            return undefined;
        }

        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.async = true;
        script.onload = () => setScriptLoaded(true);
        script.onerror = () => setScriptError('Unable to load Razorpay checkout. Please check your connection.');
        document.body.appendChild(script);
        return () => {
            if (script.parentNode) {
                script.parentNode.removeChild(script);
            }
        };
    }, []);

    // Effect to trigger Razorpay modal when order is created successfully
    useEffect(() => {
        if (currentOrder && window.Razorpay) {
            const options = {
                key: currentOrder.keyId,
                amount: currentOrder.amount, // Amount is in paise
                currency: currentOrder.currency,
                name: 'TrackMyRide',
                description: 'Ride fare payment',
                order_id: currentOrder.orderId,
                handler: function (response) {
                    // On success, verify the signature
                    const verificationData = {
                        razorpayOrderId: response.razorpay_order_id,
                        razorpayPaymentId: response.razorpay_payment_id,
                        razorpaySignature: response.razorpay_signature,
                    };
                    dispatch(verifyPayment(verificationData));
                },
                prefill: {
                    name: user?.name || '',
                    email: user?.email || '',
                    contact: user?.phone || ''
                },
                theme: {
                    color: '#2563eb'
                }
            };
            
            const rzp = new window.Razorpay(options);
            
            rzp.on('payment.failed', function () {
                dispatch(resetPaymentState());
                navigate('/payment-failed');
            });

            rzp.open();
        }
    }, [currentOrder, dispatch, navigate, user]);

    // Handle verification success
    useEffect(() => {
        if (success) {
            dispatch(resetPaymentState());
            if (onSuccess) onSuccess();
            navigate('/payment-success');
        }
    }, [success, dispatch, navigate, onSuccess]);

    const handlePaymentClick = useCallback(() => {
        if (rideId && scriptLoaded) {
            dispatch(createOrder(rideId));
        }
    }, [dispatch, rideId, scriptLoaded]);

    return (
        <div className="mt-4">
            {(error || scriptError) && <p className="text-red-500 mb-2">{error || scriptError}</p>}
            <button 
                onClick={handlePaymentClick} 
                disabled={loading || !scriptLoaded || !rideId}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center"
            >
                {loading || !scriptLoaded ? (
                    <svg className="animate-spin h-5 w-5 mr-3 text-white" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                ) : (
                    `Proceed to Payment (Rs. ${fare || 0})`
                )}
            </button>
        </div>
    );
};

export default PaymentButton;
