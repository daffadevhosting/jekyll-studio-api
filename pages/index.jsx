import React, { useState, useEffect } from 'react';

const HomePage = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Connecting...');

  useEffect(() => {
    // Simulate a connection attempt
    const timer = setTimeout(() => {
      // In a real application, you would check the actual API connection here
      const success = Math.random() > 0.2; // 80% chance of success

      if (success) {
        setIsConnected(true);
        setStatusMessage('Connected!');
      } else {
        setIsConnected(false);
        setStatusMessage('Disconnected. Please try again.');
      }
    }, 2000); // Simulate 2 seconds connection time

    return () => clearTimeout(timer); // Cleanup the timer
  }, []);

  const containerStyle = {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    backgroundColor: '#1a1a2e', // Dark background
    color: '#e0e0e0', // Light text
    fontFamily: 'Arial, sans-serif',
    textAlign: 'center',
  };

  const statusBoxStyle = {
    padding: '30px 50px',
    borderRadius: '15px',
    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)', // Deep shadow
    backgroundColor: isConnected ? '#28a745' : '#dc3545', // Green for connected, red for disconnected
    transition: 'background-color 0.5s ease-in-out',
    animation: isConnected ? 'pulse 1.5s infinite' : 'none', // Pulse animation for connected
  };

  const headingStyle = {
    fontSize: '2.5em',
    marginBottom: '20px',
    color: '#ffffff',
  };

  const messageStyle = {
    fontSize: '1.2em',
    fontWeight: 'bold',
  };

  


  return (
    <div style={containerStyle}>
      <div style={statusBoxStyle}>
      <span className="material-symbols-outlined" style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px' }}>
        Jekyll Studio
      </span>
        <h1 style={headingStyle}>API Status</h1>
        <p style={messageStyle}>{statusMessage}</p>
      </div>
    </div>
  );
};

export default HomePage;