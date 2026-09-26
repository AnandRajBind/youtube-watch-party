import axios, { AxiosError } from 'axios';
import type { AxiosInstance } from 'axios';
import type {
  ApiResponse,
  CreateRoomRequest,
  CreateRoomResponse,
  HealthResponse,
  JoinRoomRequest,
  JoinRoomResponse,
  SafeRoomDto,
} from '../types/room.types';

// Ensure baseURL points to the /api namespace
const getApiBaseUrl = (): string => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (!envUrl) {
    return 'http://localhost:5000/api';
  }
  // Trim trailing slash
  const trimmed = envUrl.replace(/\/+$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
};

export class AppApiError extends Error {
  public code: string;
  public details?: Record<string, string[]>;
  public statusCode?: number;

  constructor(message: string, code: string = 'API_ERROR', statusCode?: number, details?: Record<string, string[]>) {
    super(message);
    this.name = 'AppApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const apiClient: AxiosInstance = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor for consistent error extraction
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ success?: boolean; error?: { code?: string; message?: string; details?: Record<string, string[]> } }>) => {
    if (error.response) {
      const errorData = error.response.data?.error;
      const message = errorData?.message || 'A server error occurred. Please try again.';
      const code = errorData?.code || `HTTP_${error.response.status}`;
      return Promise.reject(new AppApiError(message, code, error.response.status, errorData?.details));
    }

    if (error.code === 'ECONNABORTED') {
      return Promise.reject(
        new AppApiError('Request timed out. The server took too long to respond.', 'TIMEOUT')
      );
    }

    if (error.request) {
      return Promise.reject(
        new AppApiError(
          'Unable to reach server. Please check your network connection or verify the backend is running.',
          'NETWORK_ERROR'
        )
      );
    }

    return Promise.reject(new AppApiError(error.message || 'An unexpected error occurred.', 'UNKNOWN_ERROR'));
  }
);

/**
 * REST API Service Functions (Matching exact backend routes)
 */
export const roomApiService = {
  /**
   * POST /api/rooms
   * Creates a new watch party room.
   */
  async createRoom(data: CreateRoomRequest): Promise<CreateRoomResponse> {
    const response = await apiClient.post<ApiResponse<CreateRoomResponse>>('/rooms', data);
    return response.data.data;
  },

  /**
   * GET /api/rooms/:roomCode
   * Fetches safe room metadata and authoritative playback state.
   */
  async getRoom(roomCode: string): Promise<SafeRoomDto> {
    const sanitizedCode = roomCode.trim().toUpperCase();
    const response = await apiClient.get<ApiResponse<SafeRoomDto>>(`/rooms/${sanitizedCode}`);
    return response.data.data;
  },

  /**
   * POST /api/rooms/:roomCode/join
   * Joins an existing room via REST before WebSocket connection.
   */
  async joinRoom(roomCode: string, data: JoinRoomRequest): Promise<JoinRoomResponse> {
    const sanitizedCode = roomCode.trim().toUpperCase();
    const response = await apiClient.post<ApiResponse<JoinRoomResponse>>(`/rooms/${sanitizedCode}/join`, data);
    return response.data.data;
  },

  /**
   * GET /api/health
   * Checks backend system health and MongoDB status.
   */
  async checkHealth(): Promise<HealthResponse> {
    const response = await apiClient.get<HealthResponse>('/health');
    return response.data;
  },
};
