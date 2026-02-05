import { ref } from 'vue';
import type { ApiResponse } from '../types/api';

export const apiData = ref<ApiResponse | null>(null);
export const connectionStatus = ref<'connected' | 'disconnected' | 'loading'>('disconnected');
export const apiUrl = ref<string>('/api');
export const fetchError = ref<string | null>(null);