import { apiData, connectionStatus, fetchError } from '../stores/data';
import type { ApiResponse } from '../types/api';

let fetchInterval: number | null = null;

export const startDataFetching = (url: string) => {
  stopDataFetching();
  
  const fetchData = async () => {
    try {
      if (connectionStatus.value !== 'connected') {
        connectionStatus.value = 'loading';
      }
      fetchError.value = null;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: ApiResponse = await response.json();
      apiData.value = data;
      connectionStatus.value = 'connected';
    } catch (error) {
      console.error('Failed to fetch data:', error);
      fetchError.value = error instanceof Error ? error.message : 'Unknown error occurred';
      connectionStatus.value = 'disconnected';
    }
  };

  // Initial fetch
  fetchData();
  
  // Set up interval for continuous fetching
  fetchInterval = window.setInterval(fetchData, 1000);
};

export const stopDataFetching = () => {
  if (fetchInterval !== null) {
    clearInterval(fetchInterval);
    fetchInterval = null;
  }
  connectionStatus.value = 'disconnected';
};