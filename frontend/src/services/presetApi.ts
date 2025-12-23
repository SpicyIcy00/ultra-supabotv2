/**
 * Preset API Service
 *
 * Functions for interacting with the preset API endpoints
 */

import axios from 'axios';
import type {
  ReportPreset,
  PresetCreateRequest,
  PresetUpdateRequest,
  PresetListResponse,
} from '../types/preset';

// Get base URL and ensure /api/v1 is handled consistently
const BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || 'http://localhost:8000';
const API_BASE_URL = BASE_URL.replace(/\/$/, '').replace(/\/api\/v1$/, '');
const API_V1_PREFIX = '/api/v1';

/**
 * Fetch all presets, optionally filtered by report type
 */
export const fetchPresets = async (reportType?: string): Promise<PresetListResponse> => {
  const params = reportType ? { report_type: reportType } : {};
  const response = await axios.get<PresetListResponse>(
    `${API_BASE_URL}${API_V1_PREFIX}/report-presets`,
    { params }
  );
  return response.data;
};

/**
 * Fetch a specific preset by ID
 */
export const fetchPreset = async (presetId: number): Promise<ReportPreset> => {
  const response = await axios.get<ReportPreset>(
    `${API_BASE_URL}${API_V1_PREFIX}/report-presets/${presetId}`
  );
  return response.data;
};

/**
 * Create a new preset
 */
export const createPreset = async (data: PresetCreateRequest): Promise<ReportPreset> => {
  const response = await axios.post<ReportPreset>(
    `${API_BASE_URL}${API_V1_PREFIX}/report-presets`,
    data
  );
  return response.data;
};

/**
 * Update an existing preset
 */
export const updatePreset = async (
  presetId: number,
  data: PresetUpdateRequest
): Promise<ReportPreset> => {
  const response = await axios.put<ReportPreset>(
    `${API_BASE_URL}${API_V1_PREFIX}/report-presets/${presetId}`,
    data
  );
  return response.data;
};

/**
 * Delete a preset
 */
export const deletePreset = async (presetId: number): Promise<void> => {
  await axios.delete(`${API_BASE_URL}${API_V1_PREFIX}/report-presets/${presetId}`);
};

/**
 * Set a preset as the default for its report type
 */
export const setDefaultPreset = async (presetId: number): Promise<ReportPreset> => {
  const response = await axios.post<ReportPreset>(
    `${API_BASE_URL}${API_V1_PREFIX}/report-presets/${presetId}/set-default`
  );
  return response.data;
};
